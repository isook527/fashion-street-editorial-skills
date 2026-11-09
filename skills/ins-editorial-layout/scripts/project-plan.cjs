const fs = require('node:fs');
const path = require('node:path');
const { creativeBrief } = require('./creative.cjs');
const { qualityReview, repairHistory, repairRoutes } = require('./editorial.cjs');
const { createHash } = require('node:crypto');

const pointGuide = {
  shoulder: ['半身正侧 45°', '双臂放松，让肩点和肩缝同时可见', '肩缝低于自然肩点，肩线可与正面参考对照'],
  hem: ['全身正面', '站姿，手和包避开衣摆', '衣摆完整，衣长与参考及约定腰线关系一致'],
  pocket: ['正面躯干特写', '两手离开衣身，口袋边缘全部可见', '数量、形状、位置和开口与参考一致'],
  stripe: ['正面中近景', '对准门襟与接缝拍摄', '检查条纹走向、间距和门襟对位'],
  reflection: ['斜侧中近景', '高光避开主要纹理和细节', '亮面仍保留细节，颜色可与参考核对'],
  drape: ['全身侧向走动', '一步小幅迈出，保持下摆无遮挡', '下摆轮廓、运动方向、长度均可见'],
  back: ['背面中景', '站直，头发和手避开背部图案', '背部结构、图案位置和轮廓可与背面参考核对'],
};
const reviewKeys = ['identity', 'garment', 'action', 'crop'];
const verdicts = ['pass', 'fail', 'unknown'];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function mapIds(items, label) {
  ensure(Array.isArray(items), `${label} must be an array.`);
  const byId = new Map();
  for (const item of items) {
    ensure(item && typeof item.id === 'string' && /^[\w-]+$/.test(item.id), `Invalid ${label} ID.`);
    ensure(!byId.has(item.id), `Duplicate ${label} ID: ${item.id}`);
    byId.set(item.id, item);
  }
  return byId;
}

function sha(data) {
  return createHash('sha256').update(data).digest('hex');
}

function loadProject(filename) {
  const root = path.dirname(path.resolve(filename));
  const file = (name) => path.resolve(root, name);
  const present = (name) => typeof name === 'string' && name.length > 0
    && fs.existsSync(file(name)) && fs.statSync(file(name)).isFile();
  const project = readJson(filename);
  ensure(project?.version === 1 && ['product', 'creative'].includes(project.mode), 'Choose version 1 and mode product or creative.');
  ensure(project.profiles && typeof project.profiles === 'object', 'Specify separate person, brand and product profiles.');
  const profile = (key) => {
    const name = project.profiles[key];
    if (name === undefined) return {};
    ensure(present(name), `Missing ${key} profile.`);
    const data = readJson(file(name));
    ensure(data && typeof data === 'object' && !Array.isArray(data), `Invalid ${key} profile.`);
    return data;
  };
  const person = profile('person');
  const product = profile('product');
  const brand = profile('brand');
  ensure(project.mode !== 'product' || project.profiles.product, 'Product mode needs a product profile.');
  const points = mapIds(product.points ?? [], 'selling point');
  const shots = mapIds(project.shots ?? [], 'shot');
  const pages = project.pages ?? [];
  ensure(Array.isArray(pages), 'Pages must be an array.');
  for (const point of points.values()) {
    ensure(typeof point.label === 'string' && Array.isArray(point.requires)
      && point.requires.every((v) => typeof v === 'string') && point.requires.length > 0,
      `Selling point ${point.id} needs a label and reference views.`);
    ensure(Object.hasOwn(pointGuide, point.kind) || (point.framing && point.action && point.acceptance),
      `Unknown selling point kind for ${point.id}. Provide framing, action and acceptance.`);
  }
  for (const shot of shots.values()) {
    ensure(Array.isArray(shot.points) && new Set(shot.points).size === shot.points.length
      && shot.points.every((id) => points.has(id)), `Unknown or duplicate selling point in ${shot.id}.`);
    ensure(Array.isArray(shot.attempts ?? []), `Attempts must be an array in ${shot.id}.`);
    const attempts = mapIds(shot.attempts ?? [], `attempt in ${shot.id}`);
    if (shot.selected) ensure(attempts.has(shot.selected), `Invalid selected revision in ${shot.id}.`);
  }
  const budget = project.budget ?? {};
  const maxAttempts = budget.maxAttempts ?? Math.max(1, shots.size, points.size);
  const pilotSize = budget.pilotSize ?? 1;
  const unitCost = budget.unitCost;
  const costCap = budget.costCap;
  ensure(unitCost === undefined && costCap === undefined || Number.isFinite(unitCost) && unitCost > 0
    && Number.isFinite(costCap) && costCap >= 0, 'Set a positive unitCost and nonnegative costCap together.');
  ensure(Number.isSafeInteger(maxAttempts) && maxAttempts > 0
    && Number.isSafeInteger(pilotSize) && pilotSize > 0 && pilotSize <= maxAttempts, 'Invalid attempt budget or pilot size.');
  const tools = project.tools ?? {};
  const requested = project.request ?? {};
  const pilot = project.pilot ?? {};
  if (pilot.shot) ensure(shots.has(pilot.shot), 'Unknown pilot shot.');
  return { project, person, product, brand, points, shots, pages, present, file, digest: (name) => sha(fs.readFileSync(file(name))), maxAttempts, pilotSize, unitCost, costCap, tools, requested, pilot };
}

function evaluate(ctx) {
  const rows = [];
  const jobs = [];
  const diagnostics = [];
  const validByShot = new Map();
  let attempted = 0;
  let firstPassed = 0;
  let totalAttempts = 0;
  let accepted = 0;
  const references = ctx.product.views ?? {};
  const identityRefs = Object.values(ctx.person.views ?? {}).filter(ctx.present);
  const changes = ctx.requested.allowChanges ?? [];
  ensure(Array.isArray(changes) && changes.every((part) => typeof part === 'string'), 'allowChanges must be a string array.');
  const protectedParts = ['identity', 'color', 'silhouette', 'material', 'buttons', 'pockets', 'print'];
  const hasProductRefs = Object.values(references).some(ctx.present);
  if (ctx.project.mode === 'product' && !hasProductRefs) diagnostics.push('商品保真缺少可用商品图');
  if (ctx.project.mode === 'product' && changes.some((part) => protectedParts.includes(part))) {
    diagnostics.push('商品保真模式禁止主动改变身份或商品关键特征');
  }
  if (!identityRefs.length && ctx.project.profiles.person) diagnostics.push('人物档案缺少可用参考');
  if (ctx.requested.kind === 'video' && ctx.tools.video !== true) diagnostics.push('当前工具未确认支持视频，只交付分镜');
  if (ctx.requested.kind !== 'prompts' && ctx.tools.generate !== true) diagnostics.push('当前工具未确认支持生图，只交付提示词');
  if (ctx.requested.edit === true && ctx.tools.localEdit !== true) diagnostics.push('局部编辑能力不足，改为按原参考重做该镜头');
  if (identityRefs.length && hasProductRefs && ctx.tools.multiReference !== true) diagnostics.push('多图参考未确认，保真任务需补能力');
  const blockedTool = (ctx.project.mode === 'product' && !hasProductRefs)
    || (ctx.project.mode === 'product' && changes.some((part) => protectedParts.includes(part)))
    || (ctx.project.profiles.person && !identityRefs.length)
    || (ctx.requested.kind === 'video' && ctx.tools.video !== true)
    || (ctx.project.mode === 'product' && identityRefs.length > 0 && hasProductRefs && ctx.tools.multiReference !== true)
    || ctx.requested.kind === 'prompts' || ctx.tools.generate !== true;

  for (const shot of ctx.shots.values()) {
    const attempts = shot.attempts ?? [];
    const keys = [...reviewKeys, ...shot.points];
    const linked = shot.points.map((id) => ctx.points.get(id));
    const missing = [...new Set(linked.flatMap((point) => point.requires).filter((view) => !ctx.present(references[view])))];
    const sourceReady = ctx.project.mode !== 'product' || hasProductRefs;
    const valid = (attempt) => {
      if (!sourceReady || missing.length || !ctx.present(attempt?.file) || !keys.every((key) => attempt.checks?.[key] === 'pass')) return false;
      const quality = qualityReview(ctx, shot, attempt);
      return !quality.failed.length && !quality.pending.length;
    };
    validByShot.set(shot.id, new Set(attempts.filter(valid).map((attempt) => attempt.id)));
    for (const attempt of attempts) {
      ensure(!attempt.checks || keys.every((key) => attempt.checks[key] === undefined
        || verdicts.includes(attempt.checks[key])), `Invalid review verdict in ${shot.id}/${attempt.id}.`);
    }
    if (attempts.length) {
      attempted++;
      totalAttempts += attempts.length;
      if (valid(attempts[0])) firstPassed++;
    }
    const latest = attempts.at(-1);
    const selection = attempts.find((attempt) => attempt.id === shot.selected);
    const isAccepted = !!selection && valid(selection);
    if (isAccepted) accepted++;
    const quality = qualityReview(ctx, shot, latest);
    const failedChecks = [...keys.filter((key) => latest?.checks?.[key] === 'fail'), ...quality.failed];
    const pending = [...keys.filter((key) => latest?.checks?.[key] !== 'pass' && !failedChecks.includes(key)), ...quality.pending];
    const status = !sourceReady || missing.length ? 'blocked' : isAccepted ? 'accepted'
      : !latest ? 'pending' : failedChecks.length || !ctx.present(latest.file) ? 'retry' : 'review';
    const job = { id: shot.id, status, missing, failedChecks, pending, rhythmRole: shot.rhythmRole ?? null, camera: shot.camera ?? null,
      selected: isAccepted ? selection.id : null, latest: latest?.id ?? null, note: latest?.note ?? null,
      repairRoute: failedChecks.length ? repairRoutes[latest?.failureCause ?? latest?.repair?.cause] ?? null : null,
      affectedPages: ctx.pages.flatMap((page, index) => page.shots?.includes(shot.id) ? [index + 1] : []) };
    jobs.push(job);
    for (const point of linked) {
      const guidance = pointGuide[point.kind];
      rows.push({ point: point.id, label: point.label, shot: shot.id,
        framing: shot.framing ?? point.framing ?? guidance?.[0],
        action: shot.action ?? point.action ?? guidance?.[1],
        acceptance: point.acceptance ?? guidance?.[2],
        references: point.requires, missing: missing.filter((view) => point.requires.includes(view)),
        verdict: (isAccepted ? selection : latest)?.checks?.[point.id] ?? 'unknown',
        retryShot: status === 'retry' && (failedChecks.includes(point.id) || !ctx.present(latest?.file)) ? shot.id : null });
    }
  }
  const creative = creativeBrief(ctx.project, ctx.product);
  for (const reference of creative.concept.references) {
    if (!ctx.present(reference)) creative.missing.push(`概念参照文件缺失：${reference}`);
  }
  const uncovered = [...ctx.points.keys()].filter((id) => !rows.some((row) => row.point === id));
  if (uncovered.length) diagnostics.push(`卖点缺少镜头：${uncovered.join(', ')}`);
  const suggestedShots = uncovered.map((id) => {
    const point = ctx.points.get(id);
    const guide = pointGuide[point.kind];
    return { point: id, framing: point.framing ?? guide?.[0], action: point.action ?? guide?.[1],
      acceptance: point.acceptance ?? guide?.[2],
      missing: point.requires.filter((view) => !ctx.present(references[view])) };
  });
  const maxByCost = ctx.unitCost === undefined ? ctx.maxAttempts : Math.floor(ctx.costCap / ctx.unitCost + 1e-9);
  const remaining = Math.max(0, Math.min(ctx.maxAttempts, maxByCost) - totalAttempts);
  const pilotPassed = !!ctx.pilot.confirmed && jobs.some((job) => job.id === ctx.pilot.shot && job.status === 'accepted');
  const queued = jobs.filter((job) => ['pending', 'retry'].includes(job.status));
  const pilotJobs = ctx.pilot.shot ? queued.filter((job) => job.id === ctx.pilot.shot) : queued.slice(0, ctx.pilotSize);
  const next = blockedTool ? [] : (pilotPassed ? queued : pilotJobs).slice(0, remaining);
  return {
    mode: ctx.project.mode, creative,
    repairs: repairHistory(ctx, validByShot), diagnostics, allowedChanges: changes, protectedParts: ctx.project.mode === 'product' ? protectedParts : [],
    personReferences: identityRefs, driftWatch: ctx.person.driftWatch ?? [], rows, jobs, suggestedShots,
    budget: { cap: ctx.maxAttempts, used: totalAttempts, remaining, pilotPassed,
      estimatedCost: ctx.unitCost === undefined ? null : totalAttempts * ctx.unitCost,
      next: next.map((job) => job.id) },
    metrics: { attempted, firstPassed, firstPassRate: attempted ? firstPassed / attempted : null,
      retries: totalAttempts - attempted, averageRetries: attempted ? (totalAttempts - attempted) / attempted : null, accepted },
  };
}

module.exports = { ensure, readJson, sha, loadProject, evaluate, pointGuide };
