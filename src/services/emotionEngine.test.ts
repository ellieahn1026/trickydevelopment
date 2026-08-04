import { test, expect } from "bun:test";

import { createInitialEmotionState } from "../models/emotion.ts";
import { DEFAULT_EMOTION_ANALYSIS } from "./emotionAnalyzer.ts";
import {
  applySpontaneousAnger,
  computeMoodSustainIntensityGain,
  computeSpontaneousAngerProbability,
  updateEmotion,
  updateEmotionDeterministic,
} from "./emotionEngine.ts";

const GROGGY_SCHEDULE_DATE = new Date(2026, 7, 2, 6, 0);
const groggyInitialState = () =>
  createInitialEmotionState({ date: GROGGY_SCHEDULE_DATE });

test("personalAttack > 0.75 forces angry intensity >= 95", () => {
  const state = groggyInitialState();
  const next = updateEmotionDeterministic(state, {
    ...DEFAULT_EMOTION_ANALYSIS,
    personalAttack: 0.95,
    trigger: "attack",
  });

  expect(next.mood).toBe("angry");
  expect(next.intensity).toBeGreaterThanOrEqual(95);
});

test("apology reduces anger without snapping to happy", () => {
  const angry = updateEmotionDeterministic(groggyInitialState(), {
    ...DEFAULT_EMOTION_ANALYSIS,
    personalAttack: 0.95,
    trigger: "attack",
  });

  const next = updateEmotionDeterministic(angry, {
    ...DEFAULT_EMOTION_ANALYSIS,
    apology: 0.9,
    trigger: "neutral",
  });

  expect(next.angerMomentum).toBeLessThan(angry.angerMomentum);
  expect(next.resentment).toBeLessThan(angry.resentment);
  expect(next.mood).not.toBe("happy");
});

test("deescalation request lowers intensity for angry mood", () => {
  const angry = updateEmotionDeterministic(groggyInitialState(), {
    ...DEFAULT_EMOTION_ANALYSIS,
    personalAttack: 0.95,
    trigger: "attack",
  });

  const next = updateEmotionDeterministic(angry, {
    ...DEFAULT_EMOTION_ANALYSIS,
    deescalation: 0.9,
    friendliness: 0.4,
    trigger: "deescalation",
  });

  expect(next.mood).toBe("angry");
  expect(next.intensity).toBeLessThan(angry.intensity - 20);
  expect(next.angerMomentum).toBeLessThan(angry.angerMomentum);
});

test("deterministic updates are stable", () => {
  const state = groggyInitialState();
  const signal = {
    ...DEFAULT_EMOTION_ANALYSIS,
    criticism: 0.7,
    trigger: "criticism" as const,
  };

  const a = updateEmotionDeterministic(state, signal);
  const b = updateEmotionDeterministic(state, signal);

  expect(a).toEqual(b);
});

test("default volatility gives about 20% spontaneous anger chance", () => {
  expect(computeSpontaneousAngerProbability(0.7)).toBeCloseTo(0.2, 5);
});

test("higher volatility increases spontaneous anger chance", () => {
  expect(computeSpontaneousAngerProbability(1)).toBeGreaterThan(
    computeSpontaneousAngerProbability(0.3),
  );
});

test("spontaneous anger does not trigger while cooldown is active", () => {
  const state = {
    ...groggyInitialState(),
    spontaneousAngerCooldown: 5,
    intensity: 20,
  };

  const next = applySpontaneousAnger(state, () => 0);

  expect(next.intensity).toBe(20);
  expect(next.spontaneousAngerCooldown).toBe(4);
  expect(next.lastTrigger).toBe(state.lastTrigger);
});

test("spontaneous anger boosts anger and sets cooldown", () => {
  const state = groggyInitialState();
  let call = 0;
  const random = () => {
    call += 1;
    if (call === 1) return 0;
    if (call === 2) return 0;
    return 0;
  };

  const next = applySpontaneousAnger(state, random);

  expect(next.mood).toBe("angry");
  expect(next.intensity).toBe(state.intensity + 35);
  expect(next.angerMomentum).toBeCloseTo(35 * 0.65, 5);
  expect(next.spontaneousAngerCooldown).toBe(5);
  expect(next.lastTrigger).toBe("spontaneous_anger");
});

test("updateEmotion uses injected random dependency", () => {
  const state = groggyInitialState();
  let call = 0;
  const random = () => {
    call += 1;
    return 0;
  };

  const next = updateEmotion(state, DEFAULT_EMOTION_ANALYSIS, { random });

  expect(next.mood).toBe("angry");
  expect(call).toBeGreaterThan(0);
});

test("neutral input keeps Pepper in sad groggy mood by default", () => {
  const next = updateEmotionDeterministic(groggyInitialState(), {
    ...DEFAULT_EMOTION_ANALYSIS,
    trigger: "neutral",
  });

  expect(next.mood).toBe("sad");
});

test("strong praise shifts mood to happy", () => {
  const next = updateEmotionDeterministic(groggyInitialState(), {
    ...DEFAULT_EMOTION_ANALYSIS,
    praise: 0.9,
    friendliness: 0.8,
    affection: 0.7,
    sentiment: 0.8,
    trigger: "praise",
  });

  expect(next.mood).toBe("happy");
});

test("sustained mood increases intensity each turn", () => {
  const neutral = {
    ...DEFAULT_EMOTION_ANALYSIS,
    trigger: "neutral" as const,
  };

  const first = updateEmotionDeterministic(groggyInitialState(), neutral);
  const second = updateEmotionDeterministic(first, neutral);
  const third = updateEmotionDeterministic(second, neutral);

  expect(first.moodStreak).toBe(2);
  expect(second.moodStreak).toBe(3);
  expect(third.moodStreak).toBe(4);
  expect(computeMoodSustainIntensityGain(1)).toBe(0);
  expect(computeMoodSustainIntensityGain(2)).toBe(4);
  expect(second.intensity).toBeGreaterThan(first.intensity);
  expect(third.intensity).toBeGreaterThan(second.intensity);
});

test("mood change resets streak and skips sustain gain on first turn", () => {
  const sustained = updateEmotionDeterministic(groggyInitialState(), {
    ...DEFAULT_EMOTION_ANALYSIS,
    trigger: "neutral",
  });

  const shifted = updateEmotionDeterministic(sustained, {
    ...DEFAULT_EMOTION_ANALYSIS,
    praise: 0.9,
    friendliness: 0.8,
    affection: 0.7,
    sentiment: 0.8,
    trigger: "praise",
  });

  expect(sustained.mood).toBe("sad");
  expect(shifted.mood).toBe("happy");
  expect(shifted.moodStreak).toBe(1);
});
