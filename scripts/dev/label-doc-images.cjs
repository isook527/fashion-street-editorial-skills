#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { configureFonts } = require('../../skills/ins-editorial-layout/scripts/bundled-fonts.cjs');

const directory = path.resolve(__dirname, '../../docs/images');
const manifest = path.join(directory, '.labeled');
const files = [
  'editorial-editions.jpg', 'editorial-mobile.png', 'editorial-rhythm.jpg',
  'page-2-review.png', 'pocket-review.png', 'short-jacket-overview.png',
];
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function replaceFile(file, data) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, data, { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function main() {
  let sharp;
  const ledger = await fs.readFile(manifest, 'utf8').then(JSON.parse).catch((error) => {
    if (error.code === 'ENOENT') return {};
    throw error;
  });
  for (const name of files) {
    const file = path.join(directory, name);
    const input = await fs.readFile(file);
    const hash = sha256(input);
    if (ledger[name]?.labeled === hash) {
      console.log('Already labeled: ' + name);
      continue;
    }
    if (ledger[name] && ledger[name].source !== hash) {
      throw new Error('Image differs from the recorded source and labeled output: ' + name);
    }
    if (!sharp) {
      if (!configureFonts()) throw new Error('Install the project fonts with npm run fonts before labeling images.');
      sharp = require('../../skills/ins-editorial-layout/node_modules/sharp');
    }
    const picture = sharp(input);
    const { width, height } = await picture.metadata();
    const size = Math.round(Math.min(width, height) * 0.025);
    const padding = Math.max(5, Math.round(size * 0.6));
    const margin = padding + 3;
    const text = await sharp({ text: {
      text: '<span foreground="white">AI-generated · 虚构人物</span>',
      font: 'Noto Sans CJK SC ' + size,
      rgba: true,
    } }).png().toBuffer({ resolveWithObject: true });
    const labelWidth = text.info.width + padding * 2;
    const labelHeight = text.info.height + padding * 2;
    const label = await sharp({ create: {
      width: labelWidth, height: labelHeight, channels: 4,
      background: { r: 20, g: 20, b: 20, alpha: 0.78 },
    } }).composite([{ input: text.data, left: padding, top: padding }]).png().toBuffer();
    const output = await picture.composite([{
      input: label, left: width - labelWidth - margin, top: height - labelHeight - margin,
    }]).toBuffer();

    // Write the receipt first so an interruption before replacement can retry the original safely.
    ledger[name] = { source: hash, labeled: sha256(output) };
    await replaceFile(manifest, JSON.stringify(ledger, null, 2) + '\n');
    await replaceFile(file, output);
    console.log('Labeled: ' + name);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
