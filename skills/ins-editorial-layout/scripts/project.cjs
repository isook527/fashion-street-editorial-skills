#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { ensure, readJson, loadProject, evaluate } = require('./project-plan.cjs');
const { makeManifest, changedPages, preflight, visualSheet } = require('./project-pages.cjs');

async function main() {
  const { positionals: [command, filename, extra], values } = parseArgs({
    allowPositionals: true, options: {
      previous: { type: 'string' }, renders: { type: 'string' }, out: { type: 'string' },
      shot: { type: 'string' }, label: { type: 'string' }, reference: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' },
    },
  });
  ensure(filename && !extra && ['plan', 'manifest', 'changes', 'preflight', 'deliver', 'compare'].includes(command),
    'Usage: node project.cjs plan|manifest|changes|preflight|deliver|compare project.json [options]');
  const ctx = loadProject(filename);
  const plan = evaluate(ctx);
  let result;
  if (command === 'plan') {
    result = plan;
  } else if (command === 'compare') {
    ensure(values.out, 'Provide --out for the PNG.');
    const shot = ctx.shots.get(values.shot);
    const point = ctx.points.get(shot?.points?.[0]);
    const reference = values.reference ?? ctx.product.views?.[point?.requires[0]] ?? ctx.person.views?.front;
    const before = values.before ?? shot?.attempts?.at(-2)?.file;
    const after = values.after ?? shot?.attempts?.at(-1)?.file;
    const images = [reference, before, after];
    ensure(images.every(ctx.present), 'Provide three readable project-relative images, or a shot with two revisions.');
    const label = values.label ?? values.shot ?? '';
    const labels = ['Reference', `${label} Before ${shot?.attempts?.at(-2)?.id ?? ''}`,
      `${label} After ${shot?.attempts?.at(-1)?.id ?? ''}`];
    await visualSheet(images.map((file, index) => ({ file: ctx.file(file), label: labels[index].trim() })), values.out);
    result = { output: values.out, shot: values.shot ?? null };
  } else {
    const manifest = makeManifest(ctx, plan);
    if (command === 'manifest') {
      result = manifest;
    } else if (command === 'changes') {
      ensure(values.previous, 'Provide --previous with the earlier manifest.');
      result = changedPages(manifest, readJson(values.previous));
    } else {
      const renders = values.renders ? path.resolve(values.renders) : null;
      result = await preflight(ctx, manifest, renders);
      if (command === 'deliver') {
        ensure(renders && values.out, 'Provide --renders and --out for the delivery checklist and thumbnail.');
        ensure(result.ready, JSON.stringify(result, null, 2));
        const directory = path.resolve(values.out);
        ensure(!fs.existsSync(directory), 'Use a new delivery directory.');
        fs.mkdirSync(directory, { recursive: true });
        for (const page of result.pages) {
          for (const filename of Object.values(page.files)) {
            fs.copyFileSync(path.join(renders, filename), path.join(directory, filename), fs.constants.COPYFILE_EXCL);
          }
        }
        await visualSheet(result.pages.map((page) => ({ file: path.join(directory, page.files.png),
          label: `Page ${page.page} | ${page.shots.map((shot) => `${shot.id}/${shot.revision}`).join(', ')}` })),
        path.join(directory, 'overview.png'));
        fs.writeFileSync(path.join(directory, 'delivery.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
      } else if (result.pages.some((page) => page.errors.length)) {
        process.exitCode = 1;
      }
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
