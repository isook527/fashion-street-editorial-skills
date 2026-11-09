const fs = require('node:fs');
const path = require('node:path');
const layouts = require('./layouts.cjs');
const { readStyle, photoFrame, checkText } = require('./layout-style.cjs');
const { ensure, sha } = require('./project-plan.cjs');

function makeManifest(ctx, result) {
  const { palette = 'paper', font = 'sans', margin = 60, cover } = ctx.brand;
  readStyle({ palette, font, margin });
  const byId = new Map(result.jobs.map((job) => [job.id, job]));
  ensure(ctx.pages.length > 0, 'Project needs layout pages.');
  const pages = ctx.pages.map((page, index) => {
    const template = page.template ?? (index === 0 ? cover : undefined);
    const fit = page.fit ?? 'contain';
    ensure(typeof template === 'string' && Object.hasOwn(layouts, template), `Page ${index + 1} needs a template.`);
    ensure(['contain', 'cover'].includes(fit), `Invalid fit on page ${index + 1}.`);
    ensure(Array.isArray(page.shots) && page.shots.length === layouts[template].length,
      `Page ${index + 1} needs ${layouts[template].length} shot IDs.`);
    const revisions = page.shots.map((id) => {
      const job = byId.get(id);
      ensure(job?.status === 'accepted', `Page ${index + 1}: ${id} has no accepted revision.`);
      const attempt = ctx.shots.get(id).attempts.find((entry) => entry.id === job.selected);
      const file = ctx.file(attempt.file);
      return { id, revision: attempt.id, file, sha256: sha(fs.readFileSync(file)) };
    });
    const title = checkText(page.title ?? '', 18, `Page ${index + 1} title`);
    const subtitle = checkText(page.subtitle ?? '', 34, `Page ${index + 1} subtitle`);
    const stamp = sha(JSON.stringify({
      template, fit, title, subtitle, palette, font, margin,
      versions: revisions.map(({ id, revision, sha256 }) => [id, revision, sha256]),
    }));
    return { template, photos: revisions.map((entry) => entry.file), title, subtitle, fit, stamp,
      revisions: revisions.map(({ id, revision, sha256 }) => ({ id, revision, sha256 })) };
  });
  return { palette, font, margin, pages };
}

function changedPages(current, previous) {
  ensure(Array.isArray(previous?.pages) && previous.pages.every((page) => /^[a-f0-9]{64}$/.test(page?.stamp)),
    'Previous manifest must include project fingerprints.');
  return {
    rerender: current.pages.flatMap((page, index) => page.stamp !== previous.pages[index]?.stamp ? [index + 1] : []),
    removed: previous.pages.flatMap((_, index) => index >= current.pages.length ? [index + 1] : []),
  };
}

function xml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]);
}

async function preflight(ctx, manifest, renders) {
  const sharp = require('sharp');
  const style = readStyle(manifest);
  const seen = new Map();
  const output = [];
  for (const [index, page] of manifest.pages.entries()) {
    const number = index + 1;
    const errors = [];
    const warnings = [];
    for (const [label, value, size] of [['title', page.title, 56], ['subtitle', page.subtitle, 29]]) {
      if (!value) continue;
      const measured = await sharp({ text: { text: xml(value), font: `${style.font} ${size}`, dpi: 72 } }).metadata();
      if (measured.width > 1200 - 2 * style.margin) errors.push(`${label} exceeds the text area`);
    }
    for (const [slot, source] of page.photos.entries()) {
      const hash = page.revisions[slot].sha256;
      const first = seen.get(hash);
      if (first) warnings.push(`Slot ${slot + 1} reuses page ${first.page} slot ${first.slot}`);
      else seen.set(hash, { page: number, slot: slot + 1 });
      try {
        const photo = await sharp(source, { limitInputPixels: 32_000_000 }).metadata();
        if (!['jpeg', 'png', 'webp'].includes(photo.format) || photo.pages > 1) {
          errors.push(`Slot ${slot + 1} requires a still JPEG, PNG or WebP`);
          continue;
        }
        const width = photo.autoOrient?.width ?? photo.width;
        const height = photo.autoOrient?.height ?? photo.height;
        const [, , fw, fh] = photoFrame(layouts[page.template][slot], style.margin);
        const photoRatio = width / height;
        const frameRatio = fw / fh;
        const retained = Math.min(photoRatio / frameRatio, frameRatio / photoRatio);
        if (page.fit === 'cover' && retained < 0.99) {
          warnings.push(`Slot ${slot + 1} cover crops about ${Math.round((1 - retained) * 100)}%; check face, hands and garment.`);
        }
      } catch {
        errors.push(`Slot ${slot + 1} image cannot be decoded`);
      }
    }
    const review = ctx.pages[index].visual;
    if (review?.status !== 'pass' || review.stamp !== page.stamp) warnings.push('Visual review required for this page revision');
    const prefix = `page-${String(number).padStart(2, '0')}`;
    const files = { png: `${prefix}.png`, svg: `${prefix}.svg` };
    let verified = false;
    if (renders) {
      try {
        const png = await sharp(path.join(renders, files.png)).metadata();
        const svgFile = path.join(renders, files.svg);
        const svg = fs.readFileSync(svgFile, 'utf8');
        const dimensions = await sharp(svgFile).metadata();
        if (png.format !== 'png' || png.width !== 1200 || png.height !== 1600
          || dimensions.width !== 1200 || dimensions.height !== 1600) errors.push('Expected 1200 × 1600 SVG and PNG');
        if (!svg.includes(`<metadata id="project-fingerprint">${page.stamp}</metadata>`)) errors.push('SVG is from a different page revision');
        if (!errors.length) {
          const supplied = await sharp(path.join(renders, files.png)).ensureAlpha().raw().toBuffer();
          const expected = await sharp(svgFile).ensureAlpha().raw().toBuffer();
          if (!supplied.equals(expected)) errors.push('PNG pixels do not match the SVG');
          else verified = true;
        }
      } catch {
        errors.push('Page is missing a readable PNG or SVG');
      }
    }
    output.push({ page: number, template: page.template, stamp: page.stamp, files, shots: page.revisions,
      verified, visualApproved: review?.status === 'pass' && review.stamp === page.stamp, errors, warnings });
  }
  return { ready: !!renders && output.every((page) => page.verified && page.visualApproved && !page.errors.length), pages: output };
}

async function visualSheet(items, output, columns = 3) {
  const sharp = require('sharp');
  ensure(items.length > 0, 'No images to display.');
  const width = 330;
  const height = 430;
  const margin = 18;
  const rows = Math.ceil(items.length / columns);
  const cards = [];
  for (const [index, item] of items.entries()) {
    const left = (index % columns) * width + margin;
    const top = Math.floor(index / columns) * height + margin;
    const photo = await sharp(item.file).autoOrient().resize(width - 2 * margin, 362,
      { fit: 'contain', background: '#ede9e0' }).png().toBuffer();
    const label = Buffer.from(`<svg width="294" height="40" xmlns="http://www.w3.org/2000/svg"><text x="0" y="23" font-family="sans-serif" font-size="16" fill="#2a2521">${xml(item.label)}</text></svg>`);
    cards.push({ input: photo, left, top }, { input: label, left, top: top + 369 });
  }
  const buffer = await sharp({ create: { width: width * columns, height: height * rows, channels: 3,
    background: '#f8f5ee' } }).composite(cards).png().toBuffer();
  fs.writeFileSync(output, buffer, { flag: 'wx' });
}

module.exports = { makeManifest, changedPages, preflight, visualSheet };
