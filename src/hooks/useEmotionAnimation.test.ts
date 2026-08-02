import { test, expect } from "bun:test";

import { getEmotionVisualConfig } from "../config/emotionVisualConfig.ts";
import {
  computeEmotionAnimationParams,
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
