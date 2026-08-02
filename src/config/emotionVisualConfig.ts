import type { EmotionState, Mood } from "../types/emotion.ts";

/** Canvas wave motion parameters; base values are per mood before intensity scaling. */
export type EmotionWaveVisualParams = {
  frequencyMultiplier: number;
  amplitudeMultiplier: number;
  speedMultiplier: number;
  /** 0–1 — how much the wave path deviates from a steady rhythm. */
  irregularity: number;
  /** 0–1 — high-frequency tremble layered on top of the wave. */
  jitter: number;
  /** Scales horizontal answer-text scroll speed (default 1). */
  textScrollSpeedMultiplier?: number;
};

export type MoodVisualConfig = {
  backgroundColor: string;
  /** Stroke/fill color for the wave layer on canvas. */
  waveColor: string;
  wave: EmotionWaveVisualParams;
};

export type EmotionVisualConfig = MoodVisualConfig & {
  mood: Mood;
};

/** Canvas wave stroke styling — independent of intensity. */
export type WaveLineStyle = {
  color: string;
  lineWidth: number;
  /** 0–1 stroke opacity */
  opacity: number;
  glowColor: string;
  /** px; 0 disables glow */
  glowBlur: number;
};

export const WAVE_LINE_CONFIG: WaveLineStyle = {
  color: "#FFFFFF",
  lineWidth: 3,
  opacity: 0.92,
  glowColor: "#FFFFFF",
  glowBlur: 5,
};

/** Optional per-mood glow tweaks; line width stays constant. */
export const WAVE_LINE_MOOD_OVERRIDES: Partial<
  Record<Mood, Partial<Pick<WaveLineStyle, "opacity" | "glowBlur" | "glowColor">>>
> = {
  happy: { opacity: 0.9, glowBlur: 4 },
  groggy: { opacity: 0.88, glowBlur: 6 },
  angry: { opacity: 0.95, glowBlur: 7 },
};

export function getWaveLineStyle(mood: Mood): WaveLineStyle {
  const override = WAVE_LINE_MOOD_OVERRIDES[mood];

  return {
    ...WAVE_LINE_CONFIG,
    ...override,
  };
}

export type WaveAnswerTextStyle = {
  fillStyle: string;
  shadowColor: string;
  shadowBlur: number;
};

const WAVE_ANSWER_TEXT_STYLE: Record<Mood, WaveAnswerTextStyle> = {
  happy: {
    fillStyle: "#000000",
    shadowColor: "rgba(0, 0, 0, 0.12)",
    shadowBlur: 4,
  },
  groggy: {
    fillStyle: "#ffffff",
    shadowColor: "rgba(0, 0, 0, 0.28)",
    shadowBlur: 6,
  },
  angry: {
    fillStyle: "#ffffff",
    shadowColor: "rgba(0, 0, 0, 0.28)",
    shadowBlur: 6,
  },
};

export function getWaveAnswerTextStyle(mood: Mood): WaveAnswerTextStyle {
  return WAVE_ANSWER_TEXT_STYLE[mood];
}

const MOOD_VISUAL_CONFIG: Record<Mood, MoodVisualConfig> = {
  happy: {
    backgroundColor: "#FFDD00",
    waveColor: "#FF9500",
    wave: {
      frequencyMultiplier: 1.05,
      amplitudeMultiplier: 0.9,
      speedMultiplier: 1.1,
      irregularity: 0.02,
      jitter: 0,
      textScrollSpeedMultiplier: 6,
    },
  },
  groggy: {
    backgroundColor: "#570FFF",
    waveColor: "#B794FF",
    wave: {
      frequencyMultiplier: 0.88,
      amplitudeMultiplier: 0.82,
      speedMultiplier: 0.442,
      irregularity: 0.48,
      jitter: 0.03,
      textScrollSpeedMultiplier: 1.95,
    },
  },
  angry: {
    backgroundColor: "#FF3F0F",
    waveColor: "#FFD000",
    wave: {
      frequencyMultiplier: 1.75,
      amplitudeMultiplier: 1.25,
      speedMultiplier: 1.15,
      irregularity: 0.58,
      jitter: 0.42,
      textScrollSpeedMultiplier: 2,
    },
  },
};

export function getMoodVisualConfig(mood: Mood): MoodVisualConfig {
  return MOOD_VISUAL_CONFIG[mood];
}

export function getEmotionVisualConfig(emotion: EmotionState): EmotionVisualConfig {
  const base = getMoodVisualConfig(emotion.mood);

  return {
    mood: emotion.mood,
    ...base,
  };
}
