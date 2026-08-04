/** EDM-style four-on-the-floor rhythm for happy mood — ramps with intensity. */

export const HAPPY_EDM_BEAT = {
  /** BPM at low vs peak happy intensity (classic build → festival tempo). */
  bpmAtZero: 108,
  bpmAtFull: 152,
  curvePower: 2.6,
  /** Sidechain duck depth on kick (0–1 of amplitude). */
  sidechainDepthAtZero: 0,
  sidechainDepthAtFull: 0.42,
  /** Kick transient length as a fraction of one quarter-note beat. */
  kickDuration: 0.1,
  /** Exponential swell after kick release. */
  releaseExponent: 3.2,
  /** Scroll surge on each kick (fraction above nominal speed). */
  scrollKickSurgeAtFull: 0.72,
  /** Extra scroll accent on 8th-note off-beats (hi-hat feel). */
  scrollOffbeatSurgeAtFull: 0.28,
  /** 16th-note shimmer on scroll at very high intensity. */
  scrollSixteenthSurgeAtFull: 0.14,
  hihatStartIntensity: 28,
  sixteenthStartIntensity: 72,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function computeHappyEdmIntensityT(intensity: number): number {
  const normalized = clamp(intensity, 0, 100) / 100;
  return normalized ** HAPPY_EDM_BEAT.curvePower;
}

export function computeHappyEdmBpm(intensity: number): number {
  const t = computeHappyEdmIntensityT(intensity);
  return lerp(HAPPY_EDM_BEAT.bpmAtZero, HAPPY_EDM_BEAT.bpmAtFull, t);
}

export function computeHappyEdmBeatPhase(
  elapsedSeconds: number,
  intensity: number,
): number {
  const bpm = computeHappyEdmBpm(intensity);
  const beatsPerSecond = bpm / 60;
  const beatIndex = elapsedSeconds * beatsPerSecond;
  return beatIndex - Math.floor(beatIndex);
}

/** Sharp kick pulse peaking at beat phase 0 (four-on-the-floor). */
export function computeHappyEdmKickPulse(beatPhase: number): number {
  const wrapped =
    beatPhase < 0.08 ? beatPhase : beatPhase > 0.92 ? 1 - beatPhase : beatPhase;
  return Math.exp(-wrapped * 22);
}

/** Sidechain pump: duck on kick, swell into the next beat. */
export function computeHappyEdmSidechainEnvelope(
  beatPhase: number,
  intensity: number,
): number {
  const t = computeHappyEdmIntensityT(intensity);
  const depth = lerp(
    HAPPY_EDM_BEAT.sidechainDepthAtZero,
    HAPPY_EDM_BEAT.sidechainDepthAtFull,
    t,
  );

  if (depth <= 0.001) {
    return 1;
  }

  const kickEnd = HAPPY_EDM_BEAT.kickDuration;

  if (beatPhase < kickEnd) {
    const kickT = beatPhase / kickEnd;
    return 1 - depth * (1 - kickT * 0.08);
  }

  const releaseT = (beatPhase - kickEnd) / (1 - kickEnd);
  const swell = 1 - Math.exp(-releaseT * HAPPY_EDM_BEAT.releaseExponent);
  return 1 - depth + depth * swell;
}

/** 8th-note off-beat accent (hi-hat on the "and"). */
export function computeHappyEdmOffbeatPulse(beatPhase: number, intensity: number): number {
  if (intensity < HAPPY_EDM_BEAT.hihatStartIntensity) {
    return 0;
  }

  const hihatT = clamp(
    (intensity - HAPPY_EDM_BEAT.hihatStartIntensity) /
      (100 - HAPPY_EDM_BEAT.hihatStartIntensity),
    0,
    1,
  );
  const eighthPhase = (beatPhase * 2) % 1;
  const offbeat =
    eighthPhase > 0.42 && eighthPhase < 0.58
      ? Math.exp(-Math.abs(eighthPhase - 0.5) * 38)
      : 0;

  return offbeat * hihatT;
}

/** 16th-note shimmer for high-intensity EDM sections. */
export function computeHappyEdmSixteenthPulse(
  beatPhase: number,
  intensity: number,
): number {
  if (intensity < HAPPY_EDM_BEAT.sixteenthStartIntensity) {
    return 0;
  }

  const shimmerT = clamp(
    (intensity - HAPPY_EDM_BEAT.sixteenthStartIntensity) /
      (100 - HAPPY_EDM_BEAT.sixteenthStartIntensity),
    0,
    1,
  );
  const sixteenthPhase = (beatPhase * 4) % 1;
  const nearGrid =
    sixteenthPhase < 0.12 || sixteenthPhase > 0.88
      ? Math.exp(-Math.min(sixteenthPhase, 1 - sixteenthPhase) * 28)
      : 0;

  return nearGrid * shimmerT * 0.55;
}

/** Instant scroll speed factor (1 = nominal) with kick + off-beat drive. */
export function computeHappyEdmScrollFactor(
  elapsedSeconds: number,
  intensity: number,
): number {
  const t = computeHappyEdmIntensityT(intensity);
  if (t <= 0.001) {
    return 1;
  }

  const beatPhase = computeHappyEdmBeatPhase(elapsedSeconds, intensity);
  const kick = computeHappyEdmKickPulse(beatPhase);
  const offbeat = computeHappyEdmOffbeatPulse(beatPhase, intensity);
  const sixteenth = computeHappyEdmSixteenthPulse(beatPhase, intensity);

  const kickSurge = HAPPY_EDM_BEAT.scrollKickSurgeAtFull * t;
  const offbeatSurge = HAPPY_EDM_BEAT.scrollOffbeatSurgeAtFull * t;
  const sixteenthSurge = HAPPY_EDM_BEAT.scrollSixteenthSurgeAtFull * t;

  const drive =
    1 +
    kick * kickSurge +
    offbeat * offbeatSurge +
    sixteenth * sixteenthSurge;

  return Math.max(0.45, drive);
}

/** Amplitude multiplier synced to sidechain (wave breathes with the kick). */
export function computeHappyEdmAmplitudeFactor(
  elapsedSeconds: number,
  intensity: number,
): number {
  const t = computeHappyEdmIntensityT(intensity);
  if (t <= 0.001) {
    return 1;
  }

  const beatPhase = computeHappyEdmBeatPhase(elapsedSeconds, intensity);
  const sidechain = computeHappyEdmSidechainEnvelope(beatPhase, intensity);
  const kick = computeHappyEdmKickPulse(beatPhase);
  const offbeat = computeHappyEdmOffbeatPulse(beatPhase, intensity);

  const swell = sidechain;
  const accent = 1 + kick * 0.12 * t + offbeat * 0.06 * t;

  return Math.max(0.45, swell * accent);
}

const EDM_SCROLL_INTEGRATION_HZ = 240;

/** Integrates beat-modulated scroll speed over elapsed time. */
export function integrateHappyEdmScrollDistance(
  elapsedSeconds: number,
  baseScrollSpeed: number,
  intensity: number,
): number {
  if (elapsedSeconds <= 0) {
    return 0;
  }

  const steps = Math.max(
    1,
    Math.ceil(elapsedSeconds * EDM_SCROLL_INTEGRATION_HZ),
  );
  const dt = elapsedSeconds / steps;
  let distance = 0;

  for (let step = 1; step <= steps; step += 1) {
    const t = step * dt;
    distance +=
      baseScrollSpeed * computeHappyEdmScrollFactor(t, intensity) * dt;
  }

  return distance;
}
