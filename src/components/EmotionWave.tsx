import { useEffect, useRef } from "react";

import { getMoodVisualConfig, getWaveAnswerTextStyle } from "../config/emotionVisualConfig.ts";
import { useEmotionAnimation } from "../hooks/useEmotionAnimation.ts";
import type { EmotionAnimationParams } from "../hooks/useEmotionAnimation.ts";
import {
  computeAnswerTextScrollMultiplier,
  computeGroggyLetterSpacing,
  drawTextAlongWave,
  WAVE_ANSWER_FONT,
} from "../lib/wavePathText.ts";
import type { EmotionState, Mood } from "../types/emotion.ts";

type EmotionWaveProps = {
  emotion: EmotionState;
  answerText?: string | null;
  answerScrollKey?: string | null;
};

type WaveRenderParams = Pick<
  EmotionAnimationParams,
  "amplitude" | "speed" | "frequency" | "irregularity" | "jitter"
>;

export type WaveSampleContext = WaveRenderParams & {
  mood: Mood;
  intensity: number;
};

export type WaveAnimationState = Pick<
  EmotionAnimationParams,
  "amplitude" | "speed" | "frequency" | "irregularity" | "jitter"
> & {
  intensity: number;
};

/** Per-frame lerp factors for wave motion parameters. */
export const WAVE_PARAM_LERP_EASING = {
  amplitude: 0.09,
  speed: 0.08,
  frequency: 0.08,
  irregularity: 0.08,
  jitter: 0.08,
  intensity: 0.08,
} as const;

export const ANGER_JITTER_BANDS = {
  lowMax: 30,
  midMax: 70,
  lowPeak: 0.06,
  midPeak: 0.42,
  highPeak: 1,
} as const;

/** Horizontal drift (px per second at speed=1) so the line visibly flows across the lane. */
export const WAVE_FLOW_SPEED = 30;

/** Text-path wave height: ramps to ~2× the legacy max amplitude at intensity 100. */
export const WAVE_AMPLITUDE_INTENSITY = {
  minHeightRatio: 0.008,
  legacyMaxHeightRatio: 0.34,
  maxHeightRatioCap: 0.68,
  curvePower: 3.6,
} as const;

const DEFAULT_ANIMATION_STATE: WaveAnimationState = {
  amplitude: 6.5,
  speed: 0.08,
  frequency: 0.62,
  irregularity: 0.02,
  jitter: 0.01,
  intensity: 10,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function lerpAnimationValue(
  current: number,
  target: number,
  easing: number,
): number {
  return current + (target - current) * easing;
}

/** Frame-rate aware lerp: current += (target - current) * easing */
export function lerpAnimationValueTimed(
  current: number,
  target: number,
  easing: number,
  deltaSeconds: number,
): number {
  const frameEasing = 1 - (1 - easing) ** (deltaSeconds * 60);
  return lerpAnimationValue(current, target, frameEasing);
}

export function lerpWaveAnimationState(
  current: WaveAnimationState,
  target: WaveAnimationState,
  deltaSeconds: number,
  easing: typeof WAVE_PARAM_LERP_EASING = WAVE_PARAM_LERP_EASING,
): WaveAnimationState {
  return {
    amplitude: lerpAnimationValueTimed(
      current.amplitude,
      target.amplitude,
      easing.amplitude,
      deltaSeconds,
    ),
    speed: lerpAnimationValueTimed(
      current.speed,
      target.speed,
      easing.speed,
      deltaSeconds,
    ),
    frequency: lerpAnimationValueTimed(
      current.frequency,
      target.frequency,
      easing.frequency,
      deltaSeconds,
    ),
    irregularity: lerpAnimationValueTimed(
      current.irregularity,
      target.irregularity,
      easing.irregularity,
      deltaSeconds,
    ),
    jitter: lerpAnimationValueTimed(
      current.jitter,
      target.jitter,
      easing.jitter,
      deltaSeconds,
    ),
    intensity: lerpAnimationValueTimed(
      current.intensity,
      target.intensity,
      easing.intensity,
      deltaSeconds,
    ),
  };
}

/** Angry-only tremor strength from intensity bands (0–1). */
export function computeAngerJitterStrength(mood: Mood, intensity: number): number {
  if (mood !== "angry") {
    return 0;
  }

  const value = clamp(intensity, 0, 100);
  const bands = ANGER_JITTER_BANDS;

  if (value <= bands.lowMax) {
    return lerp(0, bands.lowPeak, value / bands.lowMax);
  }

  if (value <= bands.midMax) {
    return lerp(
      bands.lowPeak,
      bands.midPeak,
      (value - bands.lowMax) / (bands.midMax - bands.lowMax),
    );
  }

  return lerp(
    bands.midPeak,
    bands.highPeak,
    (value - bands.midMax) / (100 - bands.midMax),
  );
}

export function resolveWaveCenterY(
  canvas: HTMLCanvasElement,
  height: number,
): number {
  const canvasRect = canvas.getBoundingClientRect();
  const screenCenterY = window.innerHeight * 0.5 - canvasRect.top;

  if (!Number.isFinite(screenCenterY)) {
    return height * 0.5;
  }

  return clamp(screenCenterY, 0, height);
}

export function computeWaveAmplitudeIntensityProgress(intensity: number): number {
  const normalizedIntensity = clamp(intensity, 0, 100) / 100;
  return normalizedIntensity ** WAVE_AMPLITUDE_INTENSITY.curvePower;
}

/** Map emotion intensity (0–100) to sine amplitude in px, scaled to canvas height. */
export function resolveWaveAmplitude(
  intensity: number,
  canvasHeight: number,
  amplitudeMultiplier: number,
): number {
  const progress = computeWaveAmplitudeIntensityProgress(intensity);
  const minAmp = Math.max(
    4,
    canvasHeight * WAVE_AMPLITUDE_INTENSITY.minHeightRatio,
  );
  const cappedMaxAmp =
    canvasHeight * WAVE_AMPLITUDE_INTENSITY.maxHeightRatioCap;

  return lerp(minAmp, cappedMaxAmp, progress) * amplitudeMultiplier;
}

export function resolveLegacyWaveAmplitude(
  intensity: number,
  canvasHeight: number,
  amplitudeMultiplier: number,
): number {
  const normalizedIntensity = clamp(intensity, 0, 100) / 100;
  const minAmp = Math.max(
    4,
    canvasHeight * WAVE_AMPLITUDE_INTENSITY.minHeightRatio,
  );
  const legacyMaxAmp =
    canvasHeight * WAVE_AMPLITUDE_INTENSITY.legacyMaxHeightRatio;

  return lerp(minAmp, legacyMaxAmp, normalizedIntensity) * amplitudeMultiplier;
}

export function sampleCompositeWave(
  x: number,
  width: number,
  centerY: number,
  timeSeconds: number,
  context: WaveSampleContext,
): number {
  const { amplitude, speed, frequency } = context;
  const phase = timeSeconds * speed * Math.PI * 2;
  const baseK = (Math.PI * 2 * frequency) / Math.max(width, 1);
  const flowOffset = timeSeconds * speed * WAVE_FLOW_SPEED;
  const traveledX = x - flowOffset;

  return centerY + amplitude * Math.sin(traveledX * baseK + phase);
}

/** Static sine path for text — scroll drives motion; shape stays fixed for even spacing and speed. */
export function sampleTextWaveY(
  x: number,
  width: number,
  centerY: number,
  _timeSeconds: number,
  context: WaveSampleContext,
): number {
  const { amplitude, frequency } = context;
  const baseK = (Math.PI * 2 * frequency) / Math.max(width, 1);

  return centerY + amplitude * Math.sin(x * baseK);
}

function drawWaveFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerY: number,
  timeSeconds: number,
  context: WaveSampleContext,
  answerText: string | null,
  answerElapsedSeconds: number,
): void {
  ctx.clearRect(0, 0, width, height);

  if (answerText) {
    const textStyle = getWaveAnswerTextStyle(context.mood);

    const moodWave = getMoodVisualConfig(context.mood).wave;

    drawTextAlongWave(ctx, answerText, {
      width,
      height,
      centerY,
      sampleY: (x) =>
        sampleTextWaveY(x, width, centerY, timeSeconds, context),
      font: WAVE_ANSWER_FONT,
      fillStyle: textStyle.fillStyle,
      scrollElapsedSeconds: answerElapsedSeconds,
      scrollSpeedMultiplier: computeAnswerTextScrollMultiplier(
        context.mood,
        context.intensity,
        moodWave.textScrollSpeedMultiplier ?? 1,
      ),
      letterSpacing:
        context.mood === "groggy"
          ? computeGroggyLetterSpacing(context.intensity)
          : 0,
      shadowColor: textStyle.shadowColor,
      shadowBlur: textStyle.shadowBlur,
    });
  }
}

export function EmotionWave({
  emotion,
  answerText = null,
  answerScrollKey = null,
}: EmotionWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetAnimationRef = useRef<WaveAnimationState>(DEFAULT_ANIMATION_STATE);
  const currentAnimationRef = useRef<WaveAnimationState>(DEFAULT_ANIMATION_STATE);
  const moodRef = useRef(emotion.mood);
  const answerTextRef = useRef<string | null>(answerText);
  const answerScrollKeyRef = useRef<string | null>(answerScrollKey);
  const answerScrollStartRef = useRef(performance.now());

  const { amplitude, speed, frequency, irregularity, jitter } =
    useEmotionAnimation(emotion);

  useEffect(() => {
    if (
      answerTextRef.current !== answerText ||
      answerScrollKeyRef.current !== answerScrollKey
    ) {
      answerScrollStartRef.current = performance.now();
    }
    answerTextRef.current = answerText;
    answerScrollKeyRef.current = answerScrollKey;
  }, [answerText, answerScrollKey]);

  useEffect(() => {
    targetAnimationRef.current = {
      amplitude,
      speed,
      frequency,
      irregularity,
      jitter,
      intensity: emotion.intensity,
    };
    moodRef.current = emotion.mood;
  }, [
    amplitude,
    speed,
    frequency,
    irregularity,
    jitter,
    emotion.mood,
    emotion.intensity,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let width = 0;
    let height = 0;
    let lastFrameTime = performance.now();
    const startTime = performance.now();
    let pendingResize = false;

    const applyResize = () => {
      pendingResize = false;

      const dpr = window.devicePixelRatio || 1;
      const rect = host.getBoundingClientRect();
      const cssWidth = rect.width;
      const cssHeight = rect.height;

      if (cssWidth <= 0 || cssHeight <= 0) {
        return;
      }

      const backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
      const backingHeight = Math.max(1, Math.floor(cssHeight * dpr));

      if (
        width === cssWidth &&
        height === cssHeight &&
        canvas.width === backingWidth &&
        canvas.height === backingHeight
      ) {
        return;
      }

      width = cssWidth;
      height = cssHeight;
      canvas.width = backingWidth;
      canvas.height = backingHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const scheduleResize = () => {
      if (pendingResize) {
        return;
      }

      pendingResize = true;
      requestAnimationFrame(applyResize);
    };

    const tick = (now: number) => {
      if (width <= 0 || height <= 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      currentAnimationRef.current = lerpWaveAnimationState(
        currentAnimationRef.current,
        targetAnimationRef.current,
        deltaSeconds,
      );

      const renderContext: WaveSampleContext = {
        ...currentAnimationRef.current,
        mood: moodRef.current,
        amplitude: resolveWaveAmplitude(
          currentAnimationRef.current.intensity,
          height,
          getMoodVisualConfig(moodRef.current).wave.amplitudeMultiplier,
        ),
      };

      const centerY = resolveWaveCenterY(canvas, height);

      const timeSeconds = (now - startTime) / 1000;
      const answerElapsedSeconds =
        (now - answerScrollStartRef.current) / 1000;
      drawWaveFrame(
        ctx,
        width,
        height,
        centerY,
        timeSeconds,
        renderContext,
        answerTextRef.current,
        answerElapsedSeconds,
      );
      rafId = requestAnimationFrame(tick);
    };

    applyResize();
    void document.fonts.load(WAVE_ANSWER_FONT);
    void document.fonts.load('400 18px "Arimo"', "가힣");

    const hostObserver = new ResizeObserver(scheduleResize);
    hostObserver.observe(host);

    window.addEventListener("resize", scheduleResize);

    rafId = requestAnimationFrame(tick);

    return () => {
      hostObserver.disconnect();
      window.removeEventListener("resize", scheduleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="emotion-wave-host" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="emotion-wave"
        data-mood={emotion.mood}
        data-intensity={emotion.intensity}
      />
    </div>
  );
}
