import type { Annotation } from "./assistant-result";

export type TextSegment = {
  type: "text";
  content: string;
};

export type AnnotationSegment = {
  type: "annotation";
  content: string;
  annotation: Annotation;
};

export type AnswerSegment = TextSegment | AnnotationSegment;

type SpanCandidate = {
  annotationIndex: number;
  annotation: Annotation;
  start: number;
  end: number;
};

type SelectedSpan = SpanCandidate;

/**
 * Overlap resolution policy (greedy, non-mutating):
 *
 * 1. Each annotation may match every non-overlapping occurrence of `from` in
 *    `answer`. Annotations whose `from` is missing or not found are ignored.
 * 2. All valid placement candidates are ranked by:
 *    a. shorter span length (smaller range wins),
 *    b. earlier start index,
 *    c. earlier annotation index in the input array (stable tie-break).
 * 3. Candidates are selected in that order while skipping any span that would
 *    overlap an already selected span. Annotations that lose every non-overlapping
 *    placement are dropped.
 *
 * The original `answer` string is never modified; segments are built from slices.
 */
export function parseAnswerSegments(
  answer: string,
  annotations: Annotation[],
): AnswerSegment[] {
  if (!answer) {
    return [{ type: "text", content: "" }];
  }

  if (!annotations.length) {
    return [{ type: "text", content: answer }];
  }

  const candidates = collectSpanCandidates(answer, annotations);
  if (!candidates.length) {
    return [{ type: "text", content: answer }];
  }

  const selected = selectNonOverlappingSpans(candidates);
  if (!selected.length) {
    return [{ type: "text", content: answer }];
  }

  selected.sort((a, b) => a.start - b.start || a.annotationIndex - b.annotationIndex);
  return buildSegments(answer, selected);
}

function collectSpanCandidates(
  answer: string,
  annotations: Annotation[],
): SpanCandidate[] {
  const candidates: SpanCandidate[] = [];

  annotations.forEach((annotation, annotationIndex) => {
    const from = annotation.from;
    if (!from) return;

    let searchFrom = 0;
    while (searchFrom <= answer.length - from.length) {
      const start = answer.indexOf(from, searchFrom);
      if (start < 0) break;

      candidates.push({
        annotationIndex,
        annotation,
        start,
        end: start + from.length,
      });

      searchFrom = start + 1;
    }
  });

  return candidates;
}

function spansOverlap(a: SelectedSpan, b: SelectedSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

function compareCandidates(a: SpanCandidate, b: SpanCandidate): number {
  const lengthA = a.end - a.start;
  const lengthB = b.end - b.start;
  if (lengthA !== lengthB) return lengthA - lengthB;
  if (a.start !== b.start) return a.start - b.start;
  return a.annotationIndex - b.annotationIndex;
}

function selectNonOverlappingSpans(
  candidates: SpanCandidate[],
): SelectedSpan[] {
  const ranked = [...candidates].sort(compareCandidates);
  const selected: SelectedSpan[] = [];

  for (const candidate of ranked) {
    const overlaps = selected.some((span) => spansOverlap(span, candidate));
    if (overlaps) continue;

    const duplicateAnnotation = selected.some(
      (span) => span.annotationIndex === candidate.annotationIndex,
    );
    if (duplicateAnnotation) continue;

    selected.push(candidate);
  }

  return selected;
}

function buildSegments(answer: string, spans: SelectedSpan[]): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start < cursor) {
      continue;
    }

    if (span.start > cursor) {
      segments.push({
        type: "text",
        content: answer.slice(cursor, span.start),
      });
    }

    segments.push({
      type: "annotation",
      content: answer.slice(span.start, span.end),
      annotation: span.annotation,
    });

    cursor = span.end;
  }

  if (cursor < answer.length) {
    segments.push({
      type: "text",
      content: answer.slice(cursor),
    });
  }

  return segments.length ? segments : [{ type: "text", content: answer }];
}
