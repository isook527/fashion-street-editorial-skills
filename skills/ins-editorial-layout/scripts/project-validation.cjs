const fs = require('node:fs');
const path = require('node:path');
const { ensure, readJson, loadProject, evaluate, pointGuide } = require('./project-plan.cjs');

const schemaPath = (name) => path.join(__dirname, '../schema', name + '.schema.json');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const child = (parent, key) => parent === '$' ? key : parent + '.' + key;

function checkSchema(value, schema, field, root, report) {
  if (schema.$ref) {
    const target = schema.$ref.split('/').slice(1).reduce((node, part) => node[part], root);
    checkSchema(value, target, field, root, report);
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = (type) => {
    if (!type) return true;
    if (type === 'object') return object(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'integer') return Number.isSafeInteger(value);
    if (type === 'null') return value === null;
    return typeof value === type;
  };
  if (!types.some(matches)) {
    report(field, 'Expected ' + types.join(' or ') + '.');
    return;
  }
  if ('const' in schema && value !== schema.const) report(field, 'Expected ' + JSON.stringify(schema.const) + '.');
  if (schema.enum && !schema.enum.includes(value)) report(field, 'Expected one of: ' + schema.enum.join(', ') + '.');
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) report(field, 'Value does not match ' + schema.pattern + '.');
    if (schema.minLength !== undefined && value.length < schema.minLength) report(field, 'Value is too short.');
  }
  if (typeof value === 'number') {
    if (value < schema.minimum || value > schema.maximum || value <= schema.exclusiveMinimum) report(field, 'Value is outside the allowed range.');
  }
  if (Array.isArray(value)) {
    if (value.length < schema.minItems || value.length > schema.maxItems) report(field, 'Invalid number of items.');
    if (schema.uniqueItems && new Set(value).size !== value.length) report(field, 'Items must be unique.');
    if (schema.items) value.forEach((entry, index) => checkSchema(entry, schema.items, field + '[' + index + ']', root, report));
  }
  if (object(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) report(child(field, key), 'Required field is missing.');
    }
    for (const [key, item] of Object.entries(value)) {
      const spec = Object.hasOwn(schema.properties ?? {}, key) ? schema.properties[key] : schema.additionalProperties;
      if (spec) checkSchema(item, spec, child(field, key), root, report);
    }
  }
  for (const rule of schema.allOf ?? []) {
    let matched = true;
    checkSchema(value, rule.if, field, root, () => { matched = false; });
    if (matched) checkSchema(value, rule.then, field, root, report);
  }
}

function validateProject(filename) {
  const errors = [];
  const report = (field, message) => errors.push({ path: field, message });
  const validate = (data, name, field) => {
    const schema = readJson(schemaPath(name));
    checkSchema(data, schema, field, schema, report);
  };
  let project;
  try {
    project = readJson(filename);
  } catch (error) {
    report('$', error.message);
    return { ok: false, errors };
  }
  validate(project, 'project', '$');
  const profiles = {};
  for (const key of ['person', 'brand', 'product']) {
    const ref = project?.profiles?.[key];
    if (typeof ref !== 'string' || !ref) continue;
    const field = 'profiles.' + key;
    try {
      profiles[key] = readJson(path.resolve(path.dirname(filename), ref));
      validate(profiles[key], key, field);
    } catch (error) {
      report(field, 'Cannot read profile: ' + error.message);
    }
  }
  const list = (value) => Array.isArray(value) ? value : [];
  function index(items, field) {
    const ids = new Set();
    list(items).forEach((item, i) => {
      if (typeof item?.id !== 'string') return;
      if (ids.has(item.id)) report(field + '[' + i + '].id', 'Duplicate ID: ' + item.id);
      ids.add(item.id);
    });
    return ids;
  }
  const points = index(profiles.product?.points, 'profiles.product.points');
  list(profiles.product?.points).forEach((point, i) => {
    if (object(point) && !Object.hasOwn(pointGuide, point.kind) && !(point.framing && point.action && point.acceptance)) {
      report('profiles.product.points[' + i + '].kind', 'Unknown selling point kind; provide framing, action and acceptance.');
    }
  });
  const shots = index(project?.shots, 'shots');
  list(project?.shots).forEach((shot, i) => {
    if (!object(shot)) return;
    const field = 'shots[' + i + ']';
    list(shot.points).forEach((point, j) => {
      if (typeof point === 'string' && !points.has(point)) report(field + '.points[' + j + ']', 'Unknown selling point: ' + point);
    });
    const attempts = index(shot.attempts, field + '.attempts');
    if (shot.selected && !attempts.has(shot.selected)) report(field + '.selected', 'Unknown selected revision: ' + shot.selected);
  });
  if (project?.pilot?.shot && !shots.has(project.pilot.shot)) report('pilot.shot', 'Unknown pilot shot.');
  const budget = project?.budget ?? {};
  if ((budget.unitCost === undefined) !== (budget.costCap === undefined)) report('budget', 'Set unitCost and costCap together.');
  if ((budget.pilotSize ?? 1) > (budget.maxAttempts ?? Math.max(1, points.size, shots.size))) {
    report('budget.pilotSize', 'Pilot size exceeds the attempt budget.');
  }
  list(project?.feedback).forEach((entry, i) => {
    for (const field of ['saves', 'clicks']) {
      if (entry?.[field] > entry?.impressions) report('feedback[' + i + '].' + field, 'Count exceeds impressions.');
    }
  });
  // Reuse the runtime guards for invariants not expressed in the schema.
  if (!errors.length) {
    try {
      evaluate(loadProject(filename));
    } catch (error) {
      report('$', error.message);
    }
  }
  return { ok: errors.length === 0, errors };
}

function initProject(directory, mode) {
  ensure(['product', 'creative'].includes(mode), 'Choose --mode product or creative.');
  const dir = path.resolve(directory);
  fs.mkdirSync(dir);
  fs.mkdirSync(path.join(dir, 'profiles'));
  fs.mkdirSync(path.join(dir, 'assets'));
  const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  const relativeSchema = path.relative(dir, schemaPath('project')).split(path.sep).join('/');
  write('project.json', { $schema: relativeSchema.startsWith('.') ? relativeSchema : './' + relativeSchema, version: 1, mode,
    profiles: { person: 'profiles/person.json', brand: 'profiles/brand.json', product: 'profiles/product.json' },
    tools: { generate: false, multiReference: false, localEdit: false, video: false },
    request: { kind: 'prompts', count: 9, ratio: '3:4' }, budget: { maxAttempts: 9, pilotSize: 1 },
    pilot: { confirmed: false }, shots: [], pages: [] });
  write('profiles/person.json', { kind: 'fictional', views: {}, driftWatch: [] });
  write('profiles/brand.json', { palette: 'paper', font: 'sans', margin: 60 });
  write('profiles/product.json', { views: {}, points: [] });
  return { directory: dir, project: path.join(dir, 'project.json'), mode };
}

module.exports = { validateProject, initProject };
