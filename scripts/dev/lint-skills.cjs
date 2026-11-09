#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const skills = path.join(root, 'skills');
const errors = [];
const report = (file, message) => errors.push(path.relative(root, file) + ': ' + message);

function parseHeader(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('Missing YAML frontmatter.');
  const data = {};
  let section;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const entry = /^( {0}| {2})([a-z][a-z-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!entry) throw new Error('Invalid frontmatter entry: ' + line);
    const [, indent, key, raw] = entry;
    if (indent && !section) throw new Error('Unexpected indented key: ' + key);
    const target = indent ? section : data;
    if (Object.hasOwn(target, key)) throw new Error('Duplicate frontmatter key: ' + key);
    let value = raw;
    if (value?.startsWith('"')) value = JSON.parse(value);
    else if (value?.startsWith("'")) {
      if (!value.endsWith("'")) throw new Error('Unclosed quoted scalar: ' + key);
      value = value.slice(1, -1).replace(/''/g, "'");
    } else if (value && /:\s|\s#/.test(value)) throw new Error('Quote this frontmatter value: ' + key);
    target[key] = value ?? {};
    if (!indent) section = raw === undefined ? target[key] : null;
  }
  return { data, body: text.slice(match[0].length).trim() };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['.git', 'node_modules', 'dist'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    if (file === path.join(root, 'evals', 'runs')) return [];
    return entry.isDirectory() ? walk(file) : /\.md$/i.test(entry.name) ? [file] : [];
  });
}

const within = (target, dir) => {
  const relative = path.relative(dir, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

function checkLinks(file, scope) {
  const markdown = fs.readFileSync(file, 'utf8')
    .replace(/^ {0,3}([\x60~]{3,}).*[\r\n]+[\s\S]*?^ {0,3}\1[\x60~]*[ \t]*$/gm, '')
    .replace(/(\x60+)[^\r\n]*?\1/g, '');
  const destinations = [
    ...markdown.matchAll(/\]\(\s*(?:<([^>\n]+)>|((?:\\.|[^\s()\\]|\([^()\n]*\))+))/g),
    ...markdown.matchAll(/^ {0,3}\[[^\]\n]+\]:[ \t]*(?:<([^>\n]+)>|(\S+))/gm),
  ];
  for (const [, bracketed, plain] of destinations) {
    const raw = bracketed ?? plain;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(raw)) continue;
    let target;
    try {
      target = path.resolve(path.dirname(file), decodeURIComponent(raw.split(/[?#]/, 1)[0].replace(/\\([()])/g, '$1')));
    } catch {
      report(file, 'Invalid URL encoding: ' + raw);
      continue;
    }
    if (scope && !within(target, scope)) report(file, 'Link escapes its skill: ' + raw);
    else if (!fs.existsSync(target)) report(file, 'Broken link: ' + raw);
    else if (scope && !within(fs.realpathSync(target), fs.realpathSync(scope))) report(file, 'Link escapes its skill: ' + raw);
  }
}

const packageDir = path.join(skills, 'ins-editorial-layout');
const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(packageDir, 'package-lock.json'), 'utf8'));
const changelogFile = path.join(root, 'CHANGELOG.md');
const firstRelease = /^## \[(\d+\.\d+\.\d+)\]/m.exec(fs.readFileSync(changelogFile, 'utf8'));
if (firstRelease?.[1] !== pkg.version) report(changelogFile, 'Latest version differs from package.json.');
if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) {
  report(path.join(packageDir, 'package-lock.json'), 'Version differs from package.json.');
}
for (const entry of fs.readdirSync(skills, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(skills, entry.name, 'SKILL.md');
  try {
    const { data, body } = parseHeader(fs.readFileSync(file, 'utf8'));
    if (!/^[a-z-]{1,64}$/.test(data.name) || data.name !== entry.name) report(file, 'Invalid skill name or folder mismatch.');
    if (typeof data.description !== 'string' || [...data.description].length > 1024
      || !/\p{Script=Han}/u.test(data.description) || !/[A-Za-z]{2,}/.test(data.description)) report(file, 'Description needs Chinese and English, at most 1024 characters.');
    if (data.metadata?.version !== pkg.version) report(file, 'Version differs from package.json.');
    if (body.split(/\r?\n/).length > 120) report(file, 'Skill body exceeds 120 lines.');
  } catch (error) {
    report(file, error.message);
  }
}
const files = walk(root);
for (const file of files) {
  const scope = within(file, skills) ? path.join(skills, path.relative(skills, file).split(path.sep)[0]) : null;
  checkLinks(file, scope);
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
}
console.log('Checked ' + files.length + ' Markdown files; ' + errors.length + ' issue(s).');
