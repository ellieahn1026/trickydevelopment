import { test, expect } from "bun:test";

import {
  arcLengthAtX,
  buildWavePathSamples,
  computeAnswerTextFontScale,
  computeAnswerTextFontSize,
  computeAnswerTextScrollMultiplier,
  computeGroggyLetterSpacing,
  computeInstantScrollSpeedFactor,
  computeScrollSpeedVariance,
  computeVariableScrollDistance,
  computeIntensityScrollFactor,
  computeWaveTextScrollOffset,
  plainTextFromAnswer,
  pointAtDistance,
  samplePointOnWave,
  toSingleLine,
  WAVE_ANSWER_FONT_SIZE,
  WAVE_TEXT_SCROLL_SPEED,
} from "./wavePathText.ts";

test("plainTextFromAnswer strips markdown noise", () => {
  expect(plainTextFromAnswer("**Hello** _world_")).toBe("Hello world");
  expect(plainTextFromAnswer("# Title\n\nParagraph")).toBe("Title Paragraph");
});

test("toSingleLine collapses markdown blocks into one line", () => {
  const input = `# Heading

First paragraph.

- one
- two
- three`;

  expect(toSingleLine(input)).toBe("Heading First paragraph. one two three");
  expect(toSingleLine(input)).not.toMatch(/[\r\n]/);
});

test("computeWaveTextScrollOffset increases linearly without looping", () => {
  const early = computeWaveTextScrollOffset(2);
  const later = computeWaveTextScrollOffset(20);

  expect(early).toBe(2 * WAVE_TEXT_SCROLL_SPEED);
  expect(later).toBe(20 * WAVE_TEXT_SCROLL_SPEED);
  expect(later).toBeGreaterThan(early);
});

test("computeWaveTextScrollOffset loops when cycle length is provided", () => {
  const cycleLength = 500;
  const firstPass = computeWaveTextScrollOffset(10, WAVE_TEXT_SCROLL_SPEED, cycleLength);
  const secondPass = computeWaveTextScrollOffset(10 + cycleLength / WAVE_TEXT_SCROLL_SPEED, WAVE_TEXT_SCROLL_SPEED, cycleLength);

  expect(firstPass).toBe(10 * WAVE_TEXT_SCROLL_SPEED);
  expect(secondPass).toBe(firstPass);
});

test("scroll speed variance ramps with intensity and mood", () => {
  expect(computeScrollSpeedVariance(0, "happy")).toBe(0);
  expect(computeScrollSpeedVariance(100, "happy")).toBeCloseTo(0.88, 5);
  expect(computeScrollSpeedVariance(100, "groggy")).toBeCloseTo(0.22, 5);
  expect(computeScrollSpeedVariance(100, "angry")).toBeCloseTo(0.92, 5);
});

test("happy scroll uses EDM beat drive instead of smooth wobble", () => {
  const elapsed = 8;
  const speed = 18;
  const variance = 0.88;
  const linear = computeVariableScrollDistance(elapsed, speed, 0);
  const edm = computeVariableScrollDistance(elapsed, speed, variance, {
    mood: "happy",
    intensity: 100,
  });
  const wobbly = computeVariableScrollDistance(elapsed, speed, variance, {
    mood: "groggy",
    intensity: 100,
  });
  expect(edm).toBeGreaterThan(linear * 1.02);

  const bpm = 152;
  const beatDuration = 60 / bpm;
  expect(
    computeInstantScrollSpeedFactor(0, variance, { mood: "happy", intensity: 100 }),
  ).toBeGreaterThan(
    computeInstantScrollSpeedFactor(beatDuration * 0.5, variance, {
      mood: "happy",
      intensity: 100,
    }) * 0.9,
  );
});

test("angry scroll uses roller-coaster acceleration bursts", () => {
  const elapsed = 8;
  const speed = 18;
  const variance = 0.92;
  const linear = computeVariableScrollDistance(elapsed, speed, 0);
  const coaster = computeVariableScrollDistance(elapsed, speed, variance, {
    mood: "angry",
    intensity: 100,
  });

  expect(coaster).toBeGreaterThan(linear * 1.05);
  expect(coaster).not.toBeCloseTo(linear, 0);

  const factors = Array.from({ length: 30 }, (_, index) =>
    computeInstantScrollSpeedFactor(index * 0.21 + 0.04, variance, {
      mood: "angry",
      intensity: 100,
    }),
  );

  expect(Math.min(...factors)).toBeGreaterThan(0.45);
  expect(Math.max(...factors)).toBeGreaterThan(1.8);
  expect(Math.max(...factors)).toBeGreaterThan(Math.min(...factors) + 1.2);
});

test("variable scroll distance surges and slows instead of staying linear", () => {
  const elapsed = 8;
  const speed = 18;
  const variance = 0.92;
  const linear = computeVariableScrollDistance(elapsed, speed, 0);
  const wobbly = computeVariableScrollDistance(elapsed, speed, variance, {
    mood: "angry",
    intensity: 100,
  });

  expect(linear).toBeCloseTo(elapsed * speed, 5);
  expect(wobbly).not.toBeCloseTo(linear, 0);

  const slopeA =
    computeVariableScrollDistance(4.2, speed, variance, {
      mood: "angry",
      intensity: 100,
    }) -
    computeVariableScrollDistance(4, speed, variance, {
      mood: "angry",
      intensity: 100,
    });
  const slopeB =
    computeVariableScrollDistance(7.2, speed, variance, {
      mood: "angry",
      intensity: 100,
    }) -
    computeVariableScrollDistance(7, speed, variance, {
      mood: "angry",
      intensity: 100,
    });

  const windowSeconds = 0.2;
  expect(Math.abs(slopeA - slopeB)).toBeGreaterThan(0.15);
  expect(slopeA).toBeGreaterThan(speed * windowSeconds);
  expect(slopeB).toBeGreaterThan(speed * windowSeconds);
  expect(
    computeInstantScrollSpeedFactor(4.1, variance, {
      mood: "angry",
      intensity: 100,
    }),
  ).not.toBeCloseTo(
    computeInstantScrollSpeedFactor(7.1, variance, {
      mood: "angry",
      intensity: 100,
    }),
    1,
  );
});

test("higher scroll variance produces stronger speed swings", () => {
  const lowVarianceSlope =
    computeVariableScrollDistance(6.2, 18, 0.15, {
      mood: "angry",
      intensity: 100,
    }) -
    computeVariableScrollDistance(6, 18, 0.15, {
      mood: "angry",
      intensity: 100,
    });
  const highVarianceSlope =
    computeVariableScrollDistance(6.2, 18, 0.92, {
      mood: "angry",
      intensity: 100,
    }) -
    computeVariableScrollDistance(6, 18, 0.92, {
      mood: "angry",
      intensity: 100,
    });

  expect(Math.abs(highVarianceSlope)).toBeGreaterThan(Math.abs(lowVarianceSlope));
});

test("computeAnswerTextScrollMultiplier slows groggy and spikes happy/angry at high intensity", () => {
  const groggyLow = computeAnswerTextScrollMultiplier("groggy", 0, 1.95);
  const groggyHigh = computeAnswerTextScrollMultiplier("groggy", 100, 1.95);
  expect(groggyLow).toBeCloseTo(1.95, 5);
  expect(groggyHigh).toBeCloseTo(1.95 * 0.16, 5);
  expect(groggyHigh).toBeLessThan(groggyLow * 0.2);
  expect(computeAnswerTextScrollMultiplier("happy", 0, 6)).toBe(6);
  expect(computeAnswerTextScrollMultiplier("happy", 40, 6)).toBeLessThan(
    computeAnswerTextScrollMultiplier("happy", 100, 6) * 0.2,
  );
  expect(computeAnswerTextScrollMultiplier("happy", 100, 6)).toBeCloseTo(40.32, 5);
  expect(computeAnswerTextScrollMultiplier("angry", 100, 2)).toBeCloseTo(10.4832, 5);
});

test("angry nominal scroll speed is capped below happy max", () => {
  const defaultMax = computeAnswerTextScrollMultiplier("happy", 100, 2);
  const angryMax = computeAnswerTextScrollMultiplier("angry", 100, 2);

  expect(angryMax).toBeCloseTo(defaultMax * 0.78, 5);
  expect(angryMax).toBeLessThan(defaultMax);
  expect(computeAnswerTextScrollMultiplier("angry", 0, 2)).toBe(2);
});

test("computeAnswerTextFontScale grows with scroll speed up to 2× for happy/angry", () => {
  expect(computeAnswerTextFontScale(1.95, 1.95, "groggy")).toBe(1);
  expect(computeAnswerTextFontScale(6, 6, "happy")).toBe(1);
  expect(computeAnswerTextFontScale(40.32, 6, "happy")).toBe(2);
  expect(computeAnswerTextFontScale(2, 2, "angry")).toBe(1);
  expect(computeAnswerTextFontScale(10.4832, 2, "angry")).toBe(2);
  expect(
    computeAnswerTextFontScale(23.16, 6, "happy"),
  ).toBeGreaterThan(1);
  expect(
    computeAnswerTextFontScale(23.16, 6, "happy"),
  ).toBeLessThan(2);
});

test("computeAnswerTextFontSize scales from base size to double at max speed", () => {
  expect(computeAnswerTextFontSize(6, 6, "happy")).toBe(WAVE_ANSWER_FONT_SIZE);
  expect(computeAnswerTextFontSize(40.32, 6, "happy")).toBe(
    WAVE_ANSWER_FONT_SIZE * 2,
  );
  expect(computeAnswerTextFontSize(10.4832, 2, "angry")).toBe(
    WAVE_ANSWER_FONT_SIZE * 2,
  );
});

test("computeIntensityScrollFactor curves upward near max intensity", () => {
  const low = computeIntensityScrollFactor(20);
  const mid = computeIntensityScrollFactor(60);
  const high = computeIntensityScrollFactor(100);

  expect(low).toBeCloseTo(1.03, 1);
  expect(mid).toBeLessThan(4);
  expect(high).toBe(6.72);
  expect(high - mid).toBeGreaterThan(mid - low);
});

test("computeGroggyLetterSpacing widens with intensity", () => {
  expect(computeGroggyLetterSpacing(0)).toBe(0);
  expect(computeGroggyLetterSpacing(50)).toBe(5);
  expect(computeGroggyLetterSpacing(100)).toBe(10);
});

test("samplePointOnWave returns tangent angle from sampleY", () => {
  const point = samplePointOnWave(50, 100, (x) => 40 + Math.sin(x * 0.2) * 8);
  expect(point.x).toBe(50);
  expect(point.y).toBeCloseTo(40 + Math.sin(50 * 0.2) * 8, 3);
});

test("buildWavePathSamples accumulates arc length", () => {
  const points = buildWavePathSamples(100, (x) => 50 + Math.sin(x * 0.1) * 10, 10);
  expect(points.length).toBeGreaterThan(1);
  expect(points[points.length - 1]!.arcLength).toBeGreaterThan(90);
});

test("pointAtDistance interpolates between samples", () => {
  const points = buildWavePathSamples(40, (x) => x, 10);
  const mid = pointAtDistance(points, 20);
  expect(mid.x).toBeGreaterThan(9);
  expect(mid.x).toBeLessThan(31);
});

test("arcLengthAtX maps horizontal position to path distance", () => {
  const points = buildWavePathSamples(100, () => 50, 10);
  expect(arcLengthAtX(points, 0)).toBeCloseTo(0, 0);
  expect(arcLengthAtX(points, 100)).toBeCloseTo(100, 0);
});
