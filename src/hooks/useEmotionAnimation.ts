import { useMemo } from "react";

import {
  computeHappyEdmIntensityT,
} from "../lib/happyEdmBeat.ts";
import {
  computeAngryHipHopIntensityT,
} from "../lib/angryHipHopBeat.ts";
import {
  getEmotionVisualConfig,
  type EmotionVisualConfig,
} from "../config/emotionVisualConfig.ts";
import type { EmotionState } from "../types/emotion.ts";

/** Tunable base ranges before mood multipliers are applied. */
export const EMOTION_ANIMATION_BOUNDS = {
  amplitude: {
    atZeroMinPx: 5,
    atZeroMaxPx: 8,
    atFullPx: 100,
  },
  speed: {
    atZero: 0.08,
    atFull: 1.65,
  },
  frequency: {
    atZero: 0.62,
    atFull: 5.4,
  },
  irregularity: {
    atZero: 0.02,
  },
  jitter: {
    atZero: 0.01,
  },
  /** Groggy caps how much speed can grow with intensity (fraction of atFull). */
  groggySpeedIntensityCap: 0.38,
} as const;

/** Happy wave path gets more uneven as intensity rises (groggy/angry use mood config). */
export const HAPPY_WAVE_RANDOMNESS = {
  irregularityAtZero: 0.02,
  irregularityAtFull: 0.82,
  jitterAtZero: 0,
  jitterAtFull: 0.52,
  curvePower: 3.6,
} as const;

export type EmotionAnimationParams = {
  normalizedIntensity: number;
  amplitude: number;
  speed: number;
  frequency: number;
  irregularity: number;
  jitter: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function computeHappyWaveRandomness(intensity: number): {
  irregularity: number;
  jitter: number;
} {
  const t =
    (clamp(intensity, 0, 100) / 100) ** HAPPY_WAVE_RANDOMNESS.curvePower;

  return {
    irregularity: lerp(
      HAPPY_WAVE_RANDOMNESS.irregularityAtZero,
      HAPPY_WAVE_RANDOMNESS.irregularityAtFull,
      t,
    ),
    jitter: lerp(
      HAPPY_WAVE_RANDOMNESS.jitterAtZero,
      HAPPY_WAVE_RANDOMNESS.jitterAtFull,
      t,
    ),
  };
}

export function computeEmotionAnimationParams(
  emotion: EmotionState,
  config: EmotionVisualConfig,
): EmotionAnimationParams {
  const normalizedIntensity = clamp(emotion.intensity, 0, 100) / 100;
  const { wave } = config;
  const bounds = EMOTION_ANIMATION_BOUNDS;

  const amplitudeAtZero =
    (bounds.amplitude.atZeroMinPx + bounds.amplitude.atZeroMaxPx) / 2;

  const baseAmplitude = lerp(
    amplitudeAtZero,
    bounds.amplitude.atFullPx,
    normalizedIntensity,
  );

  const speedAtFull =
    config.mood === "groggy"
      ? bounds.speed.atFull * bounds.groggySpeedIntensityCap
      : bounds.speed.atFull;
  const baseSpeed = lerp(bounds.speed.atZero, speedAtFull, normalizedIntensity);

  const baseFrequency = lerp(
    bounds.frequency.atZero,
    bounds.frequency.atFull,
    normalizedIntensity,
  );

  const happyRandomness =
    config.mood === "happy"
      ? computeHappyWaveRandomness(emotion.intensity)
      : null;

  const happyEdmDrive =
    config.mood === "happy"
      ? 1 + computeHappyEdmIntensityT(emotion.intensity) ** 1.35 * 0.24
      : 1;

  const angryHipHopDrive =
    config.mood === "angry"
      ? 1 + computeAngryHipHopIntensityT(emotion.intensity) ** 1.3 * 0.28
      : 1;

  const moodSpeedDrive = config.mood === "happy" ? happyEdmDrive : angryHipHopDrive;

  return {
    normalizedIntensity,
    amplitude: baseAmplitude * wave.amplitudeMultiplier,
    speed: baseSpeed * wave.speedMultiplier * moodSpeedDrive,
    frequency:
      baseFrequency *
      wave.frequencyMultiplier *
      (config.mood === "happy"
        ? 1 + computeHappyEdmIntensityT(emotion.intensity) ** 1.35 * 0.16
        : config.mood === "angry"
          ? 1 + computeAngryHipHopIntensityT(emotion.intensity) ** 1.25 * 0.2
          : 1),
    irregularity: happyRandomness
      ? happyRandomness.irregularity
      : lerp(bounds.irregularity.atZero, wave.irregularity, normalizedIntensity),
    jitter: happyRandomness
      ? happyRandomness.jitter
      : lerp(bounds.jitter.atZero, wave.jitter, normalizedIntensity),
  };
}

export function useEmotionAnimation(emotion: EmotionState) {
  return useMemo(() => {
    const config = getEmotionVisualConfig(emotion);
    const animation = computeEmotionAnimationParams(emotion, config);

    return {
      emotion,
      config,
      ...animation,
    };
  }, [emotion.mood, emotion.intensity]);
}
