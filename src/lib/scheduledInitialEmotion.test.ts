import { test, expect } from "bun:test";

import {
  buildInitialBackendEmotionState,
  buildInitialUiEmotionState,
  resolveScheduledMood,
} from "./scheduledInitialEmotion.ts";

function atLocalTime(hours: number, minutes: number): Date {
  const date = new Date(2026, 7, 2, hours, minutes, 0, 0);
  return date;
}

test("resolveScheduledMood uses 00:00 groggy before 06:00", () => {
  expect(resolveScheduledMood(atLocalTime(3, 15))).toBe("groggy");
  expect(resolveScheduledMood(atLocalTime(5, 59))).toBe("groggy");
});

test("resolveScheduledMood follows the 20-minute schedule from 06:00", () => {
  expect(resolveScheduledMood(atLocalTime(6, 0))).toBe("groggy");
  expect(resolveScheduledMood(atLocalTime(6, 19))).toBe("groggy");
  expect(resolveScheduledMood(atLocalTime(6, 20))).toBe("angry");
  expect(resolveScheduledMood(atLocalTime(7, 0))).toBe("happy");
  expect(resolveScheduledMood(atLocalTime(12, 0))).toBe("happy");
  expect(resolveScheduledMood(atLocalTime(23, 40))).toBe("groggy");
});

test("buildInitialBackendEmotionState maps groggy to sad", () => {
  const state = buildInitialBackendEmotionState({ date: atLocalTime(6, 0) });

  expect(state.mood).toBe("sad");
  expect(state.intensity).toBe(35);
  expect(state.volatility).toBe(0.7);
});

test("buildInitialBackendEmotionState maps angry and happy moods", () => {
  expect(
    buildInitialBackendEmotionState({ date: atLocalTime(8, 0) }).mood,
  ).toBe("angry");
  expect(
    buildInitialBackendEmotionState({ date: atLocalTime(10, 0) }).mood,
  ).toBe("happy");
});

test("buildInitialUiEmotionState mirrors scheduled mood labels", () => {
  expect(
    buildInitialUiEmotionState({ date: atLocalTime(6, 0) }),
  ).toEqual({ mood: "groggy", intensity: 35 });
  expect(buildInitialUiEmotionState({ date: atLocalTime(8, 0) }).mood).toBe(
    "angry",
  );
});

test("initial emotion random jitter stays within bounds", () => {
  const state = buildInitialBackendEmotionState({
    date: atLocalTime(12, 0),
    random: () => 0,
  });

  expect(state.intensity).toBeGreaterThanOrEqual(0);
  expect(state.intensity).toBeLessThanOrEqual(100);
  expect(state.intensity).not.toBe(55);
});
