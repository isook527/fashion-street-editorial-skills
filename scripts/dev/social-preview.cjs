#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { configureFonts } = require('../../skills/ins-editorial-layout/scripts/bundled-fonts.cjs');

async function main() {
  if (!configureFonts()) throw new Error('Install the project fonts with npm run fonts before rendering the preview.');
  const sharp = require('../../skills/ins-editorial-layout/node_modules/sharp');
  const directory = path.resolve(__dirname, '../../docs/images');
  const panel = await sharp(path.join(directory, 'pocket-review.png')).resize({ width: 1176 }).png().toBuffer();
  const header = Buffer.from([
    '<svg width="1280" height="105" xmlns="http://www.w3.org/2000/svg">',
    '<rect x="52" y="37" width="6" height="49" rx="3" fill="#547264"/>',
    '<text x="79" y="74" fill="#25392f" font-family="Noto Sans CJK SC" font-size="44" font-weight="bold">Fashion Street Editorial Skills</text>',
    '</svg>',
  ].join(''));
  const canvas = sharp({ create: { width: 1280, height: 640, channels: 3, background: '#f6f4ef' } })
    .composite([{ input: header, left: 0, top: 0 }, { input: panel, left: 52, top: 105 }]);
  let output = await canvas.clone().png({ compressionLevel: 9 }).toBuffer();
  if (output.length >= 1_000_000) output = await canvas.png({ palette: true, colours: 256, compressionLevel: 9 }).toBuffer();
  if (output.length >= 1_000_000) throw new Error('The social preview exceeds the GitHub upload limit.');
  const destination = path.join(directory, 'social-preview.png');
  await fs.writeFile(destination, output, { flag: 'wx' });
  console.log('Wrote ' + destination + ' (' + output.length + ' bytes)');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
