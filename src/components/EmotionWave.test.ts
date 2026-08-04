import { test, expect } from "bun:test";

import {
  computeAngerJitterStrength,
  computeWaveHeightEnvelope,
  lerpAnimationValue,
  lerpWaveAnimationState,
  resolveLegacyWaveAmplitude,
  resolveWaveFrequency,
  resolveTextWaveFrequency,
  resolveWaveAmplitude,
  sampleCompositeWave,
  sampleTextWaveY,
  TEXT_WAVE_WAVELENGTH_SCALE,
  WAVE_WAVELENGTH_SCALE,
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
    sampleCompositeWave(x, 840, 300, 2.4, {
      ...baseContext,
      amplitude: 40,
      irregularity: 0,
      jitter: 0,
    }),
  );

  expect(Math.max(...samples)).toBeLessThanOrEqual(340);
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(260);
});

test("wave height envelope grows with irregularity without shifting sine period", () => {
  const width = 800;
  const centerY = 300;
  const context = {
    ...baseContext,
    amplitude: 40,
    frequency: 1.1,
    irregularity: 0.82,
    jitter: 0,
  };
  const baseK = (Math.PI * 2 * resolveWaveFrequency(context.frequency)) / width;

  for (let n = -4; n <= 4; n += 1) {
    const x = (n * Math.PI) / baseK;
    if (x < 0 || x > width) continue;
    const modulated = sampleTextWaveY(x, width, centerY, 0, context);
    expect(modulated).toBeCloseTo(centerY, 4);
  }

  const peakX = Math.PI / (2 * baseK);
  const purePeak = centerY + context.amplitude;
  const modulatedPeak = sampleTextWaveY(peakX, width, centerY, 0, context);
  expect(modulatedPeak).not.toBeCloseTo(purePeak, 0);
  expect(Math.abs(modulatedPeak - centerY)).toBeGreaterThan(context.amplitude * 0.2);
  expect(Math.abs(modulatedPeak - centerY)).toBeLessThan(context.amplitude * 2.2);
});

test("wave sine wavelength is scaled wider for all moods", () => {
  expect(WAVE_WAVELENGTH_SCALE).toBe(4);
  expect(TEXT_WAVE_WAVELENGTH_SCALE).toBe(4);
  expect(resolveWaveFrequency(1.1)).toBeCloseTo(0.275, 5);
  expect(resolveTextWaveFrequency(1.1)).toBeCloseTo(0.275, 5);
});

test("computeWaveHeightEnvelope stays near 1 when irregularity is low", () => {
  expect(computeWaveHeightEnvelope(0.42, 0)).toBe(1);
  expect(computeWaveHeightEnvelope(0.42, 0.02)).toBeGreaterThan(0.96);
  expect(computeWaveHeightEnvelope(0.42, 0.02)).toBeLessThan(1.04);
});

test("happy text wave height varies more at high irregularity", () => {
  const width = 800;
  const centerY = 300;
  const frequency = 1.1;
  const amplitude = 40;
  const baseK = (Math.PI * 2 * resolveWaveFrequency(frequency)) / width;
  const peakX = Math.PI / (2 * baseK);
  const purePeak = centerY + amplitude;

  const lowPeak = sampleTextWaveY(peakX, width, centerY, 0, {
    ...baseContext,
    amplitude,
    frequency,
    irregularity: 0.02,
  });
  const highPeak = sampleTextWaveY(peakX, width, centerY, 0, {
    ...baseContext,
    amplitude,
    frequency,
    irregularity: 0.82,
  });

  expect(Math.abs(lowPeak - purePeak)).toBeLessThan(4);
  expect(highPeak).not.toBeCloseTo(lowPeak, 0);
});

test("pure sine matches canonical sin sample at a point", () => {
  const width = 800;
  const centerY = 300;
  const timeSeconds = 1.2;
  const context = {
    ...baseContext,
    amplitude: 40,
    speed: 1,
    frequency: 1,
    irregularity: 0,
    jitter: 0,
  };
  const x = 400;
  const phase = timeSeconds * context.speed * Math.PI * 2;
  const baseK = (Math.PI * 2 * resolveWaveFrequency(context.frequency)) / width;
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
