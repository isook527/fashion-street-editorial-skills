const formats = {
  xhs34: { width: 1200, height: 1600, top: 0, grid: false },
  ig34: { width: 1200, height: 1600, top: 0, grid: true },
  ig45: { width: 1200, height: 1500, top: 50, grid: true },
};

const advanced = {
  'full-bleed': [[0, 0, 1200, 1600]],
  'photo-overlay': [[0, 0, 1200, 1600]],
  'issue-number': [[90, 420, 1020, 990]],
  'bilingual-magazine': [[90, 388, 1020, 1010]],
};
const advancedIds = Object.keys(advanced);

function getFormat(name = 'xhs34') {
  if (!Object.hasOwn(formats, name)) throw new Error('Choose xhs34, ig34 or ig45.');
  return formats[name];
}

function protectedRects(value = []) {
  if (!Array.isArray(value) || value.some((rect) => !Array.isArray(rect) || rect.length !== 4
    || rect.some((n) => !Number.isFinite(n) || n < 0) || rect[2] <= 0 || rect[3] <= 0
    || rect[0] + rect[2] > 1 || rect[1] + rect[3] > 1)) {
    throw new Error('Protected zones must be normalized [x,y,width,height] canvas rectangles.');
  }
  return value;
}

function luminance(r, g, b) {
  const rgb = [r, g, b].map((value) => {
    const n = value / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function overlayBoxes(protectedZones, frame) {
  const boxes = [500, 330, 250].flatMap((width) => [80, 1120 - width]
    .flatMap((left) => [160, 220].flatMap((height) =>
      [frame.top + 90, frame.top + frame.height - height - 120]
        .map((top) => [left, top, width, height]))));
  const excluded = protectedRects(protectedZones).map(([x, y, w, h]) => [1200 * x, 1600 * y, 1200 * w, 1600 * h]);
  const overlaps = ([x, y, w, h], [a, b, c, d]) => x < a + c && a < x + w && y < b + d && b < y + h;
  const candidates = boxes.filter((box) => !excluded.some((other) => overlaps(box, other)));
  if (!candidates.length) throw new Error('All overlay positions overlap protected zones.');
  return { candidates, checkedProtectedZones: excluded.length };
}

function overlayResult(box, checkedProtectedZones) {
  // White type over a 74% black scrim also meets the target on white pixels.
  return { box, contrastFloor: 1.05 / (luminance(255 * 0.26, 255 * 0.26, 255 * 0.26) + 0.05),
    checkedProtectedZones };
}

function fallbackOverlay(protectedZones, frame) {
  const { candidates, checkedProtectedZones } = overlayBoxes(protectedZones, frame);
  return overlayResult(candidates[0], checkedProtectedZones);
}

async function overlayPosition(sharp, buffer, protectedZones, frame) {
  const { candidates, checkedProtectedZones } = overlayBoxes(protectedZones, frame);
  const crop = await sharp(buffer).resize(120, 160, { fit: 'cover' }).flatten({ background: '#ffffff' })
    .toColourspace('srgb').raw().toBuffer();
  const options = candidates.map((box) => {
    const [x, y, w, h] = box.map((n) => Math.round(n / 10));
    let sum = 0, squares = 0, count = 0, peak = 0;
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        const offset = (row * 120 + col) * 3;
        const value = luminance(crop[offset], crop[offset + 1], crop[offset + 2]);
        peak = Math.max(peak, value);
        sum += value;
        squares += value ** 2;
        count++;
      }
    }
    return { box, variance: squares / count - (sum / count) ** 2, peak };
  });
  const selected = options.sort((a, b) => (a.variance + (500 - a.box[2]) / 20000) - (b.variance + (500 - b.box[2]) / 20000) || a.peak - b.peak)[0];
  return overlayResult(selected.box, checkedProtectedZones);
}

function overlayType(width, titleLength, subtitleLength) {
  const inside = width - 48;
  return { title: Math.min(52, Math.floor(inside / Math.max(titleLength, 1))),
    subtitle: Math.min(25, Math.floor(inside / Math.max(subtitleLength, 1))) };
}

module.exports = { advanced, advancedIds, formats, getFormat, protectedRects, overlayPosition, fallbackOverlay, overlayType };
