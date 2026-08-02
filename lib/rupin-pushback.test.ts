import { expect, test } from "bun:test";
import type { Annotation } from "./assistant-result";
import {
  findSpanInText,
  isFullAnswerCoverage,
  resolveRupinPushbackPlan,
} from "./rupin-pushback";

const prior =
  "Seoul is the capital of Korea. It has about 10 million people. The best season is autumn.";

test("resolveRupinPushbackPlan maps replace revision to replace mode", () => {
  const annotations: Annotation[] = [
    {
      id: "a1",
      source: "revision",
      action: "replace",
      from: "The best season is autumn.",
      replacement: "Spring is also popular.",
      reason: "Contradicts new answer",
    },
  ];

  expect(resolveRupinPushbackPlan(annotations, prior)).toEqual({
    mode: "replace",
    from: "The best season is autumn.",
    replacement: "Spring is also popular.",
    reason: "Contradicts new answer",
    annotationId: "a1",
  });
});

test("resolveRupinPushbackPlan maps redact revision to redact mode", () => {
  const annotations: Annotation[] = [
    {
      id: "a1",
      source: "revision",
      action: "redact",
      from: "about 10 million people",
      replacement: null,
      reason: "User doubted the statistic",
    },
  ];

  expect(resolveRupinPushbackPlan(annotations, prior)?.mode).toBe("redact");
});

test("resolveRupinPushbackPlan maps full hide to ignore-full", () => {
  const annotations: Annotation[] = [
    {
      id: "a1",
      source: "revision",
      action: "hide",
      from: prior,
      replacement: null,
      reason: "User rejected the answer",
    },
  ];

  expect(resolveRupinPushbackPlan(annotations, prior)?.mode).toBe(
    "ignore-full",
  );
});

test("resolveRupinPushbackPlan maps partial hide to ignore-span", () => {
  const annotations: Annotation[] = [
    {
      id: "a1",
      source: "revision",
      action: "hide",
      from: "The best season is autumn.",
      replacement: null,
      reason: "User is not interested in seasons",
    },
  ];

  expect(resolveRupinPushbackPlan(annotations, prior)?.mode).toBe(
    "ignore-span",
  );
});

test("resolveRupinPushbackPlan ignores uncertainty annotations", () => {
  const annotations: Annotation[] = [
    {
      id: "a1",
      source: "uncertainty",
      action: "redact",
      from: "maybe wrong",
      replacement: null,
      reason: "Self doubt",
    },
  ];

  expect(resolveRupinPushbackPlan(annotations, prior)).toBeNull();
});

test("isFullAnswerCoverage detects near-full spans", () => {
  expect(isFullAnswerCoverage(prior, prior)).toBe(true);
  expect(isFullAnswerCoverage(prior, prior.slice(0, 80))).toBe(true);
  expect(isFullAnswerCoverage(prior, "autumn.")).toBe(false);
});

test("findSpanInText returns null when substring is missing", () => {
  expect(findSpanInText(prior, "Tokyo")).toBeNull();
  expect(findSpanInText(prior, "Seoul")).toEqual({
    start: 0,
    end: 5,
    phrase: "Seoul",
  });
});
