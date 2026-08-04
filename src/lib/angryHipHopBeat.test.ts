import { test, expect } from "bun:test";

import {
  computeAngryHipHopAmplitudeFactor,
  computeAngryHipHopBeatPhase,
  computeAngryHipHopBpm,
  computeAngryHipHopCoasterTarget,
  computeAngryHipHopKickPulse,
  computeAngryHipHopScrollFactor,
  computeAngryHipHopScrollVelocityAt,
  integrateAngryHipHopScrollDistance,
  integrateAngryHipHopScrollMotion,
} from "./angryHipHopBeat.ts";

test("angry hip-hop BPM ramps with intensity", () => {
  expect(computeAngryHipHopBpm(0)).toBe(88);
  expect(computeAngryHipHopBpm(100)).toBe(172);
  expect(computeAngryHipHopBpm(50)).toBeGreaterThan(88);
  expect(computeAngryHipHopBpm(50)).toBeLessThan(172);
});

test("kick pulse peaks at beat phase zero", () => {
  expect(computeAngryHipHopKickPulse(0)).toBeCloseTo(1, 3);
  expect(computeAngryHipHopKickPulse(0.5)).toBeLessThan(0.05);
});

test("coaster target crawls at crest then plunges", () => {
  const crest = computeAngryHipHopCoasterTarget(0.05, 100);
  const midDrop = computeAngryHipHopCoasterTarget(0.38, 100);
  const lateDrop = computeAngryHipHopCoasterTarget(0.62, 100);
  const runout = computeAngryHipHopCoasterTarget(0.75, 100);

  expect(crest).toBeLessThan(0.78);
  expect(midDrop).toBeGreaterThan(crest + 0.8);
  expect(lateDrop).toBeGreaterThan(midDrop + 1.5);
  expect(runout).toBeGreaterThan(5);
});

test("scroll target dips at crest and peaks on the drop", () => {
  const samples = Array.from({ length: 80 }, (_, index) =>
    computeAngryHipHopScrollFactor(index * 0.08 + 0.02, 100),
  );

  expect(Math.min(...samples)).toBeLessThan(0.8);
  expect(Math.max(...samples)).toBeGreaterThan(6.5);
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(5.5);
});

test("velocity integration accelerates sharply on the drop", () => {
  const early = integrateAngryHipHopScrollMotion(0.28, 18, 100);
  const later = integrateAngryHipHopScrollMotion(0.48, 18, 100);
  const earlySlope = early.distance / 0.28;
  const laterSlope = (later.distance - early.distance) / 0.2;

  expect(laterSlope).toBeGreaterThan(earlySlope * 1.3);
  expect(later.velocity).toBeGreaterThan(early.velocity * 1.5);
});

test("beat phase wraps every quarter note", () => {
  const bpm = computeAngryHipHopBpm(90);
  const beatDuration = 60 / bpm;

  expect(computeAngryHipHopBeatPhase(0, 90)).toBeCloseTo(0, 5);
  expect(computeAngryHipHopBeatPhase(beatDuration, 90)).toBeCloseTo(0, 3);
});

test("integrated coaster scroll outruns linear at high intensity", () => {
  const elapsed = 7;
  const speed = 18;
  const linear = elapsed * speed;
  const coaster = integrateAngryHipHopScrollDistance(elapsed, speed, 100);

  expect(coaster).toBeGreaterThan(linear * 1.2);
});

test("scroll velocity stays readable without strobe-level dips", () => {
  const samples = Array.from({ length: 60 }, (_, index) =>
    computeAngryHipHopScrollVelocityAt(index * 0.12 + 0.02, 100),
  );

  expect(Math.min(...samples)).toBeGreaterThan(0.48);
  expect(Math.max(...samples)).toBeGreaterThan(6);
});

test("amplitude factor stays flat for readable angry text", () => {
  expect(computeAngryHipHopAmplitudeFactor(0, 100)).toBe(1);
  expect(computeAngryHipHopAmplitudeFactor(2.4, 100)).toBe(1);
});
