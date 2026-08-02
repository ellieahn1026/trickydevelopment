import icAngry1 from "../../assets/icons/ic_angry1.svg";
import icGroggy1 from "../../assets/icons/ic_groggy1.svg";
import icGroggy2 from "../../assets/icons/ic_groggy2.svg";
import icHappy1 from "../../assets/icons/ic_happy1.svg";
import icHappy2 from "../../assets/icons/ic_happy2.svg";
import type { Mood } from "../types/emotion.ts";

export const HAPPY_POP_ICONS = [icHappy1, icHappy2] as const;

export const GROGGY_FALL_ICONS = [icGroggy1, icGroggy2] as const;

export const ANGRY_BOUNCE_ICON = icAngry1;

export type HappyPopIconBudget = {
  maxActive: number;
  spawnIntervalMs: number;
  riseDurationMs: number;
};

export type GroggyFallIconBudget = {
  maxActive: number;
  spawnIntervalMs: number;
  fallDurationMs: number;
};

export type AngryBounceIconBudget = {
  maxActive: number;
  /** Icons spawned together on each tick; scales with intensity. */
  spawnBatchSize: number;
  spawnIntervalMs: number;
  bounceDurationMs: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/** Low intensity stays tame; high intensity ramps up aggressively. */
function intensityCurve(intensity: number, exponent = 2.6): number {
  const normalized = clamp(intensity, 0, 100) / 100;
  return Math.pow(normalized, exponent);
}

/** Random icon size; higher intensity skews toward larger sizes. */
export function resolveEmotionIconSizePx(intensity: number): number {
  const normalized = clamp(intensity, 0, 100) / 100;
  const minPx = lerp(44, 72, normalized);
  const maxPx = lerp(92, 160, normalized);
  const largeBiasExponent = lerp(2.4, 0.35, normalized);
  const t = Math.pow(Math.random(), largeBiasExponent);

  return Math.round(minPx + (maxPx - minPx) * t);
}

/** Maps emotion intensity (0–100) to how many happy icons can pop at once. */
export function resolveHappyPopIconBudget(intensity: number): HappyPopIconBudget {
  const normalized = clamp(intensity, 0, 100) / 100;

  return {
    maxActive: Math.max(1, Math.round(lerp(1, 20, normalized))),
    spawnIntervalMs: Math.round(lerp(1600, 240, normalized)),
    riseDurationMs: Math.round(lerp(2200, 1400, normalized)),
  };
}

/** Maps emotion intensity (0–100) to how many groggy icons can fall at once. */
export function resolveGroggyFallIconBudget(
  intensity: number,
): GroggyFallIconBudget {
  const extreme = intensityCurve(intensity);

  return {
    maxActive: Math.max(1, Math.round(lerp(4, 440, extreme))),
    spawnIntervalMs: Math.round(lerp(1500, 18, extreme)),
    fallDurationMs: Math.round(lerp(6200, 2400, extreme)),
  };
}

/** Maps emotion intensity (0–100) to angry bounce icon density and burst size. */
export function resolveAngryBounceIconBudget(
  intensity: number,
): AngryBounceIconBudget {
  const normalized = clamp(intensity, 0, 100) / 100;
  const extreme = intensityCurve(intensity, 2.1);

  return {
    maxActive: Math.max(1, Math.round(lerp(1, 32, extreme))),
    spawnBatchSize: Math.max(1, Math.round(lerp(1, 14, extreme))),
    spawnIntervalMs: Math.round(lerp(2600, 320, extreme)),
    bounceDurationMs: Math.round(lerp(1800, 850, normalized)),
  };
}

export function shouldShowEmotionPopIcons(mood: Mood): boolean {
  return mood === "happy";
}

export function shouldShowGroggyFallIcons(mood: Mood): boolean {
  return mood === "groggy";
}

export function shouldShowAngryBounceIcons(mood: Mood): boolean {
  return mood === "angry";
}

export function pickHappyPopIcon(index: number): string {
  return HAPPY_POP_ICONS[index % HAPPY_POP_ICONS.length]!;
}

export function pickGroggyFallIcon(index: number): string {
  return GROGGY_FALL_ICONS[index % GROGGY_FALL_ICONS.length]!;
}

export function pickAngryBounceIcon(): string {
  return ANGRY_BOUNCE_ICON;
}
