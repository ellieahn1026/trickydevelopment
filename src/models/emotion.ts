import { z } from "zod";

import {
  buildInitialBackendEmotionState,
  type InitialEmotionOptions,
} from "../lib/scheduledInitialEmotion";

export const EmotionNameSchema = z.enum(["happy", "neutral", "sad", "angry"]);

export type EmotionName = z.infer<typeof EmotionNameSchema>;

export type EmotionState = {
  mood: EmotionName;
  intensity: number;
  /** Consecutive turns with the same mood (including the current turn). */
  moodStreak: number;
  angerMomentum: number;
  resentment: number;
  trust: number;
  volatility: number;
  spontaneousAngerCooldown: number;
  lastTrigger: string | null;
};

export const EmotionStateSchema = z.object({
  mood: EmotionNameSchema,
  intensity: z.number().min(0).max(100),
  moodStreak: z.number().min(1),
  angerMomentum: z.number().min(0).max(100),
  resentment: z.number().min(0).max(100),
  trust: z.number().min(0).max(100),
  volatility: z.number().min(0).max(1),
  spontaneousAngerCooldown: z.number().min(0),
  lastTrigger: z.string().nullable(),
});

export function createInitialEmotionState(
  options: InitialEmotionOptions = {},
): EmotionState {
  return buildInitialBackendEmotionState(options);
}
