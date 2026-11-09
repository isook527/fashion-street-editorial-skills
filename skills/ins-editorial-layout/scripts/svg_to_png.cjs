#!/usr/bin/env node
const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4) {
  console.error('Usage: node svg_to_png.cjs edited.svg preview.png');
  process.exit(1);
}

async function main() {
  const fs = require('node:fs/promises');
  const sharp = require('sharp');
  const png = await sharp(input).png().toBuffer();
  await fs.writeFile(output, png, { flag: 'wx' });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
