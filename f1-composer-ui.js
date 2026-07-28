import { logInteraction } from "./interaction-log.js";
import {
  initF1Hourglass,
  startF1HourglassSand,
  stopF1HourglassSand,
} from "./f1-hourglass.js";

const INPUT_WINDOWS_MS = [10_000, 3_000, 5_000, 7_000];
const FLEE_SPEED = 46;
const RETURN_MS = 700;

/** @type {HTMLElement | null} */
let composer = null;

/** @type {HTMLInputElement | null} */
let input = null;

let windowTimer = 0;
let animRaf = 0;

/** @type {"idle" | "fleeing" | "returning" | "waiting"} */
let phase = "idle";

let inputSession = 0;

/** @type {(() => void) | null} */
let onTimeoutSubmit = null;

export function initF1Composer({
  composer: composerEl,
  input: inputEl,
  onTimeoutSubmit: timeoutSubmit,
}) {
  if (document.body.dataset.character !== "F1") return;

  composer = composerEl;
  input = inputEl;
  onTimeoutSubmit = timeoutSubmit ?? null;
  if (!composer || !input) return;

  initF1Hourglass(document.querySelector(".f1-hourglass"));

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      void startInputWindow();
    });
  });
}

export function notifyF1MessageSubmit() {
  if (!composer) return;
  stopInputWindow();
  stopF1HourglassSand();
  phase = "waiting";
}

export async function notifyF1AnswerComplete() {
  if (!composer) return;
  await returnComposer();
}

export function notifyF1GenerationCancelled() {
  if (!composer) return;
  if (phase === "fleeing" || phase === "returning") return;
  phase = "idle";
  void startInputWindow();
}

function randomWindowMs() {
  const index = Math.floor(Math.random() * INPUT_WINDOWS_MS.length);
  return INPUT_WINDOWS_MS[index];
}

function stopInputWindow() {
  window.clearTimeout(windowTimer);
  windowTimer = 0;
  stopF1HourglassSand();
}

async function startInputWindow() {
  if (!composer || !input) return;
  if (phase === "fleeing" || phase === "returning" || phase === "waiting") return;

  stopInputWindow();
  phase = "idle";
  input.disabled = false;

  const ms = randomWindowMs();
  const rotate = inputSession > 0;
  inputSession += 1;

  logInteraction("f1.input_window.start", { ms, rotate });
  await startF1HourglassSand(ms, { rotate });

  windowTimer = window.setTimeout(() => {
    void handleTimeout();
  }, ms);
}

async function handleTimeout() {
  if (!composer || !input || phase === "waiting") return;

  const draft = input.value.trim();
  if (draft && onTimeoutSubmit) {
    logInteraction("f1.input_window.timeout_submit", {
      length: draft.length,
    });
    stopInputWindow();
    onTimeoutSubmit();
    return;
  }

  logInteraction("f1.input_window.timeout", {});
  phase = "fleeing";
  stopF1HourglassSand();
  input.value = "";
  input.disabled = true;
  input.blur();

  await fleeComposer();
  await returnComposer();
}

function cancelAnim() {
  window.cancelAnimationFrame(animRaf);
  animRaf = 0;
}

function isFullyOffscreen(rect) {
  const margin = 36;
  return (
    rect.right < -margin ||
    rect.left > window.innerWidth + margin ||
    rect.bottom < -margin ||
    rect.top > window.innerHeight + margin
  );
}

function readHomeRect() {
  composer.classList.remove("f1-composer--animating");
  composer.style.removeProperty("left");
  composer.style.removeProperty("top");
  composer.style.removeProperty("right");
  composer.style.removeProperty("bottom");
  composer.style.removeProperty("transform");
  composer.style.removeProperty("margin");
  composer.style.removeProperty("width");
  composer.style.removeProperty("max-width");
  void composer.offsetWidth;

  const rect = composer.getBoundingClientRect();
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
}

function getSidelineLeft() {
  const sideline = document.querySelector(".sideline");
  return sideline ? sideline.getBoundingClientRect().left : 365;
}

function updateSidelineClip(x) {
  const clipLeft = Math.max(0, getSidelineLeft() - x);
  composer.style.setProperty("--f1-clip-left", `${clipLeft}px`);
}

function clearSidelineClip() {
  composer.style.removeProperty("--f1-clip-left");
}

function setComposerPos(x, y, width) {
  composer.classList.add("f1-composer--animating");
  composer.style.setProperty("left", `${x}px`, "important");
  composer.style.setProperty("top", `${y}px`, "important");
  composer.style.setProperty("right", "auto", "important");
  composer.style.setProperty("bottom", "auto", "important");
  composer.style.setProperty("transform", "none", "important");
  composer.style.setProperty("margin", "0", "important");
  if (width > 0) {
    composer.style.setProperty("width", `${width}px`, "important");
    composer.style.setProperty("max-width", `${width}px`, "important");
  }
  updateSidelineClip(x);
}

function beginFromCurrentPos() {
  const rect = composer.getBoundingClientRect();
  setComposerPos(rect.left, rect.top, rect.width);
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
}

function randomOffscreenPoint(home) {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.max(window.innerWidth, window.innerHeight) * 0.72;
  const cx = home.x + home.w / 2;
  const cy = home.y + home.h / 2;
  return {
    x: cx + Math.cos(angle) * dist - home.w / 2,
    y: cy + Math.sin(angle) * dist - home.h / 2,
  };
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function fleeComposer() {
  return new Promise((resolve) => {
    cancelAnim();
    const start = beginFromCurrentPos();
    let x = start.x;
    let y = start.y;
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * FLEE_SPEED;
    const vy = Math.sin(angle) * FLEE_SPEED;

    logInteraction("f1.composer.flee", { angle });

    const step = () => {
      x += vx;
      y += vy;
      setComposerPos(x, y, start.w);

      if (isFullyOffscreen(composer.getBoundingClientRect())) {
        cancelAnim();
        resolve();
        return;
      }

      animRaf = window.requestAnimationFrame(step);
    };

    animRaf = window.requestAnimationFrame(step);
  });
}

function finishAtHome() {
  cancelAnim();
  composer.classList.remove("f1-composer--animating");
  clearSidelineClip();
  composer.style.removeProperty("left");
  composer.style.removeProperty("top");
  composer.style.removeProperty("right");
  composer.style.removeProperty("bottom");
  composer.style.removeProperty("transform");
  composer.style.removeProperty("margin");
  composer.style.removeProperty("width");
  composer.style.removeProperty("max-width");
}

function returnComposer() {
  return new Promise((resolve) => {
    cancelAnim();
    phase = "returning";
    input.disabled = true;

    const home = readHomeRect();
    const start = randomOffscreenPoint(home);
    setComposerPos(start.x, start.y, home.w);

    logInteraction("f1.composer.return", {
      fromX: Math.round(start.x),
      fromY: Math.round(start.y),
      toX: Math.round(home.x),
      toY: Math.round(home.y),
    });

    const x0 = start.x;
    const y0 = start.y;
    const t0 = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - t0) / RETURN_MS);
      const eased = easeOutCubic(t);
      setComposerPos(
        x0 + (home.x - x0) * eased,
        y0 + (home.y - y0) * eased,
        home.w,
      );

      if (t >= 1) {
        finishAtHome();
        phase = "idle";
        void startInputWindow();
        resolve();
        return;
      }

      animRaf = window.requestAnimationFrame(step);
    };

    animRaf = window.requestAnimationFrame(step);
  });
}
