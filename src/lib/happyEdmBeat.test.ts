import { test, expect } from "bun:test";

import {
  computeHappyEdmAmplitudeFactor,
  computeHappyEdmBeatPhase,
  computeHappyEdmBpm,
  computeHappyEdmKickPulse,
  computeHappyEdmScrollFactor,
  computeHappyEdmSidechainEnvelope,
  integrateHappyEdmScrollDistance,
} from "./happyEdmBeat.ts";

test("happy EDM BPM ramps with intensity", () => {
  expect(computeHappyEdmBpm(0)).toBe(108);
  expect(computeHappyEdmBpm(100)).toBe(152);
  expect(computeHappyEdmBpm(50)).toBeGreaterThan(108);
  expect(computeHappyEdmBpm(50)).toBeLessThan(152);
});

test("kick pulse peaks at beat phase zero", () => {
  expect(computeHappyEdmKickPulse(0)).toBeCloseTo(1, 3);
  expect(computeHappyEdmKickPulse(0.5)).toBeLessThan(0.02);
});

test("sidechain ducks on kick and swells before next beat", () => {
  const low = computeHappyEdmSidechainEnvelope(0, 100);
  const mid = computeHappyEdmSidechainEnvelope(0.55, 100);
  const end = computeHappyEdmSidechainEnvelope(0.95, 100);

  expect(low).toBeLessThan(0.75);
  expect(mid).toBeGreaterThan(low);
  expect(end).toBeGreaterThan(mid);
});

test("scroll factor pulses with beat at high intensity", () => {
  const bpm = computeHappyEdmBpm(100);
  const beatDuration = 60 / bpm;
  const onKick = computeHappyEdmScrollFactor(0, 100);
  const offBeat = computeHappyEdmScrollFactor(beatDuration * 0.5, 100);

  expect(onKick).toBeGreaterThan(1.2);
  expect(offBeat).toBeGreaterThan(1);
  expect(onKick).not.toBeCloseTo(offBeat, 1);
});

test("beat phase wraps every quarter note", () => {
  const bpm = computeHappyEdmBpm(80);
  const beatDuration = 60 / bpm;

  expect(computeHappyEdmBeatPhase(0, 80)).toBeCloseTo(0, 5);
  expect(computeHappyEdmBeatPhase(beatDuration, 80)).toBeCloseTo(0, 3);
  expect(computeHappyEdmBeatPhase(beatDuration * 0.5, 80)).toBeCloseTo(0.5, 2);
});

test("integrated EDM scroll is faster than linear at high intensity", () => {
  const elapsed = 6;
  const speed = 18;
  const linear = elapsed * speed;
  const edm = integrateHappyEdmScrollDistance(elapsed, speed, 100);

  expect(edm).toBeGreaterThan(linear * 1.04);
});

test("amplitude factor stays near 1 at low intensity", () => {
  expect(computeHappyEdmAmplitudeFactor(0.4, 0)).toBe(1);
  expect(computeHappyEdmAmplitudeFactor(0.4, 8)).toBeCloseTo(1, 1);
});

test("amplitude factor breathes at high intensity", () => {
  const bpm = computeHappyEdmBpm(100);
  const beatDuration = 60 / bpm;
  const onKick = computeHappyEdmAmplitudeFactor(0, 100);
  const midBeat = computeHappyEdmAmplitudeFactor(beatDuration * 0.45, 100);

  expect(onKick).toBeLessThan(0.85);
  expect(midBeat).toBeGreaterThan(onKick);
});
