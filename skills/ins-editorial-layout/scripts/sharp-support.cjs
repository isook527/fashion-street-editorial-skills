function optionalSharp() {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

function requireSharp() {
  const sharp = optionalSharp();
  if (!sharp) throw new Error('缺少 sharp，请在排版 Skill 目录运行 npm ci。 Missing sharp; run npm ci in the layout skill directory.');
  return sharp;
}

module.exports = { optionalSharp, requireSharp };
