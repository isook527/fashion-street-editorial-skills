const { words } = require('../data/copy-risk-words.json');

const normalize = (text) => text.normalize('NFKC').toLowerCase();
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const rules = words.map(({ word, category, severity, suggestion, except = [], pattern }) => ({
  word, category, severity, suggestion, literal: normalize(word),
  exceptions: except.map(normalize).sort((a, b) => b.length - a.length),
  pattern: pattern ? new RegExp(pattern, 'u') : null,
}));

function normalizedOffsets(text) {
  let normalized = '';
  const offsets = [];
  for (const { segment, index } of segmenter.segment(text)) {
    const part = normalize(segment);
    normalized += part;
    for (let i = 0; i < part.length; i++) offsets.push(index);
  }
  return { normalized, offsets };
}

function lintCopy(copy) {
  const fields = [
    ['hook', copy.hook],
    ['caption', copy.caption],
    ...copy.hashtags.map((tag, index) => ['hashtags[' + index + ']', tag]),
    ...copy.alt.map(({ page, text }) => ['alt[' + (page - 1) + '].text', text]),
  ];
  const hits = [];
  for (const [field, text] of fields) {
    if (typeof text !== 'string') continue;
    const { normalized, offsets } = normalizedOffsets(text);
    for (const { word, category, severity, suggestion, literal, exceptions, pattern } of rules) {
      // Mask in place to keep offsets and prevent false matches across a removed phrase.
      const candidate = exceptions.reduce((value, phrase) => value.replaceAll(phrase, '\0'.repeat(phrase.length)), normalized);
      const index = pattern ? candidate.search(pattern) : candidate.indexOf(literal);
      if (index >= 0) hits.push({ field, text, word, category, severity, suggestion, index: offsets[index] });
    }
  }
  return { hits };
}

module.exports = { lintCopy };
