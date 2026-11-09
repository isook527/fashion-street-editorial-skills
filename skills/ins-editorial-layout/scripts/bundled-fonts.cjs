const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

function configureFonts() {
  const fonts = path.resolve(__dirname, '../fonts');
  if (!['NotoSansCJKsc-Regular.otf', 'NotoSerifCJKsc-Regular.otf'].every((file) => fs.existsSync(path.join(fonts, file)))) return false;
  const key = createHash('sha256').update(fonts).digest('hex').slice(0, 16);
  const folder = path.join(os.tmpdir(), `fashion-fonts-${key}`);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const config = path.join(folder, 'fonts.conf');
  const xml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pending = path.join(folder, `fonts-${process.pid}.conf`);
  fs.writeFileSync(pending, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>${xml(fonts)}</dir><cachedir>${xml(folder)}</cachedir>
<alias><family>sans-serif</family><prefer><family>Noto Sans CJK SC</family></prefer></alias>
<alias><family>serif</family><prefer><family>Noto Serif CJK SC</family></prefer></alias>
<alias><family>monospace</family><prefer><family>Noto Sans CJK SC</family></prefer></alias></fontconfig>`);
  fs.renameSync(pending, config);
  process.env.FONTCONFIG_FILE = config;
  return true;
}
function useFonts() {
  if (!configureFonts() && !process.env.FASHION_FONT_WARNING_SHOWN) {
    console.error('未找到随包字体，中文将使用系统字体；运行 npm run fonts 获取');
    process.env.FASHION_FONT_WARNING_SHOWN = '1';
  }
}
module.exports = { configureFonts, useFonts };
