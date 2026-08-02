import { expect, test } from "bun:test";
import type { Annotation } from "./assistant-result";
import {
  findSpanInText,
  isFullAnswerCoverage,
  mergeRupinSelfRevisionPlans,
  resolveRupinPushbackPlan,
  resolveRupinSelfRevisionPlans,
} from "./rupin-pushback";
import type { RupinPushbackPlan } from "./rupin-pushback";

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

  expect(resolveRupinPushbackPlan(annotations, prior)).toMatchObject({
    mode: "replace",
    from: "The best season is autumn.",
    matchedPhrase: "The best season is autumn.",
    replacement: "Spring is also popular.",
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

test("resolveRupinSelfRevisionPlans collects uncertainty annotations", () => {
  const answer = "Great question! Maybe Seoul is sort of the best city.";
  const annotations: Annotation[] = [
    {
      id: "a1",
      source: "uncertainty",
      action: "redact",
      from: "Great question!",
      replacement: null,
      reason: "Flattery",
    },
    {
      id: "a2",
      source: "uncertainty",
      action: "replace",
      from: "sort of the best city",
      replacement: "a major city",
      reason: "Vague wording",
    },
  ];

  const plans = resolveRupinSelfRevisionPlans(annotations, answer);
  expect(plans).toHaveLength(2);
  expect(plans.map((plan) => plan.mode)).toEqual(["replace", "redact"]);
});

test("resolveRupinSelfRevisionPlans coerces guess redact into replace", () => {
  const answer = "서울은 수도입니다. 아마 그런 의도였을 겁니다.";
  const annotations: Annotation[] = [
    {
      id: "a1",
      source: "uncertainty",
      action: "redact",
      from: "아마 그런 의도였을 겁니다.",
      replacement: null,
      reason: "Presenting a guess as fact",
    },
  ];

  expect(resolveRupinSelfRevisionPlans(annotations, answer)[0]).toMatchObject({
    mode: "replace",
    matchedPhrase: "아마 그런 의도였을 겁니다.",
  });
});

test("resolveRupinSelfRevisionPlans coerces inaccuracy admission into redact", () => {
  const answer = "서울은 수도입니다. 제가 틀렸습니다.";
  const annotations: Annotation[] = [
    {
      id: "a1",
      source: "uncertainty",
      action: "replace",
      from: "제가 틀렸습니다.",
      replacement: "정확히 말하면 서울은 수도입니다.",
      reason: "Admission of inaccuracy",
    },
  ];

  expect(resolveRupinSelfRevisionPlans(annotations, answer)[0]).toMatchObject({
    mode: "redact",
    matchedPhrase: "제가 틀렸습니다.",
  });
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

test("mergeRupinSelfRevisionPlans combines annotation and fallback plans", () => {
  const answer =
    "Great question! Seoul is maybe the best city. People usually agree.";

  const annotationPlans: RupinPushbackPlan[] = [
    {
      mode: "redact",
      from: "Great question!",
      matchedPhrase: "Great question!",
      reason: "Flattery",
      annotationId: "a1",
    },
  ];

  const fallbackPlans: RupinPushbackPlan[] = [
    {
      mode: "redact",
      from: "maybe",
      matchedPhrase: "maybe",
      reason: "Fallback hedging",
      annotationId: "fallback-hedging",
    },
  ];

  const merged = mergeRupinSelfRevisionPlans(
    annotationPlans,
    fallbackPlans,
    answer,
  );

  expect(merged).toHaveLength(2);
  expect(merged.map((plan) => plan.annotationId)).toEqual([
    "fallback-hedging",
    "a1",
  ]);
});

test("mergeRupinSelfRevisionPlans skips overlapping fallback plans", () => {
  const answer = "Great question! Seoul is nice.";

  const annotationPlans: RupinPushbackPlan[] = [
    {
      mode: "redact",
      from: "Great question!",
      matchedPhrase: "Great question!",
      reason: "Flattery",
      annotationId: "a1",
    },
  ];

  const fallbackPlans: RupinPushbackPlan[] = [
    {
      mode: "redact",
      from: "Great question!",
      matchedPhrase: "Great question!",
      reason: "Duplicate flattery",
      annotationId: "fallback-flattery",
    },
  ];

  expect(
    mergeRupinSelfRevisionPlans(annotationPlans, fallbackPlans, answer),
  ).toHaveLength(1);
});

test("mergeRupinSelfRevisionPlans caps at five plans", () => {
  const answer = "one two three four five six seven eight nine ten";
  const makePlan = (id: string, phrase: string): RupinPushbackPlan => ({
    mode: "redact",
    from: phrase,
    matchedPhrase: phrase,
    reason: "test",
    annotationId: id,
  });

  const annotationPlans = ["one", "three", "five", "seven"].map((word, index) =>
    makePlan(`a${index}`, word),
  );
  const fallbackPlans = ["two", "four", "six", "eight", "nine"].map(
    (word, index) => makePlan(`f${index}`, word),
  );

  expect(
    mergeRupinSelfRevisionPlans(annotationPlans, fallbackPlans, answer),
  ).toHaveLength(5);
});
