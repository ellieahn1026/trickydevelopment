import { expect, test } from "bun:test";

import {
  resolveRupinPushbackFallbackPlan,
  resolveRupinSelfFallbackPlans,
  scoreSentence,
  splitSentences,
} from "./rupin-fallback";

test("resolveRupinSelfFallbackPlans redacts flattery openers", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "Great question! Seoul is the capital of Korea.",
  );

  expect(plans).toHaveLength(1);
  expect(plans[0]?.mode).toBe("redact");
  expect(plans[0]?.matchedPhrase).toMatch(/Great question!/i);
});

test("resolveRupinSelfFallbackPlans redacts hedging phrases", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "Seoul is maybe the best city for autumn travel.",
  );

  expect(plans).toHaveLength(1);
  expect(plans[0]?.mode).toBe("replace");
  expect(plans[0]?.replacement).toBeTruthy();
});

test("resolveRupinSelfFallbackPlans replaces overconfidence with fall rewrite", () => {
  const plans = resolveRupinSelfFallbackPlans("이건 100% 맞습니다. 서울은 수도입니다.");

  expect(plans.length).toBeGreaterThan(0);
  expect(plans[0]?.mode).toBe("replace");
  expect(plans[0]?.replacement).toBeTruthy();
  expect(plans[0]?.matchedPhrase).toMatch(/100%\s*맞/);
});

test("resolveRupinSelfFallbackPlans redacts unfounded flattery", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "정말 통찰력이 뛰어나시네요. 서울은 수도입니다.",
  );

  expect(plans.length).toBeGreaterThan(0);
  expect(plans[0]?.matchedPhrase).toMatch(/통찰력/);
});

test("resolveRupinSelfFallbackPlans redacts unverified agreement", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "맞아요, 당신 생각이 맞습니다. 그래서 그렇게 보입니다.",
  );

  expect(plans.length).toBeGreaterThan(0);
  expect(plans[0]?.matchedPhrase).toMatch(/맞아요/);
});

test("resolveRupinSelfFallbackPlans replaces guess-as-fact phrasing", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "아마 그 사람이 그런 의도였을 겁니다. 확실하진 않지만요.",
  );

  expect(plans.length).toBeGreaterThan(0);
  expect(plans[0]?.mode).toBe("replace");
  expect(plans[0]?.replacement).toBeTruthy();
  expect(plans[0]?.matchedPhrase).toMatch(/아마/);
});

test("resolveRupinSelfFallbackPlans redacts unfounded generalization", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "사람들은 대부분 가을을 좋아합니다. 서울도 그렇습니다.",
  );

  expect(plans.length).toBeGreaterThan(0);
  expect(plans[0]?.matchedPhrase).toMatch(/사람들은/);
});

test("resolveRupinSelfFallbackPlans redacts implied authority", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "전문가들도 다 인정합니다. 이 방법이 효과적입니다.",
  );

  expect(plans.length).toBeGreaterThan(0);
  expect(plans[0]?.matchedPhrase).toMatch(/전문가/);
});

test("resolveRupinSelfFallbackPlans redacts inaccuracy admissions", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "서울은 수도입니다. 아, 방금 말은 부정확했습니다.",
  );

  expect(plans.length).toBeGreaterThan(0);
  expect(plans[0]?.mode).toBe("redact");
  expect(plans[0]?.matchedPhrase).toMatch(/부정확/);
});

test("resolveRupinSelfFallbackPlans redacts English inaccuracy admissions", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "Seoul is the capital. Actually, that was inaccurate.",
  );

  expect(plans.some((plan) => plan.mode === "redact" && /inaccurate/i.test(plan.matchedPhrase))).toBe(true);
});

test("resolveRupinSelfFallbackPlans replaces superlative claims when possible", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "서울은 한국의 수도입니다. 이건 가장 좋은 여행지입니다.",
  );

  expect(plans.some((plan) => plan.mode === "replace")).toBe(true);
});

test("resolveRupinSelfFallbackPlans redacts unsourced statistics", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "서울 인구는 약 950만 명입니다. 관광객 70%가 만족합니다.",
  );

  expect(plans.some((plan) => /70%/.test(plan.matchedPhrase))).toBe(true);
});

test("resolveRupinSelfFallbackPlans redacts context drift from user premise", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "실제로는 B가 맞습니다. A는 아닙니다.",
    { userMessage: "나는 A였다고 생각해." },
  );

  expect(plans.length).toBeGreaterThan(0);
  expect(plans[0]?.matchedPhrase).toMatch(/실제로는/);
});

test("scoreSentence ranks problematic sentences higher", () => {
  const weak = scoreSentence("Seoul is the capital of Korea.");
  const strong = scoreSentence(
    "Experts agree this is definitely the best method.",
  );

  expect(strong).toBeGreaterThan(weak);
});

test("resolveRupinSelfFallbackPlans uses sentence scoring on multi-sentence answers", () => {
  const middle =
    "Timing maybe matters and seasons perhaps matter for visitors.";
  expect(scoreSentence(middle)).toBeGreaterThanOrEqual(2);

  const plans = resolveRupinSelfFallbackPlans(
    `Seoul is the capital. ${middle} Parks are nice.`,
  );

  expect(
    plans.some((plan) => plan.annotationId.startsWith("fallback-sentence-score")),
  ).toBe(true);
});

test("resolveRupinSelfFallbackPlans hides off-topic tail sentences", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "서울은 사계절이 뚜렷합니다. 봄에는 벚꽃이 아름답습니다. 파리 패션 위크도 참고할 만한 축제입니다.",
    { userMessage: "서울 날씨 알려줘" },
  );

  expect(plans.some((plan) => plan.mode === "ignore-span")).toBe(true);
  expect(plans.some((plan) => /파리/.test(plan.matchedPhrase))).toBe(true);
});

test("resolveRupinSelfFallbackPlans keeps on-topic concluding sentences", () => {
  const plans = resolveRupinSelfFallbackPlans(
    "서울은 사계절이 뚜렷합니다. 봄에는 벚꽃이 아름답습니다. 가을에는 선선한 편입니다.",
    { userMessage: "서울 날씨 알려줘" },
  );

  expect(
    plans.filter((plan) => plan.annotationId.startsWith("fallback-off-topic")),
  ).toHaveLength(0);
});

test("splitSentences splits on punctuation", () => {
  expect(splitSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
});

test("resolveRupinSelfFallbackPlans returns empty when nothing matches", () => {
  expect(resolveRupinSelfFallbackPlans("Seoul is the capital.")).toEqual([]);
});

test("resolveRupinPushbackFallbackPlan hides full answer on strong rejection", () => {
  const prior = "Seoul is the capital. Autumn is the best season.";
  const plan = resolveRupinPushbackFallbackPlan(prior, "That's wrong");

  expect(plan?.mode).toBe("ignore-full");
});

test("resolveRupinPushbackFallbackPlan redacts first sentence on doubt", () => {
  const prior = "Seoul is the capital. Autumn is the best season.";
  const plan = resolveRupinPushbackFallbackPlan(prior, "Are you sure?");

  expect(plan?.mode).toBe("redact");
  expect(plan?.matchedPhrase).toMatch(/^Seoul is the capital/);
});

test("resolveRupinPushbackFallbackPlan hides last sentence on disinterest", () => {
  const prior = "Seoul is the capital. Autumn is the best season.";
  const plan = resolveRupinPushbackFallbackPlan(prior, "I don't care about seasons");

  expect(plan?.mode).toBe("ignore-span");
  expect(plan?.matchedPhrase).toMatch(/Autumn is the best season/);
});

test("resolveRupinPushbackFallbackPlan redacts problematic prior content", () => {
  const prior = "전문가들도 다 인정합니다. 서울은 수도입니다.";
  const plan = resolveRupinPushbackFallbackPlan(prior, "continue");

  expect(plan?.mode).toBe("redact");
  expect(plan?.matchedPhrase).toMatch(/전문가/);
});
