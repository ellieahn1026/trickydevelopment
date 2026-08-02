import { useEffect, useRef, useState } from "react";

import {
  pickHappyPopIcon,
  resolveEmotionIconSizePx,
  resolveHappyPopIconBudget,
  shouldShowEmotionPopIcons,
} from "../config/emotionIconConfig.ts";
import type { EmotionState } from "../types/emotion.ts";

type PopIcon = {
  id: string;
  src: string;
  xPercent: number;
  sizePx: number;
  durationMs: number;
  delayMs: number;
};

type EmotionPopIconsProps = {
  emotion: EmotionState;
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createPopIcon(
  spawnIndex: number,
  durationMs: number,
  intensity: number,
): PopIcon {
  return {
    id: `happy-pop-${spawnIndex}-${Math.random().toString(36).slice(2, 8)}`,
    src: pickHappyPopIcon(spawnIndex),
    xPercent: randomBetween(8, 92),
    sizePx: resolveEmotionIconSizePx(intensity),
    durationMs: durationMs * randomBetween(0.88, 1.08),
    delayMs: 0,
  };
}

export function EmotionPopIcons({ emotion }: EmotionPopIconsProps) {
  const [icons, setIcons] = useState<PopIcon[]>([]);
  const spawnIndexRef = useRef(0);
  const iconsRef = useRef<PopIcon[]>([]);

  useEffect(() => {
    iconsRef.current = icons;
  }, [icons]);

  useEffect(() => {
    if (!shouldShowEmotionPopIcons(emotion.mood)) {
      setIcons([]);
      return;
    }

    const budget = resolveHappyPopIconBudget(emotion.intensity);

    const trySpawn = () => {
      if (iconsRef.current.length >= budget.maxActive) {
        return;
      }

      spawnIndexRef.current += 1;
      const nextIcon = createPopIcon(
        spawnIndexRef.current,
        budget.riseDurationMs,
        emotion.intensity,
      );

      setIcons((current) => [...current, nextIcon]);
    };

    trySpawn();
    const intervalId = window.setInterval(trySpawn, budget.spawnIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [emotion.mood, emotion.intensity]);

  useEffect(() => {
    if (!shouldShowEmotionPopIcons(emotion.mood)) {
      return;
    }

    setIcons([]);
    spawnIndexRef.current = 0;
  }, [emotion.mood]);

  function removeIcon(id: string) {
    setIcons((current) => current.filter((icon) => icon.id !== id));
  }

  if (!shouldShowEmotionPopIcons(emotion.mood)) {
    return null;
  }

  return (
    <div className="emotion-pop-icons" aria-hidden="true">
      {icons.map((icon) => (
        <img
          key={icon.id}
          className="emotion-pop-icons__item"
          src={icon.src}
          alt=""
          width={icon.sizePx}
          height={icon.sizePx}
          decoding="async"
          draggable={false}
          style={{
            left: `${icon.xPercent}%`,
            width: `${icon.sizePx}px`,
            height: `${icon.sizePx}px`,
            animationDuration: `${icon.durationMs}ms`,
            animationDelay: `${icon.delayMs}ms`,
          }}
          onAnimationEnd={() => removeIcon(icon.id)}
        />
      ))}
    </div>
  );
}
