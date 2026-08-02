import { test, expect } from "bun:test";

import {
  arcLengthAtX,
  buildWavePathSamples,
  computeAnswerTextScrollMultiplier,
  computeGroggyLetterSpacing,
  computeIntensityScrollFactor,
  computeWaveTextScrollOffset,
  plainTextFromAnswer,
  pointAtDistance,
  samplePointOnWave,
  toSingleLine,
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

test("computeAnswerTextScrollMultiplier keeps groggy flat and spikes happy/angry at high intensity", () => {
  expect(computeAnswerTextScrollMultiplier("groggy", 80, 1.95)).toBe(1.95);
  expect(computeAnswerTextScrollMultiplier("happy", 0, 6)).toBe(6);
  expect(computeAnswerTextScrollMultiplier("happy", 40, 6)).toBeLessThan(
    computeAnswerTextScrollMultiplier("happy", 100, 6) * 0.2,
  );
  expect(computeAnswerTextScrollMultiplier("happy", 100, 6)).toBe(84);
  expect(computeAnswerTextScrollMultiplier("angry", 100, 2)).toBe(28);
});

test("computeIntensityScrollFactor curves upward near max intensity", () => {
  const low = computeIntensityScrollFactor(20);
  const mid = computeIntensityScrollFactor(60);
  const high = computeIntensityScrollFactor(100);

  expect(low).toBeCloseTo(1.03, 1);
  expect(mid).toBeLessThan(4);
  expect(high).toBe(14);
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
