/** Angry rap scroll — roller-coaster drops with sudden acceleration (readable, no flicker). */

export const ANGRY_HIPHOP_BEAT = {
  bpmAtZero: 88,
  bpmAtFull: 172,
  curvePower: 2.7,
  /** Slow crawl at the crest — low enough for a sharp downhill contrast. */
  crestSpeedMin: 0.52,
  crestSpeedMax: 0.72,
  crestPhaseEnd: 0.13,
  /** Longer drop window — acceleration sustains across more of the bar. */
  dropPhaseEnd: 0.66,
  /** Lower = gradual ramp; speed builds over the full drop instead of snapping at the end. */
  dropCurvePower: 2.6,
  dropPeakAtFull: 7.8,
  runoutDecayAtFull: 0.55,
  kickDropBoostAtFull: 1.5,
  snareDropBoostAtFull: 1.05,
  tripletDropBoostAtFull: 0.7,
  /** Velocity ramps up over a longer window on drops. */
  accelRateAtFull: 46,
  decelRateAtFull: 2.4,
  accelGapBoost: 2.0,
  maxScrollFactor: 9.5,
  tripletStartIntensity: 38,
  doubleTimeStartIntensity: 62,
  doubleTimeDropBoostAtFull: 1.4,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function computeAngryHipHopIntensityT(intensity: number): number {
  const normalized = clamp(intensity, 0, 100) / 100;
  return normalized ** ANGRY_HIPHOP_BEAT.curvePower;
}

export function computeAngryHipHopBpm(intensity: number): number {
  const t = computeAngryHipHopIntensityT(intensity);
  return lerp(ANGRY_HIPHOP_BEAT.bpmAtZero, ANGRY_HIPHOP_BEAT.bpmAtFull, t);
}

export function computeAngryHipHopBeatPhase(
  elapsedSeconds: number,
  intensity: number,
): number {
  const bpm = computeAngryHipHopBpm(intensity);
  const beatsPerSecond = bpm / 60;
  const beatIndex = elapsedSeconds * beatsPerSecond;
  const wholeBeat = Math.floor(beatIndex + 1e-9);
  return beatIndex - wholeBeat;
}

export function computeAngryHipHopBarPhase(
  elapsedSeconds: number,
  intensity: number,
): number {
  const bpm = computeAngryHipHopBpm(intensity);
  const barsPerSecond = bpm / 60 / 4;
  const barIndex = elapsedSeconds * barsPerSecond;
  return barIndex - Math.floor(barIndex);
}

function pulseNear(phase: number, center: number, sharpness: number): number {
  const delta = Math.abs(phase - center);
  const wrapped = Math.min(delta, 1 - delta);
  return Math.exp(-wrapped * sharpness);
}

/** Kick on beat one (boom). */
export function computeAngryHipHopKickPulse(beatPhase: number): number {
  const lead =
    beatPhase < 0.07 ? beatPhase : beatPhase > 0.93 ? 1 - beatPhase : beatPhase;
  return Math.exp(-lead * 20);
}

/** Snare on beats 2 and 4 (backbeat). */
export function computeAngryHipHopSnarePulse(
  elapsedSeconds: number,
  intensity: number,
): number {
  const bpm = computeAngryHipHopBpm(intensity);
  const beatDuration = 60 / bpm;
  const beatInBar = Math.floor(elapsedSeconds / beatDuration) % 4;
  const beatPhase = computeAngryHipHopBeatPhase(elapsedSeconds, intensity);

  if (beatInBar !== 1 && beatInBar !== 3) {
    return 0;
  }

  return pulseNear(beatPhase, 0, 18) * 0.95 + pulseNear(beatPhase, 0, 9) * 0.05;
}

/** Triplet hi-hat roll — classic fast rap subdivision. */
export function computeAngryHipHopTripletPulse(
  beatPhase: number,
  intensity: number,
): number {
  if (intensity < ANGRY_HIPHOP_BEAT.tripletStartIntensity) {
    return 0;
  }

  const tripletT = clamp(
    (intensity - ANGRY_HIPHOP_BEAT.tripletStartIntensity) /
      (100 - ANGRY_HIPHOP_BEAT.tripletStartIntensity),
    0,
    1,
  );
  const tripletPhase = (beatPhase * 3) % 1;
  const hit =
    tripletPhase < 0.14 || tripletPhase > 0.86
      ? Math.exp(-Math.min(tripletPhase, 1 - tripletPhase) * 24)
      : 0;

  return hit * tripletT;
}

/** Alternating double-time bars — extra drop on even bars. */
export function computeAngryHipHopDoubleTimeBoost(
  elapsedSeconds: number,
  intensity: number,
): number {
  if (intensity < ANGRY_HIPHOP_BEAT.doubleTimeStartIntensity) {
    return 0;
  }

  const t = clamp(
    (intensity - ANGRY_HIPHOP_BEAT.doubleTimeStartIntensity) /
      (100 - ANGRY_HIPHOP_BEAT.doubleTimeStartIntensity),
    0,
    1,
  );
  const barPhase = computeAngryHipHopBarPhase(elapsedSeconds, intensity);
  const barIndex = Math.floor(
    elapsedSeconds * (computeAngryHipHopBpm(intensity) / 60 / 4),
  );
  const isDoubleBar = barIndex % 2 === 0;
  const dropT = clamp(
    (barPhase - ANGRY_HIPHOP_BEAT.crestPhaseEnd) /
      (ANGRY_HIPHOP_BEAT.dropPhaseEnd - ANGRY_HIPHOP_BEAT.crestPhaseEnd),
    0,
    1,
  );
  const dropAccent = dropT ** 2;

  return (isDoubleBar ? 1 : 0.32) * dropAccent * t;
}

/** Coaster profile within a bar: crest → plunge → runout. */
export function computeAngryHipHopCoasterTarget(
  barPhase: number,
  intensity: number,
): number {
  const t = computeAngryHipHopIntensityT(intensity);
  const {
    crestSpeedMin,
    crestSpeedMax,
    crestPhaseEnd,
    dropPhaseEnd,
    dropCurvePower,
    dropPeakAtFull,
    runoutDecayAtFull,
  } = ANGRY_HIPHOP_BEAT;

  const crestSpeed = lerp(crestSpeedMin, crestSpeedMax, t);
  const peakSpeed = 1 + dropPeakAtFull * t;

  if (barPhase < crestPhaseEnd) {
    const crestT = barPhase / crestPhaseEnd;
    return lerp(crestSpeed * 0.92, crestSpeed, crestT ** 1.6);
  }

  if (barPhase < dropPhaseEnd) {
    const dropT =
      (barPhase - crestPhaseEnd) / (dropPhaseEnd - crestPhaseEnd);
    const plunge = dropT ** dropCurvePower;
    return crestSpeed + (peakSpeed - crestSpeed) * plunge;
  }

  const runT = (barPhase - dropPhaseEnd) / (1 - dropPhaseEnd);
  const runoutFloor = peakSpeed - runoutDecayAtFull * t;
  /** Hold peak briefly after the long drop, then ease back toward crest. */
  if (runT < 0.28) {
    return peakSpeed;
  }
  const decayT = (runT - 0.28) / 0.72;
  return lerp(peakSpeed, Math.max(crestSpeed, runoutFloor), decayT * 0.62);
}

/**
 * Target scroll factor — bar coaster + beat-triggered drop boosts.
 * Actual motion uses velocity integration for sudden but smooth acceleration.
 */
export function computeAngryHipHopScrollFactor(
  elapsedSeconds: number,
  intensity: number,
): number {
  const t = computeAngryHipHopIntensityT(intensity);
  if (t <= 0.001) {
    return 1;
  }

  const beatPhase = computeAngryHipHopBeatPhase(elapsedSeconds, intensity);
  const barPhase = computeAngryHipHopBarPhase(elapsedSeconds, intensity);
  const kick = computeAngryHipHopKickPulse(beatPhase);
  const snare = computeAngryHipHopSnarePulse(elapsedSeconds, intensity);
  const triplet = computeAngryHipHopTripletPulse(beatPhase, intensity);
  const doubleTime = computeAngryHipHopDoubleTimeBoost(elapsedSeconds, intensity);

  let target = computeAngryHipHopCoasterTarget(barPhase, intensity);

  const kickBoost = kick * ANGRY_HIPHOP_BEAT.kickDropBoostAtFull * t;
  const snareBoost = snare * ANGRY_HIPHOP_BEAT.snareDropBoostAtFull * t;
  const tripletBoost = triplet * ANGRY_HIPHOP_BEAT.tripletDropBoostAtFull * t;
  const doubleBoost = doubleTime * ANGRY_HIPHOP_BEAT.doubleTimeDropBoostAtFull * t;

  target += kickBoost + snareBoost + tripletBoost + doubleBoost;

  return clamp(
    target,
    ANGRY_HIPHOP_BEAT.crestSpeedMin * 0.94,
    ANGRY_HIPHOP_BEAT.maxScrollFactor,
  );
}

/** Wave amplitude stays stable during angry text scroll. */
export function computeAngryHipHopAmplitudeFactor(
  _elapsedSeconds: number,
  _intensity: number,
): number {
  return 1;
}

const HIPHOP_SCROLL_INTEGRATION_HZ = 240;

export type AngryScrollMotionState = {
  distance: number;
  velocity: number;
};

/** Integrates with asymmetric accel — snaps down the drop, crawls back to crest. */
export function integrateAngryHipHopScrollMotion(
  elapsedSeconds: number,
  baseScrollSpeed: number,
  intensity: number,
): AngryScrollMotionState {
  if (elapsedSeconds <= 0) {
    return { distance: 0, velocity: 1 };
  }

  const t = computeAngryHipHopIntensityT(intensity);
  const accelRate = ANGRY_HIPHOP_BEAT.accelRateAtFull * t;
  const decelRate = ANGRY_HIPHOP_BEAT.decelRateAtFull * t;
  const steps = Math.max(
    1,
    Math.ceil(elapsedSeconds * HIPHOP_SCROLL_INTEGRATION_HZ),
  );
  const dt = elapsedSeconds / steps;
  let distance = 0;
  let velocity = 1;

  for (let step = 1; step <= steps; step += 1) {
    const time = step * dt;
    const target = computeAngryHipHopScrollFactor(time, intensity);
    const gap = target - velocity;
    const rate =
      gap > 0
        ? accelRate * (1 + Math.max(0, gap) * ANGRY_HIPHOP_BEAT.accelGapBoost)
        : decelRate;
    const blend = 1 - Math.exp(-rate * dt);
    velocity += gap * blend;
    velocity = clamp(
      velocity,
      ANGRY_HIPHOP_BEAT.crestSpeedMin * 0.9,
      ANGRY_HIPHOP_BEAT.maxScrollFactor,
    );
    distance += baseScrollSpeed * velocity * dt;
  }

  return { distance, velocity };
}

export function integrateAngryHipHopScrollDistance(
  elapsedSeconds: number,
  baseScrollSpeed: number,
  intensity: number,
): number {
  return integrateAngryHipHopScrollMotion(
    elapsedSeconds,
    baseScrollSpeed,
    intensity,
  ).distance;
}

export function computeAngryHipHopScrollVelocityAt(
  elapsedSeconds: number,
  intensity: number,
): number {
  return integrateAngryHipHopScrollMotion(elapsedSeconds, 1, intensity).velocity;
}

/** @deprecated Used by older tests — alias for flow accent layers removed from scroll. */
export function computeAngryHipHopFlowSwing(
  elapsedSeconds: number,
  intensity: number,
): number {
  const beatPhase = computeAngryHipHopBeatPhase(elapsedSeconds, intensity);
  const barPhase = computeAngryHipHopBarPhase(elapsedSeconds, intensity);
  return (
    computeAngryHipHopCoasterTarget(barPhase, intensity) -
    computeAngryHipHopScrollFactor(elapsedSeconds, intensity) +
    computeAngryHipHopKickPulse(beatPhase) * 0.1
  );
}
