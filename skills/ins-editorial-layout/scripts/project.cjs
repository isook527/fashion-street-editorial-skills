#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateProject, initProject } = require('./project-validation.cjs');
const { lintCopy } = require('./copy-lint.cjs');
const { requireSharp } = require('./sharp-support.cjs');
const { compareColor } = require('./garment-color.cjs');
const { coverProof } = require('./cover-proof.cjs');
const { copyForProject, publicationReview, summarizeFeedback, compareCovers } = require('./editorial.cjs');
const { getFormat } = require('./advanced-layout.cjs');
const { parseArgs } = require('node:util');
const { ensure, readJson, loadProject, evaluate } = require('./project-plan.cjs');
const { makeManifest, changedPages, preflight, visualSheet } = require('./project-pages.cjs');

async function main() {
  const { positionals: [command, filename, extra], values } = parseArgs({
    allowPositionals: true, options: {
      mode: { type: 'string' }, strict: { type: 'boolean' }, preview: { type: 'boolean' },
      format: { type: 'string', default: 'xhs34' }, formats: { type: 'string' },
      config: { type: 'string' }, viewport: { type: 'string', default: '360' },
      previous: { type: 'string' }, renders: { type: 'string' }, out: { type: 'string' },
      shot: { type: 'string' }, label: { type: 'string' }, reference: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' },
    },
  });
  ensure(filename && !extra && ['plan', 'manifest', 'changes', 'preflight', 'deliver', 'compare', 'editions', 'cover-test', 'copy', 'copy-lint', 'color', 'compliance', 'feedback', 'record-feedback', 'validate', 'init'].includes(command),
    'Usage: node project.cjs plan|manifest|changes|preflight|deliver|compare|editions|cover-test|copy|copy-lint|color|compliance|feedback|record-feedback|validate project.json, or init DIR --mode product|creative [options]');
  ensure(!values.preview || (command === 'preflight' && values.renders), 'Use --preview only with preflight --renders DIR.');
  if (command === 'init' || command === 'validate') {
    const result = command === 'init' ? initProject(filename, values.mode) : validateProject(filename);
    if (result.ok === false) process.exitCode = 1;
    return console.log(JSON.stringify(result, null, 2));
  }
  if (['preflight', 'deliver', 'color', 'cover-test', 'compare', 'editions'].includes(command)) requireSharp();
  const ctx = loadProject(filename);
  const plan = evaluate(ctx);
  let result;
  if (command === 'plan') {
    result = plan;
  } else if (['copy', 'copy-lint'].includes(command)) {
    const copy = copyForProject(ctx, plan);
    const lint = lintCopy(copy);
    if (values.strict && lint.hits.some((hit) => hit.severity === 'block')) process.exitCode = 1;
    result = command === 'copy-lint' ? lint : { ...copy, lint };
  } else if (command === 'compliance') {
    result = publicationReview(ctx);
  } else if (command === 'color') {
    ensure(values.config, 'Provide --config with reference/image and swatch rectangles.');
    const config = readJson(values.config);
    result = await compareColor({ ...config, reference: ctx.file(config.reference), image: ctx.file(config.image) });
  } else if (command === 'feedback' || command === 'record-feedback') {
    if (command === 'record-feedback') {
      ensure(values.config && values.out, 'Provide --config with one metrics entry and --out for a new project copy.');
      ensure(path.dirname(path.resolve(values.out)) === path.dirname(path.resolve(filename)),
        'Save feedback in the original project directory so its relative paths stay valid.');
      ctx.project.feedback = [...(ctx.project.feedback ?? []), readJson(values.config)];
    }
    const entries = summarizeFeedback(ctx.project);
    if (command === 'record-feedback') {
      fs.writeFileSync(values.out, JSON.stringify(ctx.project, null, 2) + '\n', { flag: 'wx' });
    }
    result = { entries, comparisons: compareCovers(entries) };
  } else if (command === 'cover-test') {
    ensure(values.renders && values.out, 'Provide --renders (page-01.png directory) and --out (proof prefix).');
    result = await coverProof(path.join(values.renders, 'page-01.png'), values.out, values.format, Number(values.viewport));
  } else if (command === 'editions') {
    ensure(values.out && values.formats, 'Provide --formats xhs34,ig34,ig45 and --out.');
    const formats = [...new Set(values.formats.split(',').map((name) => name.trim()))];
    const outputs = formats.map((format) => {
      getFormat(format);
      const directory = path.join(path.resolve(values.out), format);
      ensure(!fs.existsSync(directory), `Use a new directory for ${format}.`);
      return { format, directory, manifest: makeManifest(ctx, plan, format) };
    });
    result = [];
    for (const { format, directory, manifest } of outputs) {
      const planned = await preflight(ctx, manifest, null);
      ensure(planned.pages.every((page) => !page.errors.length), JSON.stringify(planned));
      fs.mkdirSync(directory, { recursive: true });
      const manifestFile = path.join(directory, 'manifest.json');
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
      execFileSync(process.execPath, [path.join(__dirname, 'render-carousel.cjs'), manifestFile, '--out-dir', directory]);
      const report = await preflight(ctx, manifest, directory);
      ensure(report.pages.every((page) => page.verified && !page.errors.length), JSON.stringify(report));
      const proof = await coverProof(path.join(directory, 'page-01.png'), path.join(directory, 'cover'), format);
      result.push({ format, directory, preflight: report, cover: proof });
    }
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
    const manifest = makeManifest(ctx, plan, values.format);
    if (command === 'manifest') {
      result = manifest;
    } else if (command === 'changes') {
      ensure(values.previous, 'Provide --previous with the earlier manifest.');
      result = changedPages(manifest, readJson(values.previous));
    } else {
      const renders = values.renders ? path.resolve(values.renders) : null;
      result = await preflight(ctx, manifest, renders, { preview: values.preview });
      result.publication = publicationReview(ctx, result.pages);
      if (command === 'deliver') {
        const copy = copyForProject(ctx, plan);
        copy.lint = lintCopy(copy);
        result.copyLint = copy.lint;
        if (values.strict && copy.lint.hits.some((hit) => hit.severity === 'block')) {
          process.exitCode = 1;
          return console.log(JSON.stringify(result, null, 2));
        }
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
        fs.writeFileSync(path.join(directory, 'copy.json'), JSON.stringify(copy, null, 2) + '\n', { flag: 'wx' });
        const paragraphs = [`# ${copy.hook}`, copy.caption, copy.hashtags.join(' '), copy.disclosure,
          '## Alt text', ...copy.alt.map((item) => `${item.page}. ${item.text}`)];
        fs.writeFileSync(path.join(directory, 'copy.md'), paragraphs.filter(Boolean).join('\n\n') + '\n', { flag: 'wx' });
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
