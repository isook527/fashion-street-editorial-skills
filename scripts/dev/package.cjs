#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const dist = path.join(root, 'dist');
const layout = 'skills/ins-editorial-layout';
const version = process.argv[2];
const pkg = require('../../skills/ins-editorial-layout/package.json');

function main() {
  if (process.argv.length !== 3 || !/^\d+\.\d+\.\d+$/.test(version ?? '') || version !== pkg.version) {
    throw new Error('Provide the package.json version: node scripts/dev/package.cjs 0.6.0');
  }
  let checkout;
  try {
    checkout = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    checkout = null;
  }
  if (!checkout || fs.realpathSync(checkout) !== fs.realpathSync(root)) {
    throw new Error('Run inside a git checkout; package.cjs uses git ls-files to exclude untracked files.');
  }
  execFileSync(process.execPath, [path.join(__dirname, 'lint-skills.cjs')], { stdio: 'inherit' });
  const job = (name, source, fonts = false, suffix = '') => ({ name, source, fonts, file: name + '-' + version + suffix + '.zip' });
  const jobs = [
    job('ai-outfit-blogger', 'skills/ai-outfit-blogger'),
    job('ins-editorial-layout', layout),
    job('ins-editorial-layout', layout, true, '-with-fonts'),
    job('fashion-street-editorial-skills', ''),
  ];
  const outputs = [...jobs.map(({ file }) => file), 'SHA256SUMS.txt'];
  fs.mkdirSync(dist, { recursive: true });
  for (const file of outputs) {
    if (fs.existsSync(path.join(dist, file))) throw new Error('Output already exists: ' + file);
  }
  const fonts = ['NotoSansCJKsc-Regular.otf', 'NotoSerifCJKsc-Regular.otf'];
  for (const name of fonts) {
    if (!fs.existsSync(path.join(root, layout, 'fonts', name))) throw new Error('Run npm run fonts --prefix ' + layout + ' before packaging.');
  }
  execFileSync(process.execPath, [path.join(root, layout, 'scripts/fetch-fonts.cjs')], { stdio: 'inherit' });
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter((file) => file && !/\.otf$/i.test(file) && !file.split('/').some((part) => ['node_modules', 'dist', '.git'].includes(part)));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fashion-pack-'));
  const created = [];
  try {
    for (const [index, { name, source, file, fonts: withFonts }] of jobs.entries()) {
      const stage = path.join(scratch, String(index));
      const selected = source ? tracked.filter((item) => item.startsWith(source + '/')) : tracked;
      const copy = (item, relative) => {
        const target = path.join(stage, name, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, item), target);
      };
      for (const item of selected) copy(item, source ? item.slice(source.length + 1) : item);
      if (source) copy('LICENSE', 'LICENSE');
      if (withFonts) for (const font of fonts) copy(path.join(layout, 'fonts', font), path.join('fonts', font));
      execFileSync('zip', ['-q', '-r', path.join(scratch, file), name], { cwd: stage, stdio: 'inherit' });
    }
    const sums = jobs.map(({ file }) => createHash('sha256').update(fs.readFileSync(path.join(scratch, file))).digest('hex') + '  ' + file);
    fs.writeFileSync(path.join(scratch, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
    for (const file of outputs) {
      const target = path.join(dist, file);
      fs.copyFileSync(path.join(scratch, file), target, fs.constants.COPYFILE_EXCL);
      created.push(target);
    }
  } catch (error) {
    for (const file of created) fs.unlinkSync(file);
    throw error;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  for (const file of outputs) console.log(file + '  ' + fs.statSync(path.join(dist, file)).size + ' bytes');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
