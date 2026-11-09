#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseArgs } = require('node:util');
const layouts = require('./layouts.cjs');

const { readStyle, photoFrame, checkText } = require('./layout-style.cjs');

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]);
}

async function loadPhoto(sharp, filename) {
  const photo = sharp(filename, { limitInputPixels: 32_000_000 });
  const { format, pages } = await photo.metadata();
  if (!['jpeg', 'png', 'webp'].includes(format) || pages > 1) {
    throw new Error(`Expected a still JPEG, PNG, or WebP image: ${filename}`);
  }
  const buffer = await photo.autoOrient()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .png().toBuffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function makeSvg(rectangles, photos, style, fit, title, subtitle, stamp) {
  const { theme, font, margin } = style;
  const right = 1200 - margin;
  const framing = fit === 'cover' ? 'slice' : 'meet';
  const frames = rectangles.map(([x, y, width, height], index) => {
    const box = `x="${x}" y="${y}" width="${width}" height="${height}"`;
    return `<g id="photo-${index + 1}">
  <rect ${box} fill="${theme.mat}"/>
  <clipPath id="frame-${index + 1}"><rect ${box}/></clipPath>
  <image ${box} clip-path="url(#frame-${index + 1})" href="${photos[index]}" preserveAspectRatio="xMidYMid ${framing}"/>
</g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
${stamp ? `<metadata id="project-fingerprint">${stamp}</metadata>\n` : ''}<rect width="1200" height="1600" fill="${theme.canvas}"/>
<path d="M${margin} 161H${right} M${margin} 1450H${right}" stroke="${theme.line}" stroke-width="2"/>
${frames}
<g font-family="${font}" fill="${theme.ink}">
  <text id="title" x="${margin}" y="124" font-size="56" font-weight="600">${title}</text>
  <text id="subtitle" x="${margin}" y="1510" font-size="29">${subtitle}</text>
</g>
</svg>\n`;
}

async function writePair(prefix, svg, png) {
  const svgPath = `${prefix}.svg`;
  const pngPath = `${prefix}.png`;
  const created = [];
  try {
    for (const [filename, bytes] of [[svgPath, svg], [pngPath, png]]) {
      const file = await fs.open(filename, 'wx');
      created.push(filename);
      try {
        await file.writeFile(bytes);
      } finally {
        await file.close();
      }
    }
  } catch (error) {
    await Promise.allSettled(created.map((filename) => fs.unlink(filename)));
    throw error;
  }
  return { svg: svgPath, png: pngPath };
}

async function main() {
  const { values } = parseArgs({ options: {
    template: { type: 'string' },
    photo: { type: 'string', multiple: true, default: [] },
    out: { type: 'string' },
    title: { type: 'string', default: '' },
    subtitle: { type: 'string', default: '' },
    palette: { type: 'string', default: 'paper' },
    fit: { type: 'string', default: 'contain' },
    font: { type: 'string', default: 'sans' },
    margin: { type: 'string', default: '60' },
    stamp: { type: 'string', default: '' },
    list: { type: 'boolean' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node render.cjs --template ID --photo FILE [--photo FILE] --out PREFIX [--title TEXT] [--subtitle TEXT] [--palette paper|graphite|moss|blue] [--fit contain|cover] [--font sans|serif|mono] [--margin 60..120]\nUse --list to see the photo count for each template.');
    return;
  }
  if (values.list) {
    for (const [id, frames] of Object.entries(layouts)) console.log(`${id}\t${frames.length}`);
    return;
  }
  if (!Object.hasOwn(layouts, values.template) || !values.out) {
    throw new Error('Choose a template from --list and provide --out.');
  }
  const frames = layouts[values.template];
  if (values.photo.length !== frames.length) {
    throw new Error(`${values.template} needs exactly ${frames.length} photo(s).`);
  }
  if (!['contain', 'cover'].includes(values.fit)) throw new Error('Unknown fit. See --help.');
  if (values.stamp && !/^[a-f0-9]{64}$/.test(values.stamp)) throw new Error('Invalid project fingerprint.');
  const style = readStyle({ palette: values.palette, font: values.font, margin: Number(values.margin) });
  const title = escapeXml(checkText(values.title, 18, 'Title'));
  const subtitle = escapeXml(checkText(values.subtitle, 34, 'Subtitle'));
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    throw new Error('Install sharp with npm ci in the ins-editorial-layout directory.');
  }
  const photos = [];
  for (const file of values.photo) photos.push(await loadPhoto(sharp, file));
  const svg = makeSvg(frames.map((frame) => photoFrame(frame, style.margin)), photos, style, values.fit, title, subtitle, values.stamp);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const paths = await writePair(path.resolve(values.out), svg, png);
  console.log(JSON.stringify({ template: values.template, ...paths, width: 1200, height: 1600 }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
