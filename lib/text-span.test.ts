import { expect, test } from "bun:test";

import {
  findSpanInText,
  spanExistsInText,
  stripMarkdownForSpanMatch,
} from "./text-span";

test("findSpanInText matches flexible whitespace", () => {
  const text = "That is   a great question! Seoul is nice.";
  expect(findSpanInText(text, "That is a great question!")).toEqual({
    start: 0,
    end: 27,
    phrase: "That is   a great question!",
  });
});

test("findSpanInText matches markdown emphasis", () => {
  const text = "This is **the most effective** method in Seoul.";
  expect(findSpanInText(text, "the most effective")).toEqual({
    start: 10,
    end: 28,
    phrase: "the most effective",
  });
});

test("stripMarkdownForSpanMatch removes common wrappers", () => {
  expect(stripMarkdownForSpanMatch("**bold** and _italic_")).toBe(
    "bold and italic",
  );
});

test("spanExistsInText returns false for missing spans", () => {
  expect(spanExistsInText("hello world", "goodbye")).toBe(false);
});
