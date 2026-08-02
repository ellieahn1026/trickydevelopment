import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  pickAngryBounceIcon,
  resolveAngryBounceIconBudget,
  resolveEmotionIconSizePx,
  shouldShowAngryBounceIcons,
} from "../config/emotionIconConfig.ts";
import type { EmotionState } from "../types/emotion.ts";

type BounceIcon = {
  id: string;
  src: string;
  xPercent: number;
  sizePx: number;
  durationMs: number;
  delayMs: number;
  peakY: string;
  settleY: string;
  reboundY: string;
  peakScale: number;
  settleScale: number;
  reboundScale: number;
  easing: string;
};

type EmotionBounceIconsProps = {
  emotion: EmotionState;
};

const BOUNCE_EASINGS = [
  "cubic-bezier(0.34, 1.4, 0.64, 1)",
  "cubic-bezier(0.22, 1, 0.36, 1)",
  "cubic-bezier(0.68, -0.55, 0.27, 1.55)",
  "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  "cubic-bezier(0.55, 0.09, 0.68, 0.53)",
  "cubic-bezier(0.17, 0.84, 0.44, 1.2)",
] as const;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

function toNegativeVh(valueVh: number): string {
  return `-${valueVh}vh`;
}

function createBounceIcon(spawnIndex: number, intensity: number): BounceIcon {
  const peakVh = randomBetween(18, 98);
  const settleVh = peakVh * randomBetween(0.2, 0.55);
  const reboundVh = peakVh * randomBetween(0.55, 0.92);

  return {
    id: `angry-bounce-${spawnIndex}-${Math.random().toString(36).slice(2, 8)}`,
    src: pickAngryBounceIcon(),
    xPercent: randomBetween(4, 96),
    sizePx: resolveEmotionIconSizePx(intensity),
    durationMs: randomBetween(480, 3600),
    delayMs: randomBetween(0, 520),
    peakY: toNegativeVh(peakVh),
    settleY: toNegativeVh(settleVh),
    reboundY: toNegativeVh(reboundVh),
    peakScale: randomBetween(0.92, 1.28),
    settleScale: randomBetween(0.82, 1.02),
    reboundScale: randomBetween(0.88, 1.12),
    easing: pickRandom(BOUNCE_EASINGS),
  };
}

export function EmotionBounceIcons({ emotion }: EmotionBounceIconsProps) {
  const [icons, setIcons] = useState<BounceIcon[]>([]);
  const spawnIndexRef = useRef(0);
  const iconsRef = useRef<BounceIcon[]>([]);

  useEffect(() => {
    iconsRef.current = icons;
  }, [icons]);

  useEffect(() => {
    if (!shouldShowAngryBounceIcons(emotion.mood)) {
      setIcons([]);
      return;
    }

    const budget = resolveAngryBounceIconBudget(emotion.intensity);

    const trySpawn = () => {
      const remaining = budget.maxActive - iconsRef.current.length;
      if (remaining <= 0) {
        return;
      }

      const batchSize = Math.min(budget.spawnBatchSize, remaining);
      const nextIcons: BounceIcon[] = [];

      for (let index = 0; index < batchSize; index += 1) {
        spawnIndexRef.current += 1;
        nextIcons.push(createBounceIcon(spawnIndexRef.current, emotion.intensity));
      }

      setIcons((current) => [...current, ...nextIcons]);
    };

    trySpawn();
    const intervalId = window.setInterval(trySpawn, budget.spawnIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [emotion.mood, emotion.intensity]);

  useEffect(() => {
    if (!shouldShowAngryBounceIcons(emotion.mood)) {
      return;
    }

    setIcons([]);
    spawnIndexRef.current = 0;
  }, [emotion.mood]);

  function removeIcon(id: string) {
    setIcons((current) => current.filter((icon) => icon.id !== id));
  }

  if (!shouldShowAngryBounceIcons(emotion.mood)) {
    return null;
  }

  return (
    <div className="emotion-bounce-icons" aria-hidden="true">
      {icons.map((icon) => (
        <img
          key={icon.id}
          className="emotion-bounce-icons__item"
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
              "--angry-bounce-peak-y": icon.peakY,
              "--angry-bounce-settle-y": icon.settleY,
              "--angry-bounce-rebound-y": icon.reboundY,
              "--angry-bounce-peak-scale": icon.peakScale,
              "--angry-bounce-settle-scale": icon.settleScale,
              "--angry-bounce-rebound-scale": icon.reboundScale,
              "--angry-bounce-easing": icon.easing,
            } as CSSProperties
          }
          onAnimationEnd={() => removeIcon(icon.id)}
        />
      ))}
    </div>
  );
}
