const BASE_TILT_DEG = 15;
const MAX_TILT_DEG = 60;
const CHARS_FOR_MAX_TILT = 72;
const TILT_EASE = 0.09;
const LIFT_EASE = 0.14;
const VIEWPORT_MARGIN = 16;
const FLOAT_SPEED = 0.011;

let active = false;
let field = null;
let input = null;
let onInput = null;
let currentTilt = BASE_TILT_DEG;
let targetTilt = BASE_TILT_DEG;
let currentLift = 0;
let floatPhase = 0;
let motionRaf = 0;

function isTomPage() {
  return document.body.dataset.character === "Tom";
}

function tiltForLength(length) {
  const progress = Math.min(Math.max(length, 0), CHARS_FOR_MAX_TILT) / CHARS_FOR_MAX_TILT;
  return BASE_TILT_DEG + (MAX_TILT_DEG - BASE_TILT_DEG) * progress;
}

function measureBottomOverflow(driftX, driftY, lift) {
  if (!field) return 0;

  field.style.rotate = `${currentTilt}deg`;
  field.style.translate = `${driftX}px ${driftY - lift}px`;

  const rect = field.getBoundingClientRect();
  return Math.max(0, rect.bottom - (window.innerHeight - VIEWPORT_MARGIN));
}

function applyMotion(driftX, driftY) {
  if (!field) return;

  const overflow = measureBottomOverflow(driftX, driftY, currentLift);
  const targetLift = overflow;
  currentLift += (targetLift - currentLift) * LIFT_EASE;

  field.style.rotate = `${currentTilt}deg`;
  field.style.translate = `${driftX}px ${driftY - currentLift}px`;
}

function tickMotion() {
  if (!active || !field) {
    motionRaf = 0;
    return;
  }

  const diff = targetTilt - currentTilt;
  if (Math.abs(diff) >= 0.06) {
    currentTilt += diff * TILT_EASE;
  } else {
    currentTilt = targetTilt;
  }

  floatPhase += FLOAT_SPEED;
  const driftX = Math.sin(floatPhase) * 10 + Math.sin(floatPhase * 0.65) * 4;
  const driftY = Math.cos(floatPhase * 0.85) * 12 - 6;

  applyMotion(driftX, driftY);
  motionRaf = window.requestAnimationFrame(tickMotion);
}

function startMotionLoop() {
  if (!motionRaf) {
    motionRaf = window.requestAnimationFrame(tickMotion);
  }
}

function stopMotionLoop() {
  window.cancelAnimationFrame(motionRaf);
  motionRaf = 0;
}

function updateSadTilt() {
  if (!input) return;
  targetTilt = tiltForLength(input.value.length);
  startMotionLoop();
}

function bindInput() {
  onInput = () => updateSadTilt();
  input.addEventListener("input", onInput);
  targetTilt = tiltForLength(input.value.length);
  currentTilt = targetTilt;
}

function unbindInput() {
  if (!input || !onInput) return;
  input.removeEventListener("input", onInput);
  onInput = null;
}

function clearFieldMotion() {
  if (!field) return;
  field.style.rotate = "";
  field.style.translate = "";
}

function enableSadFloat() {
  if (!isTomPage() || active) return;

  field = document.querySelector("#chat-form .prompt__field");
  input = document.getElementById("chat-input");
  if (!field || !input) return;

  active = true;
  currentTilt = BASE_TILT_DEG;
  targetTilt = tiltForLength(input.value.length);
  currentLift = 0;
  floatPhase = 0;

  field.classList.add("prompt__field--sad-float");
  bindInput();
  startMotionLoop();
}

function disableSadFloat() {
  if (!active) return;

  stopMotionLoop();
  unbindInput();
  clearFieldMotion();
  field?.classList.remove("prompt__field--sad-float");

  active = false;
  field = null;
  input = null;
  currentTilt = BASE_TILT_DEG;
  targetTilt = BASE_TILT_DEG;
  currentLift = 0;
}

function syncTomSadFloat(isSad) {
  if (!isTomPage()) return;
  if (isSad) {
    enableSadFloat();
    return;
  }
  disableSadFloat();
}

export { syncTomSadFloat };
