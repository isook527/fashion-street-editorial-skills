#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const layouts = require('./layouts.cjs');
const { optionalSharp } = require('./sharp-support.cjs');
const { useFonts } = require('./bundled-fonts.cjs');

function readPlan(filename) {
  const plan = JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(plan?.pages) || plan.pages.length === 0) {
    throw new Error('Manifest must contain a nonempty pages array.');
  }
  if (plan.palette !== undefined && typeof plan.palette !== 'string') {
    throw new Error('Manifest palette must be a string.');
  }
  if (plan.font !== undefined && typeof plan.font !== 'string') {
    throw new Error('Manifest font must be a string.');
  }
  if (plan.margin !== undefined && !Number.isInteger(plan.margin)) {
    throw new Error('Manifest margin must be an integer.');
  }
  return plan;
}

function pageArgs(page, index, directory) {
  if (!page || !Object.hasOwn(layouts, page.template) || !Array.isArray(page.photos)) {
    throw new Error(`Page ${index + 1} needs a valid template and a photos array.`);
  }
  const expected = layouts[page.template].length;
  if (page.photos.length !== expected || page.photos.some((photo) => typeof photo !== 'string' || !photo.trim())) {
    throw new Error(`Page ${index + 1} needs ${expected} photo path(s).`);
  }
  const args = ['--template', page.template];
  for (const photo of page.photos) {
    const filename = path.resolve(directory, photo);
    if (!existsSync(filename)) throw new Error(`Page ${index + 1} cannot find photo: ${photo}`);
    args.push('--photo', filename);
  }
  if (page.protected !== undefined) args.push(`--protected=${JSON.stringify(page.protected)}`);
  for (const field of ['title', 'subtitle', 'fit', 'stamp', 'secondary', 'disclosure']) {
    if (page[field] === undefined) continue;
    if (typeof page[field] !== 'string') {
      throw new Error(`Page ${index + 1} ${field} must be a string.`);
    }
    args.push(`--${field}=${page[field]}`);
  }
  return args;
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'out-dir': { type: 'string' },
      preview: { type: 'boolean' },
      page: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  const usage = 'Usage: node render-carousel.cjs manifest.json --out-dir DIR [--preview | --page N]';
  if (values.help) return console.log(usage);
  if (positionals.length !== 1 || !values['out-dir'] || (values.preview && values.page !== undefined)) {
    throw new Error(usage);
  }
  const manifest = path.resolve(positionals[0]);
  const plan = readPlan(manifest);
  let selected = plan.pages.map((_, index) => index);
  if (values.preview) selected = [0];
  if (values.page !== undefined) {
    const page = Number(values.page);
    if (!/^[1-9]\d*$/.test(values.page) || !Number.isSafeInteger(page) || page > plan.pages.length) {
      throw new Error(`Choose a page between 1 and ${plan.pages.length}.`);
    }
    selected = [page - 1];
  }
  const directory = path.resolve(values['out-dir']);
  const jobs = selected.map((index) => {
    const name = values.preview ? 'preview' : `page-${String(index + 1).padStart(2, '0')}`;
    const prefix = path.join(directory, name);
    if (existsSync(`${prefix}.svg`) || existsSync(`${prefix}.png`)) {
      throw new Error(`Output already exists: ${prefix}`);
    }
    return {
      index,
      args: [
        ...pageArgs(plan.pages[index], index, path.dirname(manifest)),
        `--palette=${plan.palette ?? 'paper'}`,
        `--font=${plan.font ?? 'sans'}`,
        `--format=${plan.format ?? 'xhs34'}`,
        `--margin=${plan.margin ?? 60}`,
        '--out', prefix,
      ],
    };
  });
  useFonts();
  mkdirSync(directory, { recursive: true });
  const renderer = path.join(__dirname, 'render.cjs');
  const sharp = optionalSharp();
  for (const job of jobs) {
    try {
      execFileSync(process.execPath, [renderer, ...job.args], { stdio: 'inherit',
        env: { ...process.env, ...(sharp ? {} : { FASHION_SVG_WARNING_SHOWN: '1' }) } });
    } catch {
      throw new Error(`Page ${job.index + 1} failed. Correct its input before retrying.`);
    }
  }
  if (!sharp) console.error('已只输出 SVG；在有网环境运行 npm ci 后可补 PNG');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
