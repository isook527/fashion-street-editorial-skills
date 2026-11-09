const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scripts = path.resolve(__dirname, '../skills/ins-editorial-layout/scripts');
const sample = path.resolve(__dirname, '../examples/short-jacket/project.json');
const run = (script, ...args) => spawnSync(process.execPath, [path.join(scripts, script), ...args], { encoding: 'utf8' });

function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fashion-v06-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('without sharp, renders original photo bytes to SVG and refuses raster-only commands and overwrites', (t) => {
  const dir = workspace(t);
  const mock = path.join(dir, 'mock.cjs');
  fs.writeFileSync(mock, "const Module = require('node:module'); const load = Module._load; Module._load = function (id, ...args) { if (id === 'sharp') throw new Error('mock missing sharp'); return load.call(this, id, ...args); }");
  const env = { ...process.env, NODE_OPTIONS: '--require ' + JSON.stringify(mock) };
  const offline = (script, ...args) => spawnSync(process.execPath, [path.join(scripts, script), ...args], { env, encoding: 'utf8' });
  const photo = path.join(path.dirname(sample), 'assets/S01-r1.jpg');
  const out = path.join(dir, 'only');
  const args = ['--template', 'photo-overlay', '--photo', photo, '--out', out, '--title', '测试'];
  const result = offline('render.cjs', ...args);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).pngSkipped, true);
  assert.match(result.stderr, /已只输出 SVG/);
  assert.equal(fs.existsSync(out + '.png'), false);
  assert.ok(fs.readFileSync(out + '.svg', 'utf8').includes('data:image/jpeg;base64,' + fs.readFileSync(photo).toString('base64')));
  assert.notEqual(offline('render.cjs', ...args).status, 0);
  const manifest = path.join(dir, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({ pages: [{ template: 'full-bleed', photos: [photo] }, { template: 'full-bleed', photos: [photo] }] }));
  const carousel = offline('render-carousel.cjs', manifest, '--out-dir', path.join(dir, 'pages'));
  assert.equal(carousel.status, 0, carousel.stderr);
  assert.equal(carousel.stderr.match(/已只输出 SVG/g).length, 1);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'pages')).sort(), ['page-01.svg', 'page-02.svg']);
  for (const cmd of ['preflight', 'deliver', 'color', 'cover-test', 'compare']) {
    const result = offline('project.cjs', cmd, sample);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /缺少 sharp.*Missing sharp/);
  }
});

test('init creates a valid draft that plans missing work and cannot overwrite', (t) => {
  const dir = path.join(workspace(t), 'project');
  const init = run('project.cjs', 'init', dir, '--mode', 'product');
  assert.equal(init.status, 0, init.stderr);
  const file = path.join(dir, 'project.json');
  assert.equal(JSON.parse(run('project.cjs', 'validate', file).stdout).ok, true);
  const plan = JSON.parse(run('project.cjs', 'plan', file).stdout);
  assert.ok(plan.creative.missing.length > 0);
  assert.ok(plan.diagnostics.includes('商品保真缺少可用商品图'));
  assert.deepEqual(fs.readdirSync(path.join(dir, 'assets')), []);
  assert.notEqual(run('project.cjs', 'init', dir, '--mode', 'creative').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(file)).mode, 'product');
});

test('validate collects three independent errors with exact field paths', (t) => {
  const dir = path.join(workspace(t), 'project');
  assert.equal(run('project.cjs', 'init', dir, '--mode', 'creative').status, 0);
  const file = path.join(dir, 'project.json');
  const project = JSON.parse(fs.readFileSync(file));
  project.request.count = 0;
  project.shots = [{ id: 'S01', points: [], attempts: [{ id: 'r1', checks: { pocket: 'bad' } }] }];
  project.pilot.shot = 'missing';
  fs.writeFileSync(file, JSON.stringify(project));
  const result = run('project.cjs', 'validate', file);
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).errors.map((error) => error.path).sort(),
    ['pilot.shot', 'request.count', 'shots[0].attempts[0].checks.pocket']);
});

test('copy lint flags risky caption, hashtags, and alt; strict rejects before delivery', (t) => {
  const dir = path.join(workspace(t), 'project');
  assert.equal(run('project.cjs', 'init', dir, '--mode', 'creative').status, 0);
  const file = path.join(dir, 'project.json');
  const project = JSON.parse(fs.readFileSync(file));
  project.copy = { caption: '最显瘦', hashtags: ['万能'] };
  project.pages = [{ template: 'full-bleed', shots: [], alt: '所有身材都适合' }];
  fs.writeFileSync(file, JSON.stringify(project));
  const result = run('project.cjs', 'copy', file, '--strict');
  assert.equal(result.status, 1);
  const hits = JSON.parse(result.stdout).lint.hits;
  assert.ok(hits.some((hit) => hit.field === 'caption' && hit.word === '显瘦' && hit.severity === 'block'));
  assert.ok(hits.some((hit) => hit.field === 'hashtags[0]' && hit.severity === 'warn'));
  assert.ok(hits.some((hit) => hit.field === 'alt[0].text' && hit.severity === 'warn'));
  assert.equal(run('project.cjs', 'copy', file).status, 0);
  project.copy.caption = '腰线更清楚';
  project.pages[0].alt = '阔腿裤与白衬衫';
  fs.writeFileSync(file, JSON.stringify(project));
  assert.equal(run('project.cjs', 'copy-lint', file, '--strict').status, 0);

  // Use a full project so strict delivery reaches its copy gate.
  const validSample = path.join(dir, 'sample.json');
  const current = JSON.parse(fs.readFileSync(sample));
  for (const key of Object.keys(current.profiles)) current.profiles[key] = path.resolve(path.dirname(sample), current.profiles[key]);
  for (const shot of current.shots) for (const attempt of shot.attempts) attempt.file = path.resolve(path.dirname(sample), attempt.file);
  const product = JSON.parse(fs.readFileSync(current.profiles.product));
  for (const key of Object.keys(product.views)) product.views[key] = path.resolve(path.dirname(sample), product.views[key]);
  current.profiles.product = path.join(dir, 'product.json');
  fs.writeFileSync(current.profiles.product, JSON.stringify(product));
  current.copy = { caption: '最显瘦' };
  fs.writeFileSync(validSample, JSON.stringify(current));
  const out = path.join(dir, 'delivery');
  const blocked = run('project.cjs', 'deliver', validSample, '--strict', '--out', out);
  assert.equal(blocked.status, 1, blocked.stderr);
  assert.ok(JSON.parse(blocked.stdout).copyLint.hits.some((hit) => hit.severity === 'block'));
  assert.equal(fs.existsSync(out), false);
});

const { lintCopy } = require('../skills/ins-editorial-layout/scripts/copy-lint.cjs');
const captionHits = (caption) => lintCopy({ caption, hashtags: [], alt: [] }).hits;

test('copy lint allows ordinary recency and ordinal phrases', () => {
  assert.deepEqual(captionHits('最近入手的第一件短夹克'), []);
  assert.deepEqual(captionHits('最初、最早、最后和最终；最新款式；第一次翻到第一页第一张，第一眼看完第一步'), []);
});

test('copy lint flags price and body claims as warnings and quantified effects as blocks', () => {
  const caption = '全网最低，谁穿谁好看';
  const hits = captionHits(caption);
  for (const word of ['全网最低', '谁穿谁好看']) {
    assert.ok(hits.some((hit) => hit.word === word && hit.severity === 'warn' && hit.index === caption.indexOf(word)));
  }
  assert.ok(captionHits('搭配后瘦 ３ 斤，显高 ５ ｃｍ').filter((hit) => hit.severity === 'block').length >= 2);
});

test('copy lint preserves the original offset of a risky word after an exception', () => {
  for (const caption of ['最近最火', '👚ﬃ最近最火']) {
    const hit = captionHits(caption).find((hit) => hit.word === '最');
    assert.equal(hit.index, caption.lastIndexOf('最'));
  }
  assert.ok(captionHits('第一件短夹克，销量第一').some((hit) => hit.word === '第一' && hit.index === 9));
});
