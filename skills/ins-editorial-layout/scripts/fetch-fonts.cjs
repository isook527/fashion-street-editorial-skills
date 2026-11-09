#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');

const fontDir = path.join(__dirname, '../fonts');
const upstream = 'https://raw.githubusercontent.com/notofonts/noto-cjk';
const fonts = {
  Sans: ['NotoSansCJKsc-Regular.otf', 'Sans2.004/Sans/OTF/SimplifiedChinese'],
  Serif: ['NotoSerifCJKsc-Regular.otf', 'Serif2.003/Serif/OTF/SimplifiedChinese'],
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function main() {
  const { values } = parseArgs({ options: { from: { type: 'string' } } });
  const notice = await fs.readFile(path.join(fontDir, 'NOTICE.md'), 'utf8');
  const expected = Object.fromEntries([...notice.matchAll(/^\| Noto (Sans|Serif).*?\| ([0-9a-f]{64}) \|/gm)]
    .map(([, family, digest]) => [family, digest]));
  for (const [family, [name, release]] of Object.entries(fonts)) {
    const digest = expected[family];
    if (!digest) throw new Error('Missing font checksum in NOTICE.md: ' + name);
    const target = path.join(fontDir, name);
    const existing = await fs.readFile(target).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (existing) {
      if (hash(existing) !== digest) throw new Error('Existing font failed SHA-256; move it out of fonts/ and retry: ' + name);
      console.log('Verified ' + name + ' (already present)');
      continue;
    }
    let data;
    if (values.from) {
      data = await fs.readFile(path.join(values.from, name));
    } else {
      const response = await fetch([upstream, release, name].join('/'), { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error('Font download failed: ' + name + ' (HTTP ' + response.status + ')');
      data = Buffer.from(await response.arrayBuffer());
    }
    if (hash(data) !== digest) throw new Error('SHA-256 mismatch; no unverified font was written: ' + name);
    await fs.writeFile(target, data, { flag: 'wx' });
    console.log('Installed ' + name);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
