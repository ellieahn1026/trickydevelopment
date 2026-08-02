import type { EmotionState, Mood } from "../types/emotion.ts";
import type { ChatApiEmotion } from "../api/chat.ts";

const BACKEND_MOOD_TO_UI: Record<string, Mood> = {
  happy: "happy",
  angry: "angry",
  neutral: "groggy",
  sad: "groggy",
  groggy: "groggy",
};

function clampIntensity(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function mapApiEmotion(emotion: ChatApiEmotion): EmotionState {
  return {
    mood: BACKEND_MOOD_TO_UI[emotion.mood] ?? "groggy",
    intensity: clampIntensity(emotion.intensity),
  };
}
