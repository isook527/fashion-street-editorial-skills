const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const scripts = path.join(root, 'skills/ins-editorial-layout/scripts');
const sharp = require('../skills/ins-editorial-layout/node_modules/sharp');
const { compareColor } = require('../skills/ins-editorial-layout/scripts/garment-color.cjs');

function cli(script, ...args) {
  return execFileSync(process.execPath, [path.join(scripts, script), ...args], { encoding: 'utf8' });
}

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'five-layer-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.join(root, 'examples'), directory, { recursive: true });
  const folder = path.join(directory, 'editorial-jacket');
  const project = path.join(folder, 'project.json');
  const input = JSON.parse(fs.readFileSync(project));
  const save = () => fs.writeFileSync(project, JSON.stringify(input));
  const run = (command, ...args) => JSON.parse(cli('project.cjs', command, project, ...args));
  return { directory, folder, project, input, save, run };
}

test('creative brief gives nine story slots, camera decisions, garment actions and a missing-image diagnostic', (t) => {
  const { input, save, run } = setup(t);
  const plan = run('plan');
  assert.equal(plan.creative.rhythm.length, 9);
  assert.ok(plan.creative.rhythm.some((shot) => shot.role === 'motion'));
  assert.equal(plan.creative.actions.length, 6);
  assert.deepEqual(plan.creative.missing, []);
  assert.equal(plan.jobs[0].camera.focalLengthHint, '50mm');
  input.concept.references[0] = 'missing.jpg';
  save();
  assert.ok(run('plan').creative.missing.some((message) => message.includes('missing.jpg')));
});

test('numeric checks, seed, grade and failure route gate a revision and its benefits', (t) => {
  const { input, save, run } = setup(t);
  assert.equal(run('plan').metrics.accepted, 3);
  assert.equal(run('plan').repairs.byCause.find((entry) => entry.cause === 'occlusion').passed, 1);
  const pocket = input.shots[2].attempts[1];
  pocket.counts.buttons = 4;
  pocket.failureCause = 'detail';
  save();
  const bad = run('plan').jobs[2];
  assert.deepEqual(bad.failedChecks, ['count.buttons']);
  assert.match(bad.repairRoute, /局部修复/);
  assert.deepEqual(run('copy').benefits.map((entry) => entry.point), ['hem']);
  pocket.counts.buttons = 3;
  delete pocket.prompt.seed;
  pocket.grade.preset = 'film-warm';
  save();
  const wrong = run('plan').jobs[2];
  assert.ok(wrong.failedChecks.includes('grade'));
  assert.ok(wrong.pending.includes('prompt.version/text/tool/seed'));
  assert.equal(run('copy').alt.length, 3);
});

test('controlled swatches pass, fail, and defer, and old color evidence is invalidated', async (t) => {
  const { folder, directory, input, save, run } = setup(t);
  const make = (name, background) => sharp({ create: { width: 40, height: 40, channels: 3, background } })
    .png().toFile(path.join(folder, name));
  await make('base.png', '#646e56');
  await make('near.png', '#656f57');
  await make('far.png', '#9d5252');
  const config = { referenceRect: [0.2, 0.2, 0.6, 0.6], imageRect: [0.2, 0.2, 0.6, 0.6], threshold: 5, matchedLighting: true };
  const colorConfig = path.join(directory, 'color.json');
  fs.writeFileSync(colorConfig, JSON.stringify({ ...config, reference: 'base.png', image: 'near.png' }));
  const report = run('color', '--config', colorConfig);
  assert.equal(report.verdict, 'pass');
  const files = { reference: path.join(folder, 'base.png'), image: path.join(folder, 'far.png') };
  assert.equal((await compareColor({ ...config, ...files })).verdict, 'fail');
  assert.equal((await compareColor({ ...config, ...files, matchedLighting: false })).verdict, 'unknown');
  const productFile = path.join(folder, input.profiles.product);
  const product = JSON.parse(fs.readFileSync(productFile));
  product.views.color = 'base.png';
  fs.writeFileSync(productFile, JSON.stringify(product));
  fs.writeFileSync(path.join(folder, 'report.json'), JSON.stringify(report));
  input.quality.color = { referenceView: 'color', threshold: 5, shots: ['S01'] };
  input.shots[0].attempts[0].file = 'near.png';
  input.shots[0].attempts[0].colorReport = 'report.json';
  save();
  assert.equal(run('plan').jobs[0].status, 'accepted');
  await make('near.png', '#9d5252');
  assert.ok(run('plan').jobs[0].pending.includes('color.deltaE'));
});

test('renders three editions, original marks and proofs, plus an oversized numeric cover', async (t) => {
  const { directory, project, run } = setup(t);
  const editions = run('editions', '--formats', 'xhs34,ig34,ig45', '--out', path.join(directory, 'editions'));
  assert.equal(editions.length, 3);
  for (const edition of editions) {
    assert.ok(edition.preflight.pages.every((page) => page.verified && page.disclosureVerified));
    const dimensions = await sharp(path.join(edition.directory, 'page-01.png')).metadata();
    assert.deepEqual([dimensions.width, dimensions.height], [1200, edition.format === 'ig45' ? 1500 : 1600]);
    assert.equal((await sharp(path.join(edition.directory, 'cover-mobile.png')).metadata()).width, 360);
    assert.equal(edition.cover.holdSeconds, 3);
    assert.equal(edition.cover.verdict, 'human-review-required');
    assert.ok(edition.preflight.pages[1].overlay.contrastFloor > 4.5);
    assert.ok(edition.preflight.pages[1].overlay.checkedProtectedZones >= 1);
    const svg = fs.readFileSync(path.join(edition.directory, 'page-01.svg'), 'utf8');
    assert.match(svg, /font-size="112"/);
    assert.match(svg, /font-size="26"/);
    assert.match(svg, /Noto Serif CJK SC/);
    assert.match(svg, /短夹克怎么搭/);
    if (edition.format.startsWith('ig')) assert.ok(fs.existsSync(path.join(edition.directory, 'cover-grid.png')));
  }
  const photo = path.join(directory, 'short-jacket/assets/S02-r1.jpg');
  const output = path.join(directory, 'numeric');
  cli('render.cjs', '--template', 'issue-number', '--photo', photo, '--title', '07',
    '--secondary', '街角系列', '--out', output);
  assert.ok(fs.existsSync(output + '.png'));
  const blocked = spawnSync(process.execPath, [path.join(scripts, 'render.cjs'), '--template', 'photo-overlay',
    '--photo', photo, '--title', '测试', '--protected', '[[0,0,1,1]]', '--out', path.join(directory, 'blocked')], { encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /protected zones/);
  assert.ok(project);
});

test('checks disclosure and real-person consent without treating an unconfirmed label as done', (t) => {
  const { input, save, run } = setup(t);
  input.publication.realPerson = true;
  save();
  const result = run('compliance');
  assert.equal(result.aiContent, true);
  assert.ok(result.pending.some((item) => item.includes('肖像授权')));
  assert.ok(result.pending.some((item) => item.includes('平台')));
  assert.equal(result.visibleLabelExported, false);
});

test('records real-data fields and calculates comparable A/B rates using synthetic test values', (t) => {
  const { folder, input, save, run } = setup(t);
  const base = { platform: 'test', window: 'same', experiment: 'cover-test', control: 'same audience',
    impressions: 100, saves: 15, clicks: 20, commentKeywords: ['肩线'] };
  input.feedback = [{ ...base, cover: 'A', saves: 10, clicks: 12 }];
  save();
  const config = path.join(folder, 'observed.json');
  fs.writeFileSync(config, JSON.stringify({ ...base, cover: 'B' }));
  const copy = path.join(folder, 'with-feedback.json');
  const result = run('record-feedback', '--config', config, '--out', copy);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[1].saveRate, 0.15);
  assert.ok(Math.abs(result.comparisons[0].clickRateChange - 0.08) < 1e-9);
  assert.equal(run('feedback').entries.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(copy)).feedback.length, 2);
});
