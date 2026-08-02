import type { Annotation } from "./assistant-result";

export type RupinPushbackMode =
  | "redact"
  | "ignore-full"
  | "ignore-span"
  | "replace";

export type RupinPushbackPlan = {
  mode: RupinPushbackMode;
  from: string;
  replacement?: string;
  reason: string;
  annotationId: string;
};

export type TextSpan = {
  start: number;
  end: number;
  phrase: string;
};

function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** True when `from` covers most of the prior answer (user rejected the whole reply). */
export function isFullAnswerCoverage(answerText: string, from: string): boolean {
  const answer = normalizeForCompare(answerText);
  const span = normalizeForCompare(from);
  if (!answer || !span) return false;
  if (answer === span) return true;
  if (span.length >= answer.length * 0.7) return true;
  return answer.startsWith(span) && span.length >= answer.length * 0.55;
}

export function findSpanInText(text: string, from: string): TextSpan | null {
  if (!from || !text.includes(from)) return null;
  const start = text.indexOf(from);
  return { start, end: start + from.length, phrase: from };
}

/**
 * Pick the first revision annotation whose `from` appears in the prior answer.
 * Priority: replace → hide (full) → hide (span) → redact, matching annotation order.
 */
export function resolveRupinPushbackPlan(
  annotations: Annotation[],
  prevText: string,
): RupinPushbackPlan | null {
  const revisionAnnotations = annotations.filter(
    (annotation) => annotation.source === "revision",
  );

  for (const annotation of revisionAnnotations) {
    if (!findSpanInText(prevText, annotation.from)) continue;

    if (annotation.action === "replace" && annotation.replacement?.trim()) {
      return {
        mode: "replace",
        from: annotation.from,
        replacement: annotation.replacement.trim(),
        reason: annotation.reason,
        annotationId: annotation.id,
      };
    }

    if (annotation.action === "hide") {
      return {
        mode: isFullAnswerCoverage(prevText, annotation.from)
          ? "ignore-full"
          : "ignore-span",
        from: annotation.from,
        reason: annotation.reason,
        annotationId: annotation.id,
      };
    }

    if (annotation.action === "redact") {
      return {
        mode: "redact",
        from: annotation.from,
        reason: annotation.reason,
        annotationId: annotation.id,
      };
    }
  }

  return null;
}
