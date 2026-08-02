import { test, expect } from "bun:test";

import {
  computeAngerJitterStrength,
  lerpAnimationValue,
  lerpWaveAnimationState,
  resolveLegacyWaveAmplitude,
  resolveWaveAmplitude,
  sampleCompositeWave,
  WAVE_FLOW_SPEED,
  WAVE_PARAM_LERP_EASING,
} from "../components/EmotionWave.tsx";

const baseContext = {
  amplitude: 40,
  speed: 1.2,
  frequency: 1.1,
  irregularity: 0.2,
  jitter: 0.05,
  mood: "groggy" as const,
  intensity: 50,
};

const lowAnimation = {
  amplitude: 6.5,
  speed: 0.1,
  frequency: 0.35,
  irregularity: 0.02,
  jitter: 0.01,
  intensity: 10,
};

const highAnimation = {
  amplitude: 100,
  speed: 2.5,
  frequency: 3,
  irregularity: 0.5,
  jitter: 0.4,
  intensity: 90,
};

test("resolveWaveAmplitude grows with intensity and caps at about 2x legacy max", () => {
  const low = resolveWaveAmplitude(10, 800, 1);
  const high = resolveWaveAmplitude(100, 800, 1);
  const legacyHigh = resolveLegacyWaveAmplitude(100, 800, 1);
  const tall = resolveWaveAmplitude(100, 1000, 1);

  expect(high).toBeGreaterThan(low);
  expect(tall).toBeGreaterThan(high);
  expect(high).toBeCloseTo(800 * 0.68, 0);
  expect(high).toBeCloseTo(legacyHigh * 2, 0);
  expect(resolveWaveAmplitude(50, 800, 1)).toBeLessThan(legacyHigh);
});

test("wave drifts horizontally over time at a fixed x", () => {
  const first = sampleCompositeWave(400, 800, 300, 0, baseContext);
  const later = sampleCompositeWave(400, 800, 300, 1.5, baseContext);

  expect(first).not.toBeCloseTo(later, 1);
});

test("anger jitter strength follows intensity bands", () => {
  expect(computeAngerJitterStrength("happy", 100)).toBe(0);
  expect(computeAngerJitterStrength("angry", 0)).toBe(0);
  expect(computeAngerJitterStrength("angry", 15)).toBeLessThan(0.04);
  expect(computeAngerJitterStrength("angry", 50)).toBeGreaterThan(0.1);
  expect(computeAngerJitterStrength("angry", 50)).toBeLessThan(0.5);
  expect(computeAngerJitterStrength("angry", 90)).toBeGreaterThan(0.7);
});

test("higher frequency increases local slope changes", () => {
  const xs = Array.from({ length: 40 }, (_, index) => index * 20);
  const lowFreq = xs.map((x) =>
    sampleCompositeWave(x, 800, 300, 1.2, { ...baseContext, frequency: 0.5 }),
  );
  const highFreq = xs.map((x) =>
    sampleCompositeWave(x, 800, 300, 1.2, { ...baseContext, frequency: 2.5 }),
  );

  const lowDelta = Math.max(
    ...lowFreq.slice(1).map((value, index) => Math.abs(value - lowFreq[index]!)),
  );
  const highDelta = Math.max(
    ...highFreq.slice(1).map((value, index) => Math.abs(value - highFreq[index]!)),
  );

  expect(highDelta).toBeGreaterThan(lowDelta);
});

test("pure sine wave stays within amplitude band", () => {
  const xs = Array.from({ length: 120 }, (_, index) => index * 7);
  const samples = xs.map((x) =>
    sampleCompositeWave(x, 840, 300, 2.4, { ...baseContext, amplitude: 40 }),
  );

  expect(Math.max(...samples)).toBeCloseTo(340, 0);
  expect(Math.min(...samples)).toBeCloseTo(260, 0);
});

test("pure sine matches canonical sin sample at a point", () => {
  const width = 800;
  const centerY = 300;
  const timeSeconds = 1.2;
  const context = { ...baseContext, amplitude: 40, speed: 1, frequency: 1 };
  const x = 400;
  const phase = timeSeconds * context.speed * Math.PI * 2;
  const baseK = (Math.PI * 2 * context.frequency) / width;
  const flowOffset = timeSeconds * context.speed * WAVE_FLOW_SPEED;
  const expected = centerY + 40 * Math.sin((x - flowOffset) * baseK + phase);

  expect(sampleCompositeWave(x, width, centerY, timeSeconds, context)).toBeCloseTo(
    expected,
    5,
  );
});

test("lerpAnimationValue moves partially toward target", () => {
  const next = lerpAnimationValue(10, 100, 0.1);
  expect(next).toBe(19);
});

test("wave animation state lerps instead of jumping", () => {
  const firstStep = lerpWaveAnimationState(
    lowAnimation,
    highAnimation,
    1 / 60,
    WAVE_PARAM_LERP_EASING,
  );

  expect(firstStep.amplitude).toBeGreaterThan(lowAnimation.amplitude);
  expect(firstStep.amplitude).toBeLessThan(highAnimation.amplitude);

  let current = lowAnimation;
  for (let i = 0; i < 180; i += 1) {
    current = lerpWaveAnimationState(current, highAnimation, 1 / 60);
  }

  expect(current.amplitude).toBeCloseTo(highAnimation.amplitude, 0);
});
