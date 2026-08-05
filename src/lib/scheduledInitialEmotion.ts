import type { EmotionName, EmotionState } from "../models/emotion";
import type { EmotionState as UiEmotionState, Mood } from "../types/emotion";

export type ScheduledMoodLabel = "happy" | "groggy" | "angry";

export type InitialEmotionOptions = {
  date?: Date;
  random?: () => number;
};

const SCHEDULE_DAY_START_MINUTES = 6 * 60;

const SCHEDULE_ENTRIES: ReadonlyArray<[string, ScheduledMoodLabel]> = [
  ["06:00", "groggy"],
  ["06:20", "angry"],
  ["06:40", "groggy"],
  ["07:00", "happy"],
  ["07:20", "groggy"],
  ["07:40", "angry"],
  ["08:00", "angry"],
  ["08:20", "happy"],
  ["08:40", "angry"],
  ["09:00", "groggy"],
  ["09:20", "angry"],
  ["09:40", "happy"],
  ["10:00", "happy"],
  ["10:20", "angry"],
  ["10:40", "happy"],
  ["11:00", "groggy"],
  ["11:20", "happy"],
  ["11:40", "angry"],
  ["12:00", "happy"],
  ["12:20", "happy"],
  ["12:40", "groggy"],
  ["13:00", "groggy"],
  ["13:20", "angry"],
  ["13:40", "happy"],
  ["14:00", "angry"],
  ["14:20", "groggy"],
  ["14:40", "angry"],
  ["15:00", "happy"],
  ["15:20", "angry"],
  ["15:40", "groggy"],
  ["16:00", "happy"],
  ["16:20", "angry"],
  ["16:40", "groggy"],
  ["17:00", "happy"],
  ["17:20", "happy"],
  ["17:40", "angry"],
  ["18:00", "happy"],
  ["18:20", "happy"],
  ["18:40", "groggy"],
  ["19:00", "happy"],
  ["19:20", "angry"],
  ["19:40", "happy"],
  ["20:00", "groggy"],
  ["20:20", "happy"],
  ["20:40", "angry"],
  ["21:00", "happy"],
  ["21:20", "groggy"],
  ["21:40", "angry"],
  ["22:00", "happy"],
  ["22:20", "groggy"],
  ["22:40", "angry"],
  ["23:00", "happy"],
  ["23:20", "angry"],
  ["23:40", "groggy"],
  ["00:00", "groggy"],
];

const EMOTION_SCHEDULE: Readonly<Record<number, ScheduledMoodLabel>> =
  Object.fromEntries(
    SCHEDULE_ENTRIES.map(([time, mood]) => [parseClockToMinutes(time), mood]),
  );

const BASE_INTENSITY: Readonly<Record<ScheduledMoodLabel, number>> = {
  groggy: 35,
  happy: 55,
  angry: 50,
};

const DEFAULT_VOLATILITY = 0.7;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseClockToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function floorToScheduleSlotMinutes(date: Date): number {
  const hours = date.getHours();
  const flooredMinutes = Math.floor(date.getMinutes() / 20) * 20;
  return hours * 60 + flooredMinutes;
}

/** Maps a local clock time to the scheduled mood label (20-minute slots). */
export function resolveScheduledMood(date: Date = new Date()): ScheduledMoodLabel {
  const totalMinutes = date.getHours() * 60 + date.getMinutes();

  if (totalMinutes < SCHEDULE_DAY_START_MINUTES) {
    return EMOTION_SCHEDULE[0] ?? "groggy";
  }

  const slotMinutes = floorToScheduleSlotMinutes(date);
  return EMOTION_SCHEDULE[slotMinutes] ?? "groggy";
}

function mapScheduledMoodToBackend(mood: ScheduledMoodLabel): EmotionName {
  if (mood === "happy") {
    return "happy";
  }

  if (mood === "angry") {
    return "angry";
  }

  return "sad";
}

function mapScheduledMoodToUi(mood: ScheduledMoodLabel): Mood {
  return mood;
}

function applyIntensityJitter(
  intensity: number,
  volatility: number,
  random: () => number,
): number {
  const jitter = (random() - 0.5) * 2 * volatility * 14;
  return clamp(intensity + jitter, 0, 100);
}

function buildBaseBackendState(
  scheduledMood: ScheduledMoodLabel,
): EmotionState {
  const backendMood = mapScheduledMoodToBackend(scheduledMood);

  return {
    mood: backendMood,
    intensity: BASE_INTENSITY[scheduledMood],
    moodStreak: 1,
    angerMomentum: scheduledMood === "angry" ? 18 : 0,
    resentment: 0,
    trust: 50,
    volatility: DEFAULT_VOLATILITY,
    spontaneousAngerCooldown: 0,
    lastTrigger: null,
  };
}

/** Backend session start state from the daily schedule, with optional intensity jitter. */
export function buildInitialBackendEmotionState(
  options: InitialEmotionOptions = {},
): EmotionState {
  const scheduledMood = resolveScheduledMood(options.date);
  const state = buildBaseBackendState(scheduledMood);

  if (!options.random) {
    return state;
  }

  return {
    ...state,
    intensity: applyIntensityJitter(
      state.intensity,
      state.volatility,
      options.random,
    ),
  };
}

/** UI page-load state from the daily schedule, with optional intensity jitter. */
export function buildInitialUiEmotionState(
  options: InitialEmotionOptions = {},
): UiEmotionState {
  const scheduledMood = resolveScheduledMood(options.date);
  const mood = mapScheduledMoodToUi(scheduledMood);
  let intensity = BASE_INTENSITY[scheduledMood];

  if (options.random) {
    intensity = applyIntensityJitter(intensity, DEFAULT_VOLATILITY, options.random);
  }

  return { mood, intensity };
}
