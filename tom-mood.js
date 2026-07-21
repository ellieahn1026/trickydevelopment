import { syncTomSadFloat } from "./tom-sad-float.js";

const MOODS = {
  happy: {
    headline: "Hey Come on!!!! So Happpppppppppyyyyyy!!",
    sendLabel: "Send",
    block: false,
  },
  sad: {
    headline: "So Groggy...... Hey Go away.",
    sendLabel: "Send",
    block: false,
  },
  tired: {
    headline: "tired...want to sleep",
    sendLabel: "pet",
    block: true,
    blockInput: true,
    placeholder: "pet me if you want to talk again....Maybe I'll wake up",
  },
  idle: {
    headline: "What do you want to talk about?",
    sendLabel: "Send",
    block: false,
  },
};

const MOOD_KEYS = Object.keys(MOODS);
const MIN_HOLD_MS = 8000;
const MAX_HOLD_MS = 16000;
const PETS_TO_WAKE = 5;
const TIRED_NOD_MS = 3500;
const TIRED_NOD_EASING = "cubic-bezier(0.45, 0.05, 0.55, 0.95)";
const TIRED_SLUMP_Y = 42;
const TIRED_SLUMP_ROT = 4;
const TIRED_NOD_SLUMP_PHASE = 0.38;

let currentMood = "idle";
let timerId = 0;
let petCount = 0;
let petAnim = null;
let petBounceGen = 0;

function elements() {
  return {
    headline: document.getElementById("chat-headline"),
    send: document.querySelector("#chat-form .prompt__send"),
    input: document.getElementById("chat-input"),
  };
}

function pickNextMood(exclude) {
  const pool = MOOD_KEYS.filter((key) => key !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomHoldMs() {
  return MIN_HOLD_MS + Math.floor(Math.random() * (MAX_HOLD_MS - MIN_HOLD_MS));
}

function applyMood(mood) {
  const config = MOODS[mood];
  if (!config) return;

  currentMood = mood;
  document.body.dataset.tomMood = mood;

  const { headline, send, input } = elements();
  if (headline) {
    headline.classList.remove("is-wave", "is-typing");
    headline.textContent = config.headline;
    headline.dataset.defaultHeadline = config.headline;
  }

  if (input) {
    if (!input.dataset.defaultPlaceholder) {
      input.dataset.defaultPlaceholder = input.placeholder;
    }

    if (config.blockInput) {
      input.value = "";
      input.placeholder = config.placeholder;
      input.disabled = true;
    } else {
      input.placeholder = input.dataset.defaultPlaceholder;
      input.disabled = false;
    }
  }

  if (mood !== "tired") {
    resetChatFieldPetMotion();
  }

  if (send) {
    const isPet = mood === "tired";
    send.classList.remove("prompt__send--generating");
    send.textContent = config.sendLabel;
    send.classList.toggle("prompt__send--pet", isPet);
    send.classList.toggle("prompt__send--block", Boolean(config.block) && !isPet);
    send.disabled = false;
  }

  syncTomSadFloat(mood === "sad");

  window.clearTimeout(timerId);
  timerId = 0;

  if (mood === "tired") {
    petCount = 0;
    resetChatFieldPetMotion();
    return;
  }

  scheduleNextMood();
}

function parseFieldTransform(field) {
  const raw = getComputedStyle(field).transform;
  if (raw === "none") {
    return { y: 0, rot: 0 };
  }

  const matrix = new DOMMatrixReadOnly(raw);
  return {
    y: matrix.m42,
    rot: Math.atan2(matrix.b, matrix.a) * (180 / Math.PI),
  };
}

function resetChatFieldPetMotion() {
  const field = document.querySelector("#chat-form .prompt__field");
  if (!field) return;

  petAnim?.cancel();
  petAnim = null;
  field.classList.remove("prompt__field--pet-bounce");
  field.style.transform = "";
  field.style.animation = "";
  field.style.animationDelay = "";
}

function startTiredNod(field, phase = 0) {
  field.classList.remove("prompt__field--pet-bounce");
  field.style.transform = "";
  field.style.animation = "none";
  void field.offsetWidth;
  field.style.animation = `tom-tired-nod ${TIRED_NOD_MS}ms ${TIRED_NOD_EASING} infinite`;
  field.style.animationDelay = `${-(TIRED_NOD_MS * phase) / 1000}s`;
}

function resumeTiredNodAtSlump(field) {
  startTiredNod(field, TIRED_NOD_SLUMP_PHASE);
}

function finishPetBounce(field) {
  petAnim?.cancel();
  petAnim = null;

  if (currentMood !== "tired") {
    return;
  }

  resumeTiredNodAtSlump(field);
}

function bounceChatField() {
  const field = document.querySelector("#chat-form .prompt__field");
  if (!field) return;

  const gen = ++petBounceGen;
  petAnim?.cancel();
  petAnim = null;

  field.classList.add("prompt__field--pet-bounce");
  field.style.animation = "none";
  field.style.animationDelay = "";

  const { y, rot } = parseFieldTransform(field);
  const keyframes = [
    { transform: `translateY(${y}px) rotate(${rot}deg)` },
    { transform: `translateY(${y - 68}px) rotate(${rot - 3}deg)`, offset: 0.11 },
    { transform: `translateY(${y + 5}px) rotate(${rot + 2.5}deg)`, offset: 0.24 },
    { transform: `translateY(${y - 38}px) rotate(${rot - 2}deg)`, offset: 0.35 },
    { transform: `translateY(${y + 4}px) rotate(${rot + 2}deg)`, offset: 0.46 },
    { transform: `translateY(${y - 18}px) rotate(${rot - 1.2}deg)`, offset: 0.55 },
    { transform: `translateY(${y + 2}px) rotate(${rot + 1.2}deg)`, offset: 0.64 },
    { transform: `translateY(${y - 8}px) rotate(${rot - 0.6}deg)`, offset: 0.71 },
    { transform: `translateY(${y + 1}px) rotate(${rot + 0.8}deg)`, offset: 0.78 },
    { transform: `translateY(${y + 8}px) rotate(${rot + 2.5}deg)`, offset: 0.88 },
    {
      transform: `translateY(${TIRED_SLUMP_Y}px) rotate(${TIRED_SLUMP_ROT}deg)`,
      offset: 1,
    },
  ];

  petAnim = field.animate(keyframes, {
    duration: 1150,
    easing: "linear",
    fill: "forwards",
  });

  petAnim.finished.then(
    () => {
      if (gen !== petBounceGen) return;
      finishPetBounce(field);
    },
    () => {},
  );
}

function handleTomPet() {
  if (currentMood !== "tired") return false;

  petCount += 1;
  bounceChatField();

  if (petCount >= PETS_TO_WAKE) {
    petCount = 0;
    applyMood(pickNextMood("tired"));
  }

  return true;
}

function scheduleNextMood() {
  window.clearTimeout(timerId);
  timerId = window.setTimeout(() => {
    applyMood(pickNextMood(currentMood));
  }, randomHoldMs());
}

function getTomSendLabel() {
  return MOODS[currentMood]?.sendLabel ?? "Send";
}

function getTomHeadline() {
  return MOODS[currentMood]?.headline ?? MOODS.idle.headline;
}

function getTomMood() {
  return currentMood;
}

function initTomMood() {
  if (document.body.dataset.character !== "Tom") return;

  applyMood(pickNextMood(null));
}

initTomMood();

export { getTomHeadline, getTomMood, getTomSendLabel, applyMood, handleTomPet, MOODS };
