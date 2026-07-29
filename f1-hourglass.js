import hourglassFrameSrc from "./assets/icons/icon_hourglass.svg";

const VIEW_W = 483;
const VIEW_H = 816;
const SAND_COLOR = "#F8650F";
const SAND_SIZE = 37.0909;
const FLIP_MS = 360;
const GRAIN_COUNT = 20;
const FALL_STEPS = 7;
const FALL_HOLD = 0.04;
const NECK = { x: 222.546, y: 389.4 };

/** Top bulb pile — 4 rows × 5 (pixel-loader layout) */
const TOP_PILE = [
  [111.272, 259.637],
  [148.363, 259.637],
  [185.454, 259.637],
  [222.546, 259.637],
  [259.637, 259.637],
  [148.363, 222.546],
  [185.454, 222.546],
  [222.546, 222.546],
  [259.637, 222.546],
  [296.728, 222.546],
  [111.272, 185.454],
  [148.363, 185.454],
  [185.454, 185.454],
  [222.546, 185.454],
  [259.637, 185.454],
  [148.363, 148.363],
  [185.454, 148.363],
  [222.546, 148.363],
  [259.637, 148.363],
  [296.728, 148.363],
];

/** Bottom bulb stack — fills upward as grains land */
const BOTTOM_PILE = [
  [111.272, 667.636],
  [148.363, 667.636],
  [185.454, 667.636],
  [222.546, 667.636],
  [259.637, 667.636],
  [148.363, 630.545],
  [185.454, 630.545],
  [222.546, 630.545],
  [259.637, 630.545],
  [296.728, 630.545],
  [111.272, 593.454],
  [148.363, 593.454],
  [185.454, 593.454],
  [222.546, 593.454],
  [259.637, 593.454],
  [148.363, 556.363],
  [185.454, 556.363],
  [222.546, 556.363],
  [259.637, 556.363],
  [296.728, 556.363],
];

/** @type {HTMLElement | null} */
let root = null;

/** @type {HTMLElement | null} */
let rotor = null;

/** @type {SVGGElement | null} */
let sandGroup = null;

let flipIndex = 0;
let sandRaf = 0;
let sandStart = 0;
let sandDuration = 0;
let sandActive = false;

/** @type {SVGRectElement[]} */
let grainEls = [];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapGrid(value) {
  return Math.round(value / SAND_SIZE) * SAND_SIZE;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInGravity(t) {
  return t * t * t;
}

function buildFallPath(start, end) {
  const midY = snapGrid(lerp(start[1], NECK.y, 0.45));
  const neckIn = { x: NECK.x, y: midY };
  const neckOut = { x: NECK.x, y: snapGrid(NECK.y) };
  const midBottom = {
    x: snapGrid(lerp(NECK.x, end[0], 0.35)),
    y: snapGrid(lerp(NECK.y, end[1], 0.55)),
  };

  return [
    { x: start[0], y: start[1] },
    neckIn,
    neckOut,
    midBottom,
    { x: end[0], y: end[1] },
  ];
}

function grainPosition(index, progress, direction) {
  const slotStart = index / GRAIN_COUNT;
  const slotEnd = (index + 1) / GRAIN_COUNT;
  const start =
    direction > 0 ? TOP_PILE[index] : BOTTOM_PILE[index];
  const end =
    direction > 0 ? BOTTOM_PILE[index] : TOP_PILE[index];
  const path = buildFallPath(start, end);

  if (progress >= slotEnd) {
    return path[path.length - 1];
  }

  if (progress < slotStart) {
    return path[0];
  }

  const local = (progress - slotStart) / (slotEnd - slotStart);

  if (local < FALL_HOLD) {
    return path[0];
  }

  const fallT = (local - FALL_HOLD) / (1 - FALL_HOLD);
  const eased = easeInGravity(fallT);
  const step = Math.min(
    path.length - 1,
    Math.min(FALL_STEPS - 1, Math.floor(eased * FALL_STEPS)),
  );
  return path[step];
}

function mountGrains() {
  if (!sandGroup) return;
  sandGroup.replaceChildren();
  grainEls = [];

  for (let i = 0; i < GRAIN_COUNT; i += 1) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    el.setAttribute("width", String(SAND_SIZE));
    el.setAttribute("height", String(SAND_SIZE));
    el.setAttribute("fill", SAND_COLOR);
    sandGroup.appendChild(el);
    grainEls.push(el);
  }
}

function applySandProgress(progress) {
  const direction = flipIndex % 2 === 0 ? 1 : -1;

  grainEls.forEach((el, index) => {
    const pos = grainPosition(index, progress, direction);
    el.setAttribute("x", String(pos.x));
    el.setAttribute("y", String(pos.y));
    el.setAttribute("transform", "");
  });
}

function cancelSandRaf() {
  window.cancelAnimationFrame(sandRaf);
  sandRaf = 0;
}

function sandTick(now) {
  if (!sandActive) return;
  const elapsed = now - sandStart;
  const progress = sandDuration > 0 ? clamp(elapsed / sandDuration, 0, 1) : 1;
  applySandProgress(progress);
  if (progress < 1) {
    sandRaf = window.requestAnimationFrame(sandTick);
  }
}

function setRotation(deg, animate) {
  if (!rotor) return;
  rotor.classList.toggle("f1-hourglass__rotor--flip", animate);
  rotor.style.setProperty("--f1-hourglass-rotation", `${deg}deg`);
}

function waitFlip() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, FLIP_MS);
  });
}

export function initF1Hourglass(container) {
  if (!container || document.body.dataset.character !== "F1") return;

  root = container;
  root.innerHTML = `
    <div class="f1-hourglass__rotor" style="--f1-hourglass-rotation: 0deg">
      <img
        class="f1-hourglass__frame"
        src="${hourglassFrameSrc}"
        alt=""
        width="${VIEW_W}"
        height="${VIEW_H}"
        decoding="async"
        draggable="false"
      />
      <svg
        class="f1-hourglass__sand-layer"
        viewBox="0 0 ${VIEW_W} ${VIEW_H}"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <g class="f1-hourglass__sand"></g>
      </svg>
    </div>`;

  rotor = root.querySelector(".f1-hourglass__rotor");
  sandGroup = root.querySelector(".f1-hourglass__sand");
  mountGrains();
  applySandProgress(0);
}

export function stopF1HourglassSand() {
  sandActive = false;
  cancelSandRaf();
}

export async function startF1HourglassSand(durationMs, { rotate = false } = {}) {
  if (!root || !rotor || !sandGroup) return;

  stopF1HourglassSand();

  if (rotate) {
    flipIndex += 1;
    setRotation(flipIndex * 180, true);
    await waitFlip();
  }

  mountGrains();
  applySandProgress(0);

  sandDuration = durationMs;
  sandStart = performance.now();
  sandActive = true;
  sandRaf = window.requestAnimationFrame(sandTick);
}
