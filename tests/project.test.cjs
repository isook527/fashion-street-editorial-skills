const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const repo = path.resolve(__dirname, '..');
const example = path.join(repo, 'examples/short-jacket');
const scripts = path.join(repo, 'skills/ins-editorial-layout/scripts');
const sharp = require('../skills/ins-editorial-layout/node_modules/sharp');

function node(script, ...args) {
  return execFileSync(process.execPath, [path.join(scripts, script), ...args], { encoding: 'utf8' });
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fashion-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(example, root, { recursive: true });
  const file = path.join(root, 'project.json');
  const project = JSON.parse(fs.readFileSync(file, 'utf8'));
  const save = () => fs.writeFileSync(file, JSON.stringify(project));
  const inspect = (command, ...options) => JSON.parse(node('project.cjs', command, file, ...options));
  const manifest = (name) => {
    const target = path.join(root, name);
    fs.writeFileSync(target, node('project.cjs', 'manifest', file));
    return target;
  };
  return { root, file, project, save, inspect, manifest };
}

test('source coverage proposes the required shot and blocks only missing views', (t) => {
  const { root, project, save, inspect } = fixture(t);
  const productPath = path.join(root, 'profiles/product.json');
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  product.points.push({ id: 'embroidery', kind: 'back', label: '背部刺绣', requires: ['back'] });
  fs.writeFileSync(productPath, JSON.stringify(product));
  const initial = inspect('plan');
  assert.deepEqual(initial.suggestedShots[0].missing, ['back']);
  assert.equal(initial.suggestedShots[0].framing, '背面中景');
  project.shots.push({ id: 'S04', points: ['embroidery'] });
  save();
  assert.equal(inspect('plan').jobs.find((job) => job.id === 'S04').status, 'blocked');
  assert.equal(inspect('plan').metrics.accepted, 3);
  delete project.budget;
  delete project.pilot;
  project.shots = [];
  save();
  assert.equal(inspect('plan').suggestedShots.length, 4);
});

test('retry tracks S03, its failing check, and only its dependent page', (t) => {
  const { file, project, save, inspect } = fixture(t);
  project.shots[2].attempts.pop();
  delete project.shots[2].selected;
  save();
  const plan = inspect('plan');
  assert.deepEqual(plan.budget.next, ['S03']);
  assert.deepEqual(plan.jobs[2].failedChecks, ['pocket']);
  assert.deepEqual(plan.jobs[2].affectedPages, [3]);
  assert.equal(plan.rows[2].retryShot, 'S03');
  const result = spawnSync(process.execPath, [path.join(scripts, 'project.cjs'), 'manifest', file], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /S03 has no accepted revision/);
  project.budget.unitCost = 2;
  project.budget.costCap = 6;
  save();
  assert.equal(inspect('plan').budget.remaining, 0);
  assert.deepEqual(inspect('plan').budget.next, []);
});

test('product protection, tool capability and pilot control the queue', (t) => {
  const { project, save, inspect } = fixture(t);
  for (const shot of project.shots) {
    shot.attempts = [];
    delete shot.selected;
  }
  project.pilot.confirmed = false;
  save();
  assert.deepEqual(inspect('plan').budget.next, ['S01']);
  project.tools.multiReference = false;
  save();
  assert.deepEqual(inspect('plan').budget.next, []);
  project.tools.multiReference = true;
  project.request.allowChanges = ['color'];
  save();
  assert.deepEqual(inspect('plan').budget.next, []);
  project.mode = 'creative';
  save();
  assert.deepEqual(inspect('plan').budget.next, ['S01']);
  project.request.kind = 'video';
  save();
  assert.deepEqual(inspect('plan').budget.next, []);
});

test('a title beyond the Chinese length limit fails before export', (t) => {
  const { file, project, save } = fixture(t);
  project.pages[0].title = '字'.repeat(19);
  save();
  const result = spawnSync(process.execPath, [path.join(scripts, 'project.cjs'), 'preflight', file], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Page 1 title.*18 characters/);
});

test('detects duplicate image content, cover crop and bad output pairs', async (t) => {
  const { root, project, save, inspect, manifest } = fixture(t);
  project.pages[1].shots = ['S02'];
  project.pages[1].template = 'square-mat';
  project.pages[1].fit = 'cover';
  save();
  const report = inspect('preflight');
  assert.ok(report.pages[1].warnings.some((warning) => warning.includes('reuses page 1')));
  assert.ok(report.pages[1].warnings.some((warning) => warning.includes('cover crops')));
  const renders = path.join(root, 'renders');
  node('render-carousel.cjs', manifest('layout.json'), '--out-dir', renders, '--page', '1');
  await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } })
    .png().toFile(path.join(renders, 'bad.png'));
  fs.copyFileSync(path.join(renders, 'bad.png'), path.join(renders, 'page-01.png'));
  const cli = path.join(scripts, 'project.cjs');
  const result = spawnSync(process.execPath, [cli, 'preflight', path.join(root, 'project.json'), '--renders', renders], { encoding: 'utf8' });
  const bad = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.ok(bad.pages[0].errors.includes('Expected 1200 × 1600 SVG and PNG'));
  assert.ok(bad.pages[1].errors.includes('Page is missing a readable PNG or SVG'));
});

test('renders, changes only page 2, checks revised pixels and packages delivery', async (t) => {
  const { root, project, save, inspect, manifest } = fixture(t);
  const old = manifest('old.json');
  const oldRenders = path.join(root, 'old');
  node('render-carousel.cjs', old, '--out-dir', oldRenders, '--preview');
  const sample = inspect('preflight', '--preview', '--renders', oldRenders);
  assert.equal(sample.preview, true);
  assert.equal(sample.ready, false);
  assert.equal(sample.pages.length, 1);
  assert.deepEqual(sample.pages[0].files, { png: 'preview.png', svg: 'preview.svg' });
  assert.equal(sample.pages[0].verified, true);
  assert.equal(sample.pages[0].visualApproved, false);
  assert.deepEqual(sample.pages[0].errors, []);
  node('render-carousel.cjs', old, '--out-dir', oldRenders);
  assert.deepEqual(fs.readFileSync(path.join(oldRenders, 'preview.png')), fs.readFileSync(path.join(oldRenders, 'page-01.png')));
  const initialReview = inspect('preflight', '--renders', oldRenders);
  for (const [index, page] of initialReview.pages.entries()) {
    project.pages[index].visual = { status: 'pass', stamp: page.stamp };
  }
  save();
  assert.ok(inspect('preflight', '--renders', oldRenders).ready);
  project.pages[1].shots = ['S03'];
  project.pages[1].title = '贴袋复核';
  save();
  assert.deepEqual(inspect('changes', '--previous', old), { rerender: [2], removed: [] });
  const nextManifest = manifest('next.json');
  const renders = path.join(root, 'next');
  node('render-carousel.cjs', nextManifest, '--out-dir', renders, '--page', '2');
  for (const page of [1, 3]) {
    for (const ext of ['png', 'svg']) {
      const name = `page-0${page}.${ext}`;
      fs.copyFileSync(path.join(oldRenders, name), path.join(renders, name));
      assert.deepEqual(fs.readFileSync(path.join(renders, name)), fs.readFileSync(path.join(oldRenders, name)));
    }
  }
  const review = inspect('preflight', '--renders', renders);
  assert.equal(review.ready, false);
  assert.ok(review.pages[1].verified);
  assert.equal(review.pages[1].visualApproved, false);
  project.pages[1].visual = { status: 'pass', stamp: review.pages[1].stamp };
  save();
  const delivery = path.join(root, 'delivery');
  assert.ok(inspect('deliver', '--renders', renders, '--out', delivery).ready);
  const files = fs.readdirSync(delivery);
  assert.equal(files.length, 10);
  assert.ok(files.includes('copy.json'));
  assert.ok(files.includes('overview.png'));
  assert.ok(files.includes('delivery.json'));
  const comparison = path.join(root, 'compare.png');
  inspect('compare', '--shot', 'S03', '--out', comparison);
  assert.equal((await sharp(comparison).metadata()).width, 990);
});

test('all twenty legacy layout IDs still render PNG and editable SVG', async (t) => {
  const { root } = fixture(t);
  const layouts = node('render.cjs', '--list').trim().split('\n');
  assert.equal(layouts.length, 24);
  for (const line of layouts.slice(0, 20)) {
    const [template, count] = line.split('\t');
    const photos = Array.from({ length: Number(count) }, (_, i) =>
      ['--photo', path.join(root, 'assets', `S0${i % 3 + 1}-r1.jpg`)]).flat();
    const output = path.join(root, template);
    node('render.cjs', '--template', template, ...photos, '--out', output, '--title', '原有版式');
    const png = await sharp(output + '.png').metadata();
    assert.deepEqual([png.width, png.height], [1200, 1600]);
    assert.equal((fs.readFileSync(output + '.svg', 'utf8').match(/<image /g) ?? []).length, Number(count));
  }
});
