const palettes = {
  paper: { canvas: '#f5f1e8', mat: '#e9e2d6', ink: '#252320', line: '#8a4f36' },
  graphite: { canvas: '#25272c', mat: '#35383f', ink: '#f6f1e7', line: '#edba89' },
  moss: { canvas: '#e6eadf', mat: '#d3dbcc', ink: '#253b2c', line: '#58725e' },
  blue: { canvas: '#e9edf3', mat: '#d9e1ec', ink: '#243756', line: '#456385' },
};

const fonts = {
  sans: 'Noto Sans CJK SC, PingFang SC, Arial, sans-serif',
  serif: 'Noto Serif CJK SC, Songti SC, Georgia, serif',
  mono: 'Menlo, Courier New, monospace',
};

function readStyle({ palette = 'paper', font = 'sans', margin = 60 } = {}) {
  if (!Object.hasOwn(palettes, palette) || !Object.hasOwn(fonts, font)) {
    throw new Error('Unknown palette or font.');
  }
  if (!Number.isInteger(margin) || margin < 60 || margin > 120) {
    throw new Error('Margin must be an integer between 60 and 120.');
  }
  return { theme: palettes[palette], font: fonts[font], margin };
}

function photoFrame([left, top, width, height], margin) {
  const scale = (1200 - 2 * margin) / 1080;
  return [margin + (left - 60) * scale, top, width * scale, height];
}

function checkText(value, limit, field) {
  if (typeof value !== 'string' || [...value.trim()].length > limit || /[\p{Cc}\p{Cs}]/u.test(value.trim())) {
    throw new Error(`${field} must be at most ${limit} characters on one line.`);
  }
  return value.trim();
}

module.exports = { readStyle, photoFrame, checkText };
