import type { EmotionName, EmotionState } from "../models/emotion.ts";
import type { EmotionAnalysis } from "./emotionAnalyzer.ts";

export type EmotionSignal = EmotionAnalysis;

export type EmotionEngineOptions = {
  /** 0–1 random source; enables spontaneous anger and optional jitter. */
  random?: () => number;
};

export const SPONTANEOUS_ANGER_BASE_RATE = 0.2;
export const SPONTANEOUS_ANGER_REFERENCE_VOLATILITY = 0.7;
export const SPONTANEOUS_ANGER_INTENSITY_MIN = 35;
export const SPONTANEOUS_ANGER_INTENSITY_MAX = 70;
export const SPONTANEOUS_ANGER_COOLDOWN_MIN = 5;
export const SPONTANEOUS_ANGER_COOLDOWN_MAX = 10;
/** Intensity added each turn the same mood persists (after the first turn). */
export const MOOD_SUSTAIN_INTENSITY_GAIN = 4;

const BASELINE = {
  mood: "sad" as EmotionName,
  intensity: 25,
  trust: 50,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampEmotionState(state: EmotionState): EmotionState {
  return {
    ...state,
    intensity: clamp(state.intensity, 0, 100),
    moodStreak: Math.max(1, Math.round(state.moodStreak)),
    angerMomentum: clamp(state.angerMomentum, 0, 100),
    resentment: clamp(state.resentment, 0, 100),
    trust: clamp(state.trust, 0, 100),
    volatility: clamp(state.volatility, 0, 1),
    spontaneousAngerCooldown: Math.max(0, state.spontaneousAngerCooldown),
  };
}

function randomRange(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/** Higher momentum → slower anger decay (0 = fast, 1 = almost none). */
function angerDecayScale(momentum: number): number {
  return 1 - clamp(momentum, 0, 100) / 100;
}

function lerp(current: number, target: number, rate: number): number {
  return current + (target - current) * rate;
}

export function computeSpontaneousAngerProbability(volatility: number): number {
  const scaled =
    SPONTANEOUS_ANGER_BASE_RATE *
    (clamp(volatility, 0, 1) / SPONTANEOUS_ANGER_REFERENCE_VOLATILITY);

  return clamp(scaled, 0, 0.2);
}

function computeHappinessGain(signal: EmotionSignal): number {
  return (
    signal.praise * 55 +
    signal.friendliness * 28 +
    signal.affection * 40 +
    Math.max(0, signal.sentiment) * 18
  );
}

function computeAngerGain(signal: EmotionSignal): number {
  const criticismAnger = signal.criticism * 40;
  const attackAnger = signal.personalAttack * 95;
  return criticismAnger + attackAnger;
}

function resolveMood(
  state: EmotionState,
  signal: EmotionSignal,
  angerMomentum: number,
  resentment: number,
  happinessGain: number,
): EmotionName {
  if (signal.personalAttack > 0.75) {
    return "angry";
  }

  const angerPressure =
    angerMomentum + resentment * 0.45 + computeAngerGain(signal);

  if (angerPressure >= 20) {
    return "angry";
  }

  if (happinessGain >= 10 && angerPressure < 35) {
    return "happy";
  }

  if (
    state.mood === "happy" &&
    happinessGain >= 5 &&
    angerPressure < 40
  ) {
    return "happy";
  }

  if (signal.sentiment < -0.08 && angerPressure < 45) {
    return "sad";
  }

  if (signal.trigger === "neutral") {
    if (angerPressure >= 8) {
      return "angry";
    }
    return "sad";
  }

  if (signal.criticism > 0.3 && signal.personalAttack < 0.25) {
    return state.mood === "happy" ? "sad" : state.mood;
  }

  if (angerPressure < 20) {
    return "sad";
  }

  return state.mood;
}

export function computeMoodSustainIntensityGain(moodStreak: number): number {
  if (moodStreak <= 1) {
    return 0;
  }

  return MOOD_SUSTAIN_INTENSITY_GAIN;
}

function applyMoodPersistence(
  previous: EmotionState,
  nextMood: EmotionName,
  intensity: number,
): { moodStreak: number; intensity: number } {
  const moodStreak =
    nextMood === previous.mood ? previous.moodStreak + 1 : 1;

  return {
    moodStreak,
    intensity: intensity + computeMoodSustainIntensityGain(moodStreak),
  };
}

/**
 * Pure, deterministic emotion transition. Same inputs always yield same outputs.
 */
export function updateEmotionDeterministic(
  state: EmotionState,
  signal: EmotionSignal,
): EmotionState {
  let mood = state.mood;
  let intensity = state.intensity;
  let angerMomentum = state.angerMomentum;
  let resentment = state.resentment;
  let trust = state.trust;
  const spontaneousAngerCooldown = state.spontaneousAngerCooldown;
  const volatility = state.volatility;

  const angerGain = computeAngerGain(signal);
  const happinessGain = computeHappinessGain(signal);

  // 1–2. Criticism and personal attacks raise anger momentum.
  angerMomentum += angerGain;

  // 7. Resentment remembers interpersonal harm across turns.
  resentment +=
    signal.personalAttack * 50 +
    signal.criticism * 10 +
    (signal.trigger === "attack" || signal.trigger === "insult" ? 18 : 0);

  // 4. Praise and warmth increase happiness intensity.
  if (happinessGain > 0) {
    intensity += happinessGain * 1.25;
    trust += signal.praise * 10 + signal.affection * 8 + signal.friendliness * 4;
  }

  // 1–3. Active anger from criticism / attacks.
  if (angerGain > 0) {
    intensity += angerGain * 1.3;
    trust -= signal.criticism * 8 + signal.personalAttack * 22;
  }

  // 3. Severe personal attack floor.
  if (signal.personalAttack > 0.75) {
    mood = "angry";
    intensity = Math.max(intensity, 95);
    angerMomentum = Math.max(angerMomentum, 90);
    resentment = Math.max(resentment, 70);
  }

  // 5. Apology eases anger and resentment, but never snaps to neutral/happy.
  if (signal.apology > 0) {
    angerMomentum -= signal.apology * 16;
    resentment -= signal.apology * 22;
    trust += signal.apology * 10;
  }

  // User asks the character to calm down — lower intensity and anger pressure.
  if (signal.deescalation > 0) {
    intensity -= signal.deescalation * 42;
    angerMomentum -= signal.deescalation * 24;
    resentment -= signal.deescalation * 18;
    trust += signal.deescalation * 6 + signal.friendliness * 4;
  }

  // 8. Neutral input slowly returns toward baseline.
  if (signal.trigger === "neutral") {
    const decay = 0.05 * angerDecayScale(angerMomentum);
    intensity = lerp(intensity, BASELINE.intensity, decay);
    trust = lerp(trust, BASELINE.trust, decay * 0.5);
    resentment = lerp(resentment, 0, 0.03);
  }

  // 6–7. High momentum / resentment slow anger decay and keep past hurt alive.
  const decayScale = angerDecayScale(angerMomentum);
  const passiveAnger =
    signal.personalAttack < 0.08 &&
    signal.criticism < 0.2 &&
    signal.trigger === "neutral";

  if (passiveAnger) {
    angerMomentum = lerp(angerMomentum, 0, 0.08 * decayScale);

    if (mood === "angry") {
      intensity = lerp(intensity, BASELINE.intensity, 0.04 * decayScale);
    }
  }

  if (resentment > 12) {
    const resentmentPull = resentment * 0.35;
    intensity = Math.max(intensity, resentmentPull);
    angerMomentum = Math.max(angerMomentum, resentment * 0.55);
  }

  mood = resolveMood(state, signal, angerMomentum, resentment, happinessGain);

  const deescalated = signal.deescalation >= 0.25;

  if (mood === "angry" && intensity < 45 && !deescalated) {
    intensity = 45;
  }

  if (mood === "happy" && intensity < BASELINE.intensity + 20 && !deescalated) {
    intensity = BASELINE.intensity + 20;
  }

  if (mood === "sad" && intensity < BASELINE.intensity + 15 && !deescalated) {
    intensity = BASELINE.intensity + 15;
  }

  const persistence = applyMoodPersistence(
    signal.deescalation >= 0.35 && signal.trigger === "deescalation"
      ? { ...state, moodStreak: 0 }
      : state,
    mood,
    intensity,
  );

  return clampEmotionState({
    mood,
    intensity: persistence.intensity,
    moodStreak: persistence.moodStreak,
    angerMomentum,
    resentment,
    trust,
    volatility,
    spontaneousAngerCooldown,
    lastTrigger: signal.trigger,
  });
}

/**
 * Rolls for spontaneous anger using an injected random source.
 * Cooldown ticks down by 1 each turn; no roll while cooldown > 0.
 */
export function applySpontaneousAnger(
  state: EmotionState,
  random: () => number,
): EmotionState {
  if (state.spontaneousAngerCooldown > 0) {
    return clampEmotionState({
      ...state,
      spontaneousAngerCooldown: state.spontaneousAngerCooldown - 1,
    });
  }

  const probability = computeSpontaneousAngerProbability(state.volatility);
  if (random() >= probability) {
    return state;
  }

  const angerBoost = randomRange(
    random,
    SPONTANEOUS_ANGER_INTENSITY_MIN,
    SPONTANEOUS_ANGER_INTENSITY_MAX,
  );
  const momentumBoost = angerBoost * 0.65;
  const cooldown = Math.round(
    randomRange(
      random,
      SPONTANEOUS_ANGER_COOLDOWN_MIN,
      SPONTANEOUS_ANGER_COOLDOWN_MAX,
    ),
  );

  return clampEmotionState({
    ...state,
    mood: "angry",
    moodStreak: state.mood === "angry" ? state.moodStreak : 1,
    intensity: state.intensity + angerBoost,
    angerMomentum: state.angerMomentum + momentumBoost,
    spontaneousAngerCooldown: cooldown,
    lastTrigger: "spontaneous_anger",
  });
}

/**
 * Optional volatility-based jitter. Kept separate so core logic stays testable.
 */
export function applyRandomEmotionVariation(
  state: EmotionState,
  random: () => number,
): EmotionState {
  const jitter = (random() - 0.5) * 2 * state.volatility * 14;

  return clampEmotionState({
    ...state,
    intensity: state.intensity + jitter,
    angerMomentum: state.angerMomentum + jitter * 0.4,
  });
}

export function updateEmotion(
  state: EmotionState,
  signal: EmotionSignal,
  options: EmotionEngineOptions = {},
): EmotionState {
  let next = updateEmotionDeterministic(state, signal);

  if (options.random) {
    next = applySpontaneousAnger(next, options.random);
    next = applyRandomEmotionVariation(next, options.random);
  }

  return next;
}
