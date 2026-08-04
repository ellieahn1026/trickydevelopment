import {
  computeAngryHipHopScrollFactor,
  computeAngryHipHopScrollVelocityAt,
  integrateAngryHipHopScrollDistance,
} from "./angryHipHopBeat.ts";
import {
  computeHappyEdmScrollFactor,
  integrateHappyEdmScrollDistance,
} from "./happyEdmBeat.ts";

export type WavePathPoint = {
  x: number;
  y: number;
  arcLength: number;
  angle: number;
};

export type DrawWaveTextOptions = {
  width: number;
  height: number;
  centerY: number;
  sampleY: (x: number) => number;
  font: string;
  fillStyle: string;
  letterSpacing?: number;
  scrollElapsedSeconds?: number;
  scrollSpeedMultiplier?: number;
  /** 0–1 — random accel/decel strength; scales with emotion intensity. */
  scrollSpeedVariance?: number;
  mood?: "happy" | "groggy" | "angry";
  intensity?: number;
  shadowColor?: string;
  shadowBlur?: number;
};

export const WAVE_ANSWER_FONT_SIZE = 18;
export const WAVE_ANSWER_FONT_MAX_SCALE = 2;

export const WAVE_ANSWER_FONT = buildWaveAnswerFont(WAVE_ANSWER_FONT_SIZE);

export function buildWaveAnswerFont(fontSizePx: number): string {
  return `400 ${fontSizePx}px "Arimo", "Xanh Mono", sans-serif`;
}

export const WAVE_TEXT_SCROLL_SPEED = 18;

/** Happy/angry text scroll accelerates sharply at high intensity (groggy excluded). */
export const TEXT_SCROLL_INTENSITY_SPEED = {
  atZero: 1,
  atFull: 6.72,
  /** Higher power = speed stays tame at low intensity, spikes near 100. */
  curvePower: 3.6,
} as const;

/** Groggy text slows markedly as intensity rises (inverse of happy/angry). */
export const GROOGY_SCROLL_INTENSITY_SPEED = {
  atZero: 1,
  atFull: 0.16,
  curvePower: 3.6,
} as const;

/** Angry caps nominal scroll below happy; coaster drops can still surge much faster. */
export const ANGRY_TEXT_SCROLL_MAX_SPEED_RATIO = 0.78;

export const ANGRY_TEXT_SCROLL_INTENSITY_SPEED = {
  atZero: TEXT_SCROLL_INTENSITY_SPEED.atZero,
  atFull: TEXT_SCROLL_INTENSITY_SPEED.atFull * ANGRY_TEXT_SCROLL_MAX_SPEED_RATIO,
  curvePower: TEXT_SCROLL_INTENSITY_SPEED.curvePower,
} as const;

export const TEXT_SCROLL_SPEED_VARIANCE = {
  atZero: 0,
  happyAtFull: 0.88,
  angryAtFull: 0.92,
  groggyAtFull: 0.22,
  curvePower: 3.6,
} as const;

const SCROLL_SPEED_WOBBLE_LAYERS = [
  { weight: 0.36, omega: 1.65, phase: 0.35 },
  { weight: 0.27, omega: 3.05, phase: 1.75 },
  { weight: 0.21, omega: 5.15, phase: 2.55 },
  { weight: 0.16, omega: 8.35, phase: 0.85 },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function computeIntensityScrollFactor(intensity: number): number {
  const normalizedIntensity = clamp(intensity, 0, 100) / 100;
  const curved = normalizedIntensity ** TEXT_SCROLL_INTENSITY_SPEED.curvePower;

  return lerp(
    TEXT_SCROLL_INTENSITY_SPEED.atZero,
    TEXT_SCROLL_INTENSITY_SPEED.atFull,
    curved,
  );
}

export function computeGroggyIntensityScrollFactor(intensity: number): number {
  const normalizedIntensity = clamp(intensity, 0, 100) / 100;
  const curved = normalizedIntensity ** GROOGY_SCROLL_INTENSITY_SPEED.curvePower;

  return lerp(
    GROOGY_SCROLL_INTENSITY_SPEED.atZero,
    GROOGY_SCROLL_INTENSITY_SPEED.atFull,
    curved,
  );
}

export function computeAngryIntensityScrollFactor(intensity: number): number {
  const normalizedIntensity = clamp(intensity, 0, 100) / 100;
  const curved =
    normalizedIntensity ** ANGRY_TEXT_SCROLL_INTENSITY_SPEED.curvePower;

  return lerp(
    ANGRY_TEXT_SCROLL_INTENSITY_SPEED.atZero,
    ANGRY_TEXT_SCROLL_INTENSITY_SPEED.atFull,
    curved,
  );
}

function resolveScrollIntensitySpeedConfig(mood: "happy" | "groggy" | "angry") {
  if (mood === "groggy") {
    return GROOGY_SCROLL_INTENSITY_SPEED;
  }

  if (mood === "angry") {
    return ANGRY_TEXT_SCROLL_INTENSITY_SPEED;
  }

  return TEXT_SCROLL_INTENSITY_SPEED;
}

export function computeAnswerTextScrollMultiplier(
  mood: "happy" | "groggy" | "angry",
  intensity: number,
  moodMultiplier = 1,
): number {
  if (mood === "groggy") {
    return moodMultiplier * computeGroggyIntensityScrollFactor(intensity);
  }

  if (mood === "angry") {
    return moodMultiplier * computeAngryIntensityScrollFactor(intensity);
  }

  return moodMultiplier * computeIntensityScrollFactor(intensity);
}

export function computeScrollSpeedVariance(
  intensity: number,
  mood: "happy" | "groggy" | "angry",
): number {
  const t =
    (clamp(intensity, 0, 100) / 100) ** TEXT_SCROLL_SPEED_VARIANCE.curvePower;
  const atFull =
    mood === "groggy"
      ? TEXT_SCROLL_SPEED_VARIANCE.groggyAtFull
      : mood === "angry"
        ? TEXT_SCROLL_SPEED_VARIANCE.angryAtFull
        : TEXT_SCROLL_SPEED_VARIANCE.happyAtFull;

  return lerp(TEXT_SCROLL_SPEED_VARIANCE.atZero, atFull, t);
}

/** Integrates scroll speed — happy: EDM; angry: hip-hop flow; groggy: smooth wobble. */
export function computeVariableScrollDistance(
  elapsedSeconds: number,
  baseScrollSpeed: number,
  speedVariance: number,
  options?: {
    mood?: "happy" | "groggy" | "angry";
    intensity?: number;
  },
): number {
  if (elapsedSeconds <= 0) {
    return 0;
  }

  const mood = options?.mood;
  const intensity = options?.intensity ?? 0;

  if (mood === "happy" && speedVariance > 0.001) {
    const linear = elapsedSeconds * baseScrollSpeed;
    const edm = integrateHappyEdmScrollDistance(
      elapsedSeconds,
      baseScrollSpeed,
      intensity,
    );
    return linear + (edm - linear) * speedVariance;
  }

  if (mood === "angry" && speedVariance > 0.001) {
    const linear = elapsedSeconds * baseScrollSpeed;
    const coaster = integrateAngryHipHopScrollDistance(
      elapsedSeconds,
      baseScrollSpeed,
      intensity,
    );
    return linear + (coaster - linear) * speedVariance;
  }

  if (speedVariance <= 0.001) {
    return elapsedSeconds * baseScrollSpeed;
  }

  const t = elapsedSeconds;
  let offset = baseScrollSpeed * t;

  for (const layer of SCROLL_SPEED_WOBBLE_LAYERS) {
    const wobbleIntegral =
      (layer.weight * (1 - Math.cos(layer.omega * t + layer.phase))) /
      layer.omega;
    offset += baseScrollSpeed * speedVariance * wobbleIntegral;
  }

  return Math.max(0, offset);
}

/** Instantaneous scroll speed factor (1 = nominal) at a given elapsed time. */
export function computeInstantScrollSpeedFactor(
  elapsedSeconds: number,
  speedVariance: number,
  options?: {
    mood?: "happy" | "groggy" | "angry";
    intensity?: number;
  },
): number {
  if (speedVariance <= 0.001) {
    return 1;
  }

  const mood = options?.mood;
  const intensity = options?.intensity ?? 0;

  if (mood === "happy") {
    const edmFactor = computeHappyEdmScrollFactor(elapsedSeconds, intensity);
    return Math.max(0.12, 1 + (edmFactor - 1) * speedVariance);
  }

  if (mood === "angry") {
    const velocity = computeAngryHipHopScrollVelocityAt(
      elapsedSeconds,
      intensity,
    );
    return Math.max(0.12, 1 + (velocity - 1) * speedVariance);
  }

  const t = elapsedSeconds;
  let factor = 1;

  for (const layer of SCROLL_SPEED_WOBBLE_LAYERS) {
    factor +=
      speedVariance * layer.weight * Math.sin(layer.omega * t + layer.phase);
  }

  return Math.max(0.12, factor);
}

/** Maps current scroll speed to font scale (1× at min speed, 2× at max for mood). */
export function computeAnswerTextFontScale(
  scrollSpeedMultiplier: number,
  moodScrollBaseline: number,
  mood: "happy" | "groggy" | "angry",
): number {
  if (mood === "groggy") {
    return 1;
  }

  const speedConfig = resolveScrollIntensitySpeedConfig(mood);
  const minMultiplier = moodScrollBaseline * speedConfig.atZero;
  const maxMultiplier = moodScrollBaseline * speedConfig.atFull;
  const span = maxMultiplier - minMultiplier;

  if (span <= 0) {
    return 1;
  }

  const t = clamp((scrollSpeedMultiplier - minMultiplier) / span, 0, 1);

  return lerp(1, WAVE_ANSWER_FONT_MAX_SCALE, t);
}

export function computeAnswerTextFontSize(
  scrollSpeedMultiplier: number,
  moodScrollBaseline: number,
  mood: "happy" | "groggy" | "angry",
): number {
  return (
    WAVE_ANSWER_FONT_SIZE *
    computeAnswerTextFontScale(
      scrollSpeedMultiplier,
      moodScrollBaseline,
      mood,
    )
  );
}

/** Groggy answer text letter-spacing (px) grows with intensity. */
export const GROGGY_LETTER_SPACING = {
  atZero: 0,
  atFull: 10,
} as const;

export function computeGroggyLetterSpacing(intensity: number): number {
  const normalizedIntensity = clamp(intensity, 0, 100) / 100;

  return lerp(
    GROGGY_LETTER_SPACING.atZero,
    GROGGY_LETTER_SPACING.atFull,
    normalizedIntensity,
  );
}

export function samplePointOnWave(
  x: number,
  width: number,
  sampleY: (x: number) => number,
): { x: number; y: number; angle: number } {
  const clampedX = clamp(x, 0, width);
  const y = sampleY(clampedX);
  const yBefore = sampleY(Math.max(0, clampedX - 1));
  const yAfter = sampleY(Math.min(width, clampedX + 1));

  return {
    x: clampedX,
    y,
    angle: Math.atan2(yAfter - yBefore, 2),
  };
}

export function plainTextFromAnswer(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/[\r\n\u2028\u2029\v\f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toSingleLine(text: string): string {
  return plainTextFromAnswer(text).replace(/\s+/g, " ").trim();
}

export function buildWavePathSamples(
  width: number,
  sampleY: (x: number) => number,
  sampleStep = 3,
): WavePathPoint[] {
  const points: WavePathPoint[] = [];
  let arcLength = 0;

  for (let x = 0; x <= width; x += sampleStep) {
    const y = sampleY(x);
    const yBefore = sampleY(Math.max(0, x - 1));
    const yAfter = sampleY(Math.min(width, x + 1));
    const angle = Math.atan2(yAfter - yBefore, 2);

    if (points.length > 0) {
      const prev = points[points.length - 1]!;
      arcLength += Math.hypot(x - prev.x, y - prev.y);
    }

    points.push({ x, y, arcLength, angle });
  }

  return points;
}

export function pointAtDistance(
  points: WavePathPoint[],
  distance: number,
): WavePathPoint {
  if (points.length === 0) {
    return { x: 0, y: 0, arcLength: 0, angle: 0 };
  }

  if (distance <= 0) {
    return points[0]!;
  }

  const last = points[points.length - 1]!;
  if (distance >= last.arcLength) {
    return last;
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.arcLength < distance) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const curr = points[lo]!;
  const prev = points[lo - 1]!;
  const span = curr.arcLength - prev.arcLength || 1;
  const t = (distance - prev.arcLength) / span;

  return {
    x: prev.x + (curr.x - prev.x) * t,
    y: prev.y + (curr.y - prev.y) * t,
    arcLength: distance,
    angle: prev.angle + (curr.angle - prev.angle) * t,
  };
}

export function arcLengthAtX(
  points: WavePathPoint[],
  x: number,
): number {
  if (points.length === 0) {
    return 0;
  }

  if (x <= points[0]!.x) {
    return points[0]!.arcLength;
  }

  const last = points[points.length - 1]!;
  if (x >= last.x) {
    return last.arcLength;
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.x < x) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const curr = points[lo]!;
  const prev = points[lo - 1]!;
  const span = curr.x - prev.x || 1;
  const t = (x - prev.x) / span;

  return prev.arcLength + (curr.arcLength - prev.arcLength) * t;
}

export function computeWaveTextScrollOffset(
  elapsedSeconds: number,
  scrollSpeed = WAVE_TEXT_SCROLL_SPEED,
  cycleLength?: number,
  speedVariance = 0,
  options?: {
    mood?: "happy" | "groggy" | "angry";
    intensity?: number;
  },
): number {
  const raw = computeVariableScrollDistance(
    elapsedSeconds,
    scrollSpeed,
    speedVariance,
    options,
  );

  if (!cycleLength || cycleLength <= 0) {
    return raw;
  }

  return raw % cycleLength;
}

function measureTextArcLength(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number,
): number {
  let total = 0;

  for (let index = 0; index < text.length; index += 1) {
    total += ctx.measureText(text[index]!).width;
    if (index < text.length - 1) {
      total += letterSpacing;
    }
  }

  return total;
}

export function drawTextAlongWave(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: DrawWaveTextOptions,
): void {
  const normalized = toSingleLine(text);
  if (!normalized) {
    return;
  }

  const letterSpacing = options.letterSpacing ?? 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, options.width, options.height);
  ctx.clip();

  ctx.font = options.font;
  ctx.fillStyle = options.fillStyle;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  if (options.shadowColor && options.shadowBlur) {
    ctx.shadowColor = options.shadowColor;
    ctx.shadowBlur = options.shadowBlur;
  }

  const scrollSpeed =
    WAVE_TEXT_SCROLL_SPEED * (options.scrollSpeedMultiplier ?? 1);
  const speedVariance = options.scrollSpeedVariance ?? 0;
  const points = buildWavePathSamples(options.width, options.sampleY, 2);
  const pathLength = points[points.length - 1]?.arcLength ?? options.width;
  const textArcLength = measureTextArcLength(ctx, normalized, letterSpacing);
  const scrollCycleLength = pathLength + textArcLength;
  const scrollOffset = computeWaveTextScrollOffset(
    options.scrollElapsedSeconds ?? 0,
    scrollSpeed,
    scrollCycleLength,
    speedVariance,
    {
      mood: options.mood,
      intensity: options.intensity,
    },
  );

  let arcCursor = pathLength - scrollOffset;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;
    const charWidth = ctx.measureText(char).width;
    const trailingSpacing =
      index < normalized.length - 1 ? letterSpacing : 0;
    const charArcEnd = arcCursor + charWidth;

    if (charArcEnd <= 0 || arcCursor >= pathLength) {
      arcCursor += charWidth + trailingSpacing;
      continue;
    }

    const pos = pointAtDistance(points, arcCursor + charWidth * 0.5);
    const charLeft = pos.x - charWidth * 0.5;
    const charRight = pos.x + charWidth * 0.5;

    if (charRight <= 0 || charLeft >= options.width) {
      arcCursor += charWidth + trailingSpacing;
      continue;
    }

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(pos.angle);
    ctx.fillText(char, 0, 0);
    ctx.restore();

    arcCursor += charWidth + trailingSpacing;
  }

  ctx.restore();
}
