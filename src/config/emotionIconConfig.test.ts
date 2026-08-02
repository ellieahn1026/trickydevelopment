import { test, expect } from "bun:test";

import {
  pickAngryBounceIcon,
  pickGroggyFallIcon,
  pickHappyPopIcon,
  resolveAngryBounceIconBudget,
  resolveEmotionIconSizePx,
  resolveGroggyFallIconBudget,
  resolveHappyPopIconBudget,
  shouldShowAngryBounceIcons,
  shouldShowEmotionPopIcons,
  shouldShowGroggyFallIcons,
} from "./emotionIconConfig.ts";

test("resolveHappyPopIconBudget scales with intensity", () => {
  const low = resolveHappyPopIconBudget(5);
  const high = resolveHappyPopIconBudget(95);

  expect(low.maxActive).toBeLessThan(high.maxActive);
  expect(high.spawnIntervalMs).toBeLessThan(low.spawnIntervalMs);
  expect(high.riseDurationMs).toBeLessThan(low.riseDurationMs);
});

test("resolveGroggyFallIconBudget scales with intensity", () => {
  const low = resolveGroggyFallIconBudget(5);
  const high = resolveGroggyFallIconBudget(95);
  const happyHigh = resolveHappyPopIconBudget(95);

  expect(low.maxActive).toBeLessThan(high.maxActive);
  expect(high.spawnIntervalMs).toBeLessThan(low.spawnIntervalMs);
  expect(high.fallDurationMs).toBeLessThan(low.fallDurationMs);
  expect(low.fallDurationMs).toBeGreaterThan(happyHigh.riseDurationMs);
});

test("resolveGroggyFallIconBudget reaches extreme counts at high intensity", () => {
  const peak = resolveGroggyFallIconBudget(100);

  expect(peak.maxActive).toBeGreaterThanOrEqual(360);
  expect(peak.spawnIntervalMs).toBeLessThanOrEqual(25);
});

test("pickHappyPopIcon alternates happy assets", () => {
  expect(pickHappyPopIcon(0)).toContain("ic_happy1");
  expect(pickHappyPopIcon(1)).toContain("ic_happy2");
  expect(pickHappyPopIcon(2)).toContain("ic_happy1");
});

test("resolveAngryBounceIconBudget scales with intensity", () => {
  const low = resolveAngryBounceIconBudget(5);
  const high = resolveAngryBounceIconBudget(95);

  expect(low.maxActive).toBeLessThan(high.maxActive);
  expect(low.spawnBatchSize).toBeLessThan(high.spawnBatchSize);
  expect(high.spawnBatchSize).toBeGreaterThanOrEqual(8);
  expect(high.spawnIntervalMs).toBeLessThan(low.spawnIntervalMs);
  expect(high.bounceDurationMs).toBeLessThan(low.bounceDurationMs);
});

test("pickAngryBounceIcon uses angry asset", () => {
  expect(pickAngryBounceIcon()).toContain("ic_angry1");
});

test("pickGroggyFallIcon alternates groggy assets", () => {
  expect(pickGroggyFallIcon(0)).toContain("ic_groggy1");
  expect(pickGroggyFallIcon(1)).toContain("ic_groggy2");
  expect(pickGroggyFallIcon(2)).toContain("ic_groggy1");
});

test("resolveEmotionIconSizePx skews larger at high intensity", () => {
  const lowSizes = Array.from({ length: 200 }, () =>
    resolveEmotionIconSizePx(10),
  );
  const highSizes = Array.from({ length: 200 }, () =>
    resolveEmotionIconSizePx(95),
  );

  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  expect(average(highSizes)).toBeGreaterThan(average(lowSizes));

  for (const size of [...lowSizes, ...highSizes]) {
    expect(size).toBeGreaterThanOrEqual(44);
    expect(size).toBeLessThanOrEqual(160);
  }
});

test("shouldShowEmotionPopIcons is happy-only", () => {
  expect(shouldShowEmotionPopIcons("happy")).toBe(true);
  expect(shouldShowEmotionPopIcons("groggy")).toBe(false);
  expect(shouldShowEmotionPopIcons("angry")).toBe(false);
});

test("shouldShowGroggyFallIcons is groggy-only", () => {
  expect(shouldShowGroggyFallIcons("groggy")).toBe(true);
  expect(shouldShowGroggyFallIcons("happy")).toBe(false);
  expect(shouldShowGroggyFallIcons("angry")).toBe(false);
});

test("shouldShowAngryBounceIcons is angry-only", () => {
  expect(shouldShowAngryBounceIcons("angry")).toBe(true);
  expect(shouldShowAngryBounceIcons("happy")).toBe(false);
  expect(shouldShowAngryBounceIcons("groggy")).toBe(false);
});
