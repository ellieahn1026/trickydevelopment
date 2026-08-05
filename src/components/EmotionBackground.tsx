import type { ReactNode } from "react";

import { getEmotionVisualConfig } from "../config/emotionVisualConfig.ts";
import type { EmotionState } from "../types/emotion.ts";
import { EmotionBounceIcons } from "./EmotionBounceIcons.tsx";
import { EmotionFallIcons } from "./EmotionFallIcons.tsx";
import { EmotionPopIcons } from "./EmotionPopIcons.tsx";
import { EmotionWave } from "./EmotionWave.tsx";

type EmotionBackgroundProps = {
  emotion: EmotionState;
  answerText?: string | null;
  answerScrollKey?: string | null;
  children?: ReactNode;
};

const BACKGROUND_STYLE = {
  zIndex: 0,
} as const;

export function EmotionBackground({
  emotion,
  answerText = null,
  answerScrollKey = null,
  children,
}: EmotionBackgroundProps) {
  const { backgroundColor } = getEmotionVisualConfig(emotion);

  return (
    <div
      className="emotion-background"
      data-mood={emotion.mood}
      data-intensity={emotion.intensity}
      style={{
        ...BACKGROUND_STYLE,
        backgroundColor,
      }}
    >
      <EmotionPopIcons emotion={emotion} />
      <EmotionFallIcons emotion={emotion} />
      <EmotionBounceIcons emotion={emotion} />
      <EmotionWave
        emotion={emotion}
        answerText={answerText}
        answerScrollKey={answerScrollKey}
      />
      {children ? (
        <div className="emotion-background__content">{children}</div>
      ) : null}
    </div>
  );
}
