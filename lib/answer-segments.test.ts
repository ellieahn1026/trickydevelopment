import { test, expect } from "bun:test";
import { parseAnswerSegments } from "./answer-segments";
import type { Annotation } from "./assistant-result";

function ann(
  partial: Partial<Annotation> & Pick<Annotation, "id" | "from">,
): Annotation {
  return {
    source: "uncertainty",
    action: "replace",
    reason: "test",
    ...partial,
  };
}

test("returns a single text segment when annotations are empty", () => {
  expect(parseAnswerSegments("Hello world.", [])).toEqual([
    { type: "text", content: "Hello world." },
  ]);
});

test("returns an empty text segment for an empty answer", () => {
  expect(parseAnswerSegments("", [])).toEqual([{ type: "text", content: "" }]);
});

test("splits answer around a matched annotation", () => {
  const segments = parseAnswerSegments("This way is 37% faster.", [
    ann({
      id: "a1",
      from: "37%",
      replacement: "about 30%",
    }),
  ]);

  expect(segments).toEqual([
    { type: "text", content: "This way is " },
    {
      type: "annotation",
      content: "37%",
      annotation: {
        id: "a1",
        source: "uncertainty",
        action: "replace",
        from: "37%",
        replacement: "about 30%",
        reason: "test",
      },
    },
    { type: "text", content: " faster." },
  ]);
});

test("ignores annotations whose from is not found", () => {
  expect(
    parseAnswerSegments("Still readable.", [
      ann({ id: "missing", from: "nope" }),
    ]),
  ).toEqual([{ type: "text", content: "Still readable." }]);
});

test("supports multiple non-overlapping annotations", () => {
  const segments = parseAnswerSegments("Alpha beta gamma.", [
    ann({ id: "a1", from: "Alpha" }),
    ann({ id: "a2", from: "gamma" }),
  ]);

  expect(segments).toEqual([
    {
      type: "annotation",
      content: "Alpha",
      annotation: expect.objectContaining({ id: "a1" }),
    },
    { type: "text", content: " beta " },
    {
      type: "annotation",
      content: "gamma",
      annotation: expect.objectContaining({ id: "a2" }),
    },
    { type: "text", content: "." },
  ]);
});

test("matches repeated substrings to distinct occurrences when possible", () => {
  const segments = parseAnswerSegments("37% here and 37% there", [
    ann({ id: "first", from: "37%" }),
    ann({ id: "second", from: "37%" }),
  ]);

  expect(segments).toEqual([
    {
      type: "annotation",
      content: "37%",
      annotation: expect.objectContaining({ id: "first" }),
    },
    { type: "text", content: " here and " },
    {
      type: "annotation",
      content: "37%",
      annotation: expect.objectContaining({ id: "second" }),
    },
    { type: "text", content: " there" },
  ]);
});

test("prefers shorter overlapping spans over longer ones", () => {
  const segments = parseAnswerSegments("The quick brown fox", [
    ann({ id: "long", from: "quick brown" }),
    ann({ id: "short", from: "brown" }),
  ]);

  expect(segments).toEqual([
    { type: "text", content: "The quick " },
    {
      type: "annotation",
      content: "brown",
      annotation: expect.objectContaining({ id: "short" }),
    },
    { type: "text", content: " fox" },
  ]);
});

test("drops lower-priority annotations when all placements overlap", () => {
  const segments = parseAnswerSegments("overlap overlap", [
    ann({ id: "first", from: "overlap overlap" }),
    ann({ id: "second", from: "overlap" }),
  ]);

  expect(segments).toEqual([
    {
      type: "annotation",
      content: "overlap",
      annotation: expect.objectContaining({ id: "second" }),
    },
    { type: "text", content: " overlap" },
  ]);
});

test("never mutates or drops unmatched answer text", () => {
  const answer = "Keep every character intact.";
  const segments = parseAnswerSegments(answer, [
    ann({ id: "bad", from: "missing" }),
    ann({ id: "good", from: "every" }),
  ]);

  expect(segments.map((segment) => segment.content).join("")).toBe(answer);
});

test("reconstructs the full answer from segment contents", () => {
  const answer = "A 37% gain and a 37% loss.";
  const segments = parseAnswerSegments(answer, [
    ann({ id: "a1", from: "37%", action: "redact" }),
    ann({ id: "a2", from: "37%", action: "hide" }),
  ]);

  expect(segments.map((segment) => segment.content).join("")).toBe(answer);
});
