import { useMemo } from "react";

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

  return {
    normalizedIntensity,
    amplitude: baseAmplitude * wave.amplitudeMultiplier,
    speed: baseSpeed * wave.speedMultiplier,
    frequency: baseFrequency * wave.frequencyMultiplier,
    irregularity: lerp(bounds.irregularity.atZero, wave.irregularity, normalizedIntensity),
    jitter: config.mood === "happy" ? 0 : lerp(bounds.jitter.atZero, wave.jitter, normalizedIntensity),
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
