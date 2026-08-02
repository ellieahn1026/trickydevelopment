import { buildInitialUiEmotionState } from "../lib/scheduledInitialEmotion.ts";

export type Mood = "happy" | "groggy" | "angry";

export interface EmotionState {
  mood: Mood;
  /** 0–100 */
  intensity: number;
}

export const DEFAULT_EMOTION_STATE: EmotionState = buildInitialUiEmotionState();
