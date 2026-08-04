import { test, expect } from "bun:test";

import { getEmotionVisualConfig } from "../config/emotionVisualConfig.ts";
import {
  computeEmotionAnimationParams,
  computeHappyWaveRandomness,
  EMOTION_ANIMATION_BOUNDS,
} from "./useEmotionAnimation.ts";

test("animation params change continuously across intensity", () => {
  const config = getEmotionVisualConfig({ mood: "happy", intensity: 0 });

  const atZero = computeEmotionAnimationParams({ mood: "happy", intensity: 0 }, config);
  const atHalf = computeEmotionAnimationParams({ mood: "happy", intensity: 50 }, config);
  const atFull = computeEmotionAnimationParams({ mood: "happy", intensity: 100 }, config);

  expect(atZero.amplitude).toBeGreaterThanOrEqual(EMOTION_ANIMATION_BOUNDS.amplitude.atZeroMinPx);
  expect(atZero.amplitude).toBeLessThanOrEqual(EMOTION_ANIMATION_BOUNDS.amplitude.atZeroMaxPx);
  expect(atFull.amplitude).toBeCloseTo(
    EMOTION_ANIMATION_BOUNDS.amplitude.atFullPx * config.wave.amplitudeMultiplier,
    5,
  );

  expect(atHalf.amplitude).toBeGreaterThan(atZero.amplitude);
  expect(atHalf.amplitude).toBeLessThan(atFull.amplitude);
  expect(atHalf.speed).toBeGreaterThan(atZero.speed);
  expect(atHalf.speed).toBeLessThan(atFull.speed);
});

test("mood multipliers affect output at the same intensity", () => {
  const intensity = 60;
  const happy = computeEmotionAnimationParams(
    { mood: "happy", intensity },
    getEmotionVisualConfig({ mood: "happy", intensity }),
  );
  const angry = computeEmotionAnimationParams(
    { mood: "angry", intensity },
    getEmotionVisualConfig({ mood: "angry", intensity }),
  );

  expect(angry.speed).toBeGreaterThan(happy.speed);
  expect(angry.frequency).toBeGreaterThan(happy.frequency);
});

test("groggy speed grows less with intensity than happy or angry", () => {
  const intensity = 100;
  const groggy = computeEmotionAnimationParams(
    { mood: "groggy", intensity },
    getEmotionVisualConfig({ mood: "groggy", intensity }),
  );
  const happy = computeEmotionAnimationParams(
    { mood: "happy", intensity },
    getEmotionVisualConfig({ mood: "happy", intensity }),
  );
  const angry = computeEmotionAnimationParams(
    { mood: "angry", intensity },
    getEmotionVisualConfig({ mood: "angry", intensity }),
  );

  expect(groggy.speed).toBeLessThan(happy.speed);
  expect(groggy.speed).toBeLessThan(angry.speed);
  expect(groggy.amplitude).toBeGreaterThan(50);
});

test("happy wave randomness ramps with intensity", () => {
  const low = computeHappyWaveRandomness(0);
  const high = computeHappyWaveRandomness(100);
  const happyLow = computeEmotionAnimationParams(
    { mood: "happy", intensity: 0 },
    getEmotionVisualConfig({ mood: "happy", intensity: 0 }),
  );
  const happyHigh = computeEmotionAnimationParams(
    { mood: "happy", intensity: 100 },
    getEmotionVisualConfig({ mood: "happy", intensity: 100 }),
  );

  expect(low.irregularity).toBeCloseTo(0.02, 5);
  expect(low.jitter).toBe(0);
  expect(high.irregularity).toBeCloseTo(0.82, 5);
  expect(high.jitter).toBeCloseTo(0.52, 5);
  expect(happyHigh.irregularity).toBeGreaterThan(happyLow.irregularity * 4);
  expect(happyHigh.jitter).toBeGreaterThan(happyLow.jitter);
});
