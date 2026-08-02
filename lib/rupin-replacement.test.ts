import { expect, test } from "bun:test";

import {
  detectFallAndReplaceRuleId,
  ensureReplacement,
  resolveFallbackAction,
  suggestReplacement,
} from "./rupin-replacement";

test("suggestReplacement softens superlatives", () => {
  expect(
    suggestReplacement("이건 가장 좋은 방법입니다.", "fallback-superlative"),
  ).toMatch(/좋은/);
});

test("suggestReplacement softens overconfidence", () => {
  expect(
    suggestReplacement("This is definitely the answer.", "fallback-overconfidence"),
  ).toMatch(/often/i);
});

test("suggestReplacement clarifies hedging", () => {
  expect(
    suggestReplacement("Seoul is maybe the best city.", "fallback-vague-hedging"),
  ).not.toContain("maybe");
});

test("resolveFallbackAction prefers replace when a rewrite exists", () => {
  const resolved = resolveFallbackAction(
    "fallback-superlative",
    "the best option",
    "redact",
  );

  expect(resolved.mode).toBe("replace");
  expect(resolved.replacement).toMatch(/strong/i);
});

test("resolveFallbackAction keeps redact for non-rewrite categories", () => {
  const resolved = resolveFallbackAction(
    "fallback-flattery",
    "Great question!",
    "redact",
  );

  expect(resolved.mode).toBe("redact");
  expect(resolved.replacement).toBeUndefined();
});

test("resolveFallbackAction always replaces guess and confidence spans", () => {
  const guess = resolveFallbackAction(
    "fallback-guess-as-fact",
    "아마 그런 의도였을 겁니다.",
    "redact",
  );
  const confidence = resolveFallbackAction(
    "fallback-overconfidence",
    "이건 100% 맞습니다.",
    "redact",
  );

  expect(guess.mode).toBe("replace");
  expect(guess.replacement).toBeTruthy();
  expect(confidence.mode).toBe("replace");
  expect(confidence.replacement).toBeTruthy();
});

test("detectFallAndReplaceRuleId finds speculative and confident spans", () => {
  expect(detectFallAndReplaceRuleId("아마 그런 의도였을 겁니다.")).toBe(
    "fallback-guess-as-fact",
  );
  expect(detectFallAndReplaceRuleId("This is definitely the answer.")).toBe(
    "fallback-overconfidence",
  );
});

test("ensureReplacement provides a rewrite when pattern rewrite is unavailable", () => {
  const replacement = ensureReplacement(
    "확실히 그렇습니다.",
    "fallback-certainty-adverb",
  );

  expect(replacement.length).toBeGreaterThan(2);
  expect(replacement).not.toBe("확실히 그렇습니다.");
});
