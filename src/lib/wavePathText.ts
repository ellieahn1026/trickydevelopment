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
  shadowColor?: string;
  shadowBlur?: number;
};

export const WAVE_ANSWER_FONT =
  '400 18px "Arimo", "Xanh Mono", sans-serif';

export const WAVE_TEXT_SCROLL_SPEED = 18;

/** Happy/angry text scroll accelerates sharply at high intensity (groggy excluded). */
export const TEXT_SCROLL_INTENSITY_SPEED = {
  atZero: 1,
  atFull: 14,
  /** Higher power = speed stays tame at low intensity, spikes near 100. */
  curvePower: 3.6,
} as const;

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

export function computeAnswerTextScrollMultiplier(
  mood: "happy" | "groggy" | "angry",
  intensity: number,
  moodMultiplier = 1,
): number {
  if (mood === "groggy") {
    return moodMultiplier;
  }

  return moodMultiplier * computeIntensityScrollFactor(intensity);
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
): number {
  return Math.max(0, elapsedSeconds * scrollSpeed);
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
  const scrollOffset = computeWaveTextScrollOffset(
    options.scrollElapsedSeconds ?? 0,
    scrollSpeed,
  );

  const points = buildWavePathSamples(options.width, options.sampleY, 2);
  const pathLength = points[points.length - 1]?.arcLength ?? options.width;
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
