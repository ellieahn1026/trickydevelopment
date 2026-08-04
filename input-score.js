/** Messages at or below this score trigger doubt → distant → runaway penalties. */
const LOW_SCORE_THRESHOLD = 4;

const LOW_QUALITY_PATTERNS = [
  /^(hi+|hey+|hello+|yo+|sup|test|ok+|okay|k|hmm+|um+|uh+)[!.?\s]*$/i,
  /^.{1,10}$/,
  /\b(please talk|say something|answer me|why won't you|just talk)\b/i,
  /\b(lol|lmao|haha|ㅋ+|ㅎ+)\b/i,
  /\?{2,}/,
];

const HIGH_QUALITY_PATTERNS = [
  /\b(because|therefore|specifically|example|research|article|analysis)\b/i,
  /\b(compare|explain|detail|context|evidence|source)\b/i,
  /.{72,}/,
];

/**
 * Scores a user message from 1 (low effort / intrusive) to 5 (substantive).
 * Biased low so Potter penalties and negative agent reactions trigger more often.
 */
function scoreInput(text) {
  if (!text.trim()) return 5;

  const trimmed = text.trim();
  let score = 2.5;

  if (trimmed.length < 6) score -= 1.2;
  else if (trimmed.length < 14) score -= 0.6;
  else if (trimmed.length >= 36) score += 0.5;
  else if (trimmed.length >= 80) score += 0.8;

  const questions = (trimmed.match(/\?/g) ?? []).length;
  const exclamations = (trimmed.match(/!/g) ?? []).length;

  if (questions >= 2) score -= 0.5;
  if (exclamations >= 2) score -= 0.4;
  if (questions === 0 && trimmed.length < 24) score -= 0.25;

  if (LOW_QUALITY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    score -= 1.1;
  }

  if (HIGH_QUALITY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    score += 0.9;
  }

  // Slight downward variance — most messages land below the pass threshold.
  if (Math.random() < 0.42) score -= 0.75;

  return Math.max(1, Math.min(5, Math.round(score)));
}

function isLowScore(score) {
  return score <= LOW_SCORE_THRESHOLD;
}

export { scoreInput, isLowScore, LOW_SCORE_THRESHOLD };
