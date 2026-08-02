export type TextSpan = {
  start: number;
  end: number;
  phrase: string;
};

export function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip common Markdown wrappers so span matching works on formatted answers. */
export function stripMarkdownForSpanMatch(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/~~([^~]+)~~/g, "$1");
}

/** Build a regex that matches `from` with flexible whitespace. */
export function buildFlexibleSpanPattern(from: string): RegExp | null {
  const trimmed = from.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const pattern = parts.map((part) => escapeRegExp(part)).join("\\s+");
  return new RegExp(pattern);
}

/** Allow optional Markdown emphasis around each word in `from`. */
export function buildMarkdownFlexiblePattern(from: string): RegExp | null {
  const trimmed = from.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const wrap = "(?:\\*\\*|\\*|__|_|~~|`)?";
  const pattern = parts
    .map((part) => `${wrap}${escapeRegExp(part)}${wrap}`)
    .join("\\s+");
  return new RegExp(pattern);
}

export function findSpanInText(text: string, from: string): TextSpan | null {
  if (!from || !text) return null;

  const exactStart = text.indexOf(from);
  if (exactStart >= 0) {
    return { start: exactStart, end: exactStart + from.length, phrase: from };
  }

  const flexible = buildFlexibleSpanPattern(from);
  if (flexible) {
    const match = flexible.exec(text);
    if (match && match.index >= 0) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        phrase: match[0],
      };
    }
  }

  const markdownFlexible = buildMarkdownFlexiblePattern(from);
  if (markdownFlexible) {
    const match = markdownFlexible.exec(text);
    if (match && match.index >= 0) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        phrase: match[0],
      };
    }
  }

  return null;
}

export function spanExistsInText(text: string, from: string): boolean {
  return findSpanInText(text, from) !== null;
}

export function isFullAnswerCoverage(answerText: string, from: string): boolean {
  const answer = normalizeForCompare(answerText);
  const span = normalizeForCompare(from);
  if (!answer || !span) return false;
  if (answer === span) return true;
  if (span.length >= answer.length * 0.7) return true;
  return answer.startsWith(span) && span.length >= answer.length * 0.55;
}
