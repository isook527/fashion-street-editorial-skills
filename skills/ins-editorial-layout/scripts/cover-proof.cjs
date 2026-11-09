const fs = require('node:fs');
const { getFormat } = require('./advanced-layout.cjs');
const { configureFonts } = require('./bundled-fonts.cjs');

async function coverProof(file, out, formatName, viewport = 360) {
  if (!Number.isSafeInteger(viewport) || viewport < 240 || viewport > 720) throw new Error('Viewport must be 240–720 px.');
  configureFonts();
  const sharp = require('sharp');
  const format = getFormat(formatName);
  const image = sharp(file);
  const { width, height } = await image.metadata();
  if (width !== format.width || height !== format.height) throw new Error('Cover dimensions do not match the requested format.');
  const previewHeight = Math.round(height * viewport / width);
  const gridWidth = format.grid ? Math.min(width, height * 3 / 4) : width;
  const left = (width - gridWidth) / 2;
  const safe = { left: Math.max(60, left + 16), top: 80, right: Math.min(width - 60, width - left - 16), bottom: height - 80 };
  const overlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
<rect x="${left + 2}" y="2" width="${gridWidth - 4}" height="${height - 4}" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="16 12"/>
<rect x="${safe.left}" y="${safe.top}" width="${safe.right - safe.left}" height="${safe.bottom - safe.top}" fill="none" stroke="#24e7ff" stroke-width="5"/>
</svg>`);
  const proof = await image.composite([{ input: overlay }]).png().toBuffer();
  fs.writeFileSync(out + '-safe.png', proof, { flag: 'wx' });
  const mobile = await sharp(file).resize({ width: viewport }).png().toBuffer();
  fs.writeFileSync(out + '-mobile.png', mobile, { flag: 'wx' });
  const files = [out + '-safe.png', out + '-mobile.png'];
  if (format.grid) {
    const grid = await sharp(file).extract({ left: Math.floor(left), top: 0, width: Math.floor(gridWidth), height })
      .resize({ width: viewport }).png().toBuffer();
    fs.writeFileSync(out + '-grid.png', grid, { flag: 'wx' });
    files.push(out + '-grid.png');
  }
  return { format: formatName, safe, viewport: { width: viewport, height: previewHeight }, holdSeconds: 3,
    exercise: ['3 秒内写出主体是什么', '写出为什么想点开', '两项有一项说不出就改封面'],
    files, verdict: 'human-review-required' };
}

module.exports = { coverProof };
