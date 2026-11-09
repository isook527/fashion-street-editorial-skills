#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseArgs } = require('node:util');
const layouts = require('./layouts.cjs');
const { optionalSharp } = require('./sharp-support.cjs');
const { useFonts } = require('./bundled-fonts.cjs');
const { advancedIds, getFormat, overlayPosition, fallbackOverlay, protectedRects, overlayType } = require('./advanced-layout.cjs');

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
  return { buffer, href: `data:image/png;base64,${buffer.toString('base64')}` };
}

async function loadOriginal(filename) {
  const bytes = await fs.readFile(filename);
  const format = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
  if (!format) throw new Error('Expected a JPEG, PNG, or WebP image: ' + filename);
  return { href: 'data:image/' + format + ';base64,' + bytes.toString('base64') };
}

function makeSvg(rectangles, photos, style, fit, title, subtitle, stamp, options) {
  const { theme, font, margin } = style;
  const right = 1200 - margin;
  const framing = fit === 'cover' ? 'slice' : 'meet';
  const frames = rectangles.map(([x, y, width, height], index) => {
    const box = `x="${x}" y="${y}" width="${width}" height="${height}"`;
    return `<g id="photo-${index + 1}">
  <rect ${box} fill="${theme.mat}"/>
  <clipPath id="frame-${index + 1}"><rect ${box}/></clipPath>
  <image ${box} clip-path="url(#frame-${index + 1})" href="${photos[index].href}" preserveAspectRatio="xMidYMid ${framing}"/>
</g>`;
  }).join('\n');

  const { format, template, secondary, disclosure, overlay, typeSizes } = options;
  const footer = format.top ? 1489 : 1510;
  const text = (label, x, y, size, value) => `<text id="${label}" x="${x}" y="${y}" font-size="${size}">${value}</text>`;
  let lettering;
  if (template === 'photo-overlay') {
    const [x, y, w, h] = overlay.box;
    lettering = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000" opacity=".74"/>
<g fill="#fff">${text('title', x + 24, y + 84, typeSizes.title, title)}${text('subtitle', x + 24, y + 140, typeSizes.subtitle, subtitle)}</g>`;
  } else if (template === 'bilingual-magazine' || template === 'issue-number') {
    lettering = text('title', margin, 236, 112, title)
      + text('secondary', margin, 305, 26, secondary)
      + text('subtitle', margin, footer, 26, subtitle);
  } else if (template === 'full-bleed') {
    lettering = '';
  } else {
    lettering = `<path d="M${margin} 161H${right} M${margin} 1450H${right}" stroke="${theme.line}" stroke-width="2"/>`
      + text('title', margin, 124, 56, title) + text('subtitle', margin, footer, 29, subtitle);
  }
  const mark = disclosure ? `<g id="ai-disclosure" transform="translate(60,${format.top + format.height - 47})">
<rect width="380" height="39" rx="4" fill="#1c1b19"/>${text('disclosure-text', 14, 27, 21, disclosure).replace('<text ', '<text fill="#fff" ')}</g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${format.width}" height="${format.height}" viewBox="0 ${format.top} 1200 ${format.height}">
${stamp ? `<metadata id="project-fingerprint">${stamp}</metadata>\n` : ''}<rect width="1200" height="1600" fill="${theme.canvas}"/>
${frames}
<g font-family="${font}" fill="${theme.ink}">${lettering}${mark}</g>
</svg>\n`;
}

async function writePair(prefix, svg, png) {
  const svgPath = `${prefix}.svg`;
  const pngPath = `${prefix}.png`;
  const created = [];
  if (png === null) {
    try {
      await fs.lstat(pngPath);
      throw new Error('Output already exists: ' + pngPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const outputs = png === null ? [[svgPath, svg]] : [[svgPath, svg], [pngPath, png]];
  try {
    for (const [filename, bytes] of outputs) {
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
  return png === null ? { svg: svgPath, pngSkipped: true, reason: 'sharp unavailable' } : { svg: svgPath, png: pngPath };
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
    format: { type: 'string', default: 'xhs34' },
    secondary: { type: 'string', default: '' },
    protected: { type: 'string', default: '[]' },
    disclosure: { type: 'string', default: '' },
    list: { type: 'boolean' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node render.cjs --template ID --photo FILE [--photo FILE] --out PREFIX [--title TEXT] [--subtitle TEXT] [--palette paper|graphite|moss|blue] [--fit contain|cover] [--font sans|serif|mono] [--margin 60..120] [--format xhs34|ig34|ig45] [--secondary TEXT] [--protected JSON] [--disclosure TEXT]\nUse --list to see the photo count for each template.');
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
  const format = getFormat(values.format);
  const modern = advancedIds.includes(values.template);
  const large = ['issue-number', 'bilingual-magazine'].includes(values.template);
  if (values.template === 'issue-number' && !/^\d{1,5}$/.test(values.title)) throw new Error('Issue number needs one to five digits.');
  const title = escapeXml(checkText(values.title, modern ? 8 : 18, 'Title'));
  const subtitle = escapeXml(checkText(values.subtitle, values.template === 'photo-overlay' ? 16 : 34, 'Subtitle'));
  const secondary = escapeXml(checkText(values.secondary, large ? 34 : 0, 'Secondary line'));
  const disclosure = escapeXml(checkText(values.disclosure, 16, 'Disclosure'));
  const protectedZones = protectedRects(JSON.parse(values.protected));
  useFonts();
  const sharp = optionalSharp();
  const photos = [];
  for (const file of values.photo) photos.push(sharp ? await loadPhoto(sharp, file) : await loadOriginal(file));
  const bleed = ['full-bleed', 'photo-overlay'].includes(values.template);
  let overlay = null;
  if (values.template === 'photo-overlay') {
    overlay = sharp ? await overlayPosition(sharp, photos[0].buffer, protectedZones, format)
      : fallbackOverlay(protectedZones, format);
  }
  const typeSizes = overlay ? overlayType(overlay.box[2], [...values.title.trim()].length, [...values.subtitle.trim()].length) : null;
  const svg = makeSvg(bleed ? frames : frames.map((frame) => photoFrame(frame, style.margin)), photos, style,
    bleed ? 'cover' : values.fit, title, subtitle, values.stamp, { format, template: values.template, secondary, disclosure, overlay, typeSizes });
  const png = sharp ? await sharp(Buffer.from(svg)).png().toBuffer() : null;
  const paths = await writePair(path.resolve(values.out), svg, png);
  if (!sharp && !process.env.FASHION_SVG_WARNING_SHOWN) {
    console.error('已只输出 SVG；在有网环境运行 npm ci 后可补 PNG');
  }
  console.log(JSON.stringify({ template: values.template, ...paths, width: format.width, height: format.height, overlay }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
