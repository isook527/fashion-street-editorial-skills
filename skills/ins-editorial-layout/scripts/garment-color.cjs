const fs = require('node:fs');
const { sha } = require('./project-plan.cjs');

function srgb(v) {
  const n = v / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function lab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(srgb);
  const f = (v) => v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116;
  const x = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
  const y = f(0.2126729 * R + 0.7151522 * G + 0.0721750 * B);
  const z = f((0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const round = (n) => Math.round(n * 100) / 100;

async function swatch(file, rect) {
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some((v) => !Number.isFinite(v) || v < 0)
    || rect[2] <= 0 || rect[3] <= 0 || rect[0] + rect[2] > 1 || rect[1] + rect[3] > 1) {
    throw new Error('Use normalized [x,y,width,height] swatches inside the image.');
  }
  const sharp = require('sharp');
  const raw = fs.readFileSync(file);
  const oriented = await sharp(raw, { limitInputPixels: 32_000_000 }).autoOrient().toColourspace('srgb').removeAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  const [x, y, w, h] = rect;
  const { width, height, channels } = oriented.info;
  const left = Math.floor(x * width), top = Math.floor(y * height);
  const area = { left, top, width: Math.min(width - left, Math.round(w * width)),
    height: Math.min(height - top, Math.round(h * height)) };
  if (area.width < 8 || area.height < 8) throw new Error('Swatches need at least 8 × 8 source pixels.');
  const pixels = await sharp(oriented.data, { raw: { width, height, channels } }).extract(area)
    .resize(24, 24, { fit: 'fill' }).raw().toBuffer();
  const values = [];
  for (let i = 0; i < pixels.length; i += 3) values.push(lab([pixels[i], pixels[i + 1], pixels[i + 2]]));
  const median = [0, 1, 2].map((channel) => values.map((v) => v[channel]).sort((a, b) => a - b)[Math.floor(values.length / 2)]);
  const spread = values.map((v) => distance(v, median)).sort((a, b) => a - b)[Math.floor(values.length * 0.9)];
  const clipped = pixels.filter((v) => v <= 2 || v >= 253).length / pixels.length;
  return { sha256: sha(raw), lab: median.map(round), spread, clipped };
}

async function compareColor(config) {
  const { reference, image, referenceRect, imageRect, threshold, matchedLighting } = config;
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('Choose a positive ΔE76 threshold for this project.');
  const [a, b] = await Promise.all([swatch(reference, referenceRect), swatch(image, imageRect)]);
  const delta = distance(a.lab, b.lab);
  const issues = [];
  if (matchedLighting !== true) issues.push('Lighting and white balance have not been matched');
  if (Math.max(a.spread, b.spread) > 8) issues.push('Swatch is not sufficiently uniform');
  if (Math.max(a.clipped, b.clipped) > 0.2) issues.push('Swatch may contain clipped channels');
  return { method: 'CIE76-D65-sRGB', referenceSha256: a.sha256, imageSha256: b.sha256,
    referenceRect, imageRect, referenceLab: a.lab, imageLab: b.lab, threshold,
    deltaE: round(delta), verdict: issues.length ? 'unknown' : delta <= threshold ? 'pass' : 'fail', issues };
}

module.exports = { compareColor };
