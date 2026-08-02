import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  pickGroggyFallIcon,
  resolveEmotionIconSizePx,
  resolveGroggyFallIconBudget,
  shouldShowGroggyFallIcons,
} from "../config/emotionIconConfig.ts";
import type { EmotionState } from "../types/emotion.ts";

type FallIcon = {
  id: string;
  src: string;
  xPercent: number;
  sizePx: number;
  durationMs: number;
  delayMs: number;
  driftPx: number;
};

type EmotionFallIconsProps = {
  emotion: EmotionState;
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createFallIcon(
  spawnIndex: number,
  durationMs: number,
  intensity: number,
): FallIcon {
  return {
    id: `groggy-fall-${spawnIndex}-${Math.random().toString(36).slice(2, 8)}`,
    src: pickGroggyFallIcon(spawnIndex),
    xPercent: randomBetween(6, 94),
    sizePx: resolveEmotionIconSizePx(intensity),
    durationMs: durationMs * randomBetween(0.9, 1.12),
    delayMs: 0,
    driftPx: randomBetween(-28, 28),
  };
}

export function EmotionFallIcons({ emotion }: EmotionFallIconsProps) {
  const [icons, setIcons] = useState<FallIcon[]>([]);
  const spawnIndexRef = useRef(0);
  const iconsRef = useRef<FallIcon[]>([]);

  useEffect(() => {
    iconsRef.current = icons;
  }, [icons]);

  useEffect(() => {
    if (!shouldShowGroggyFallIcons(emotion.mood)) {
      setIcons([]);
      return;
    }

    const budget = resolveGroggyFallIconBudget(emotion.intensity);

    const trySpawn = () => {
      if (iconsRef.current.length >= budget.maxActive) {
        return;
      }

      spawnIndexRef.current += 1;
      const nextIcon = createFallIcon(
        spawnIndexRef.current,
        budget.fallDurationMs,
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
    if (!shouldShowGroggyFallIcons(emotion.mood)) {
      return;
    }

    setIcons([]);
    spawnIndexRef.current = 0;
  }, [emotion.mood]);

  function removeIcon(id: string) {
    setIcons((current) => current.filter((icon) => icon.id !== id));
  }

  if (!shouldShowGroggyFallIcons(emotion.mood)) {
    return null;
  }

  return (
    <div className="emotion-fall-icons" aria-hidden="true">
      {icons.map((icon) => (
        <img
          key={icon.id}
          className="emotion-fall-icons__item"
          src={icon.src}
          alt=""
          width={icon.sizePx}
          height={icon.sizePx}
          decoding="async"
          draggable={false}
          style={
            {
              left: `${icon.xPercent}%`,
              width: `${icon.sizePx}px`,
              height: `${icon.sizePx}px`,
              animationDuration: `${icon.durationMs}ms`,
              animationDelay: `${icon.delayMs}ms`,
              "--groggy-fall-drift": `${icon.driftPx}px`,
            } as CSSProperties
          }
          onAnimationEnd={() => removeIcon(icon.id)}
        />
      ))}
    </div>
  );
}
