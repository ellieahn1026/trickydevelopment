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
    sendLabel: "Block!",
    block: true,
  },
  idle: {
    headline: "Honestly, I'm not interested.",
    sendLabel: "Send",
    block: false,
  },
};

const MOOD_KEYS = Object.keys(MOODS);
const MIN_HOLD_MS = 8000;
const MAX_HOLD_MS = 16000;

let currentMood = "idle";
let timerId = 0;

function elements() {
  return {
    headline: document.getElementById("chat-headline"),
    send: document.querySelector("#chat-form .prompt__send"),
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

  const { headline, send } = elements();
  if (headline) {
    headline.classList.remove("is-wave", "is-typing");
    headline.textContent = config.headline;
    headline.dataset.defaultHeadline = config.headline;
  }

  if (send) {
    send.textContent = config.sendLabel;
    send.classList.toggle("prompt__send--block", config.block);
  }
}

function scheduleNextMood() {
  window.clearTimeout(timerId);
  timerId = window.setTimeout(() => {
    applyMood(pickNextMood(currentMood));
    scheduleNextMood();
  }, randomHoldMs());
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
  scheduleNextMood();
}

initTomMood();

export { getTomHeadline, getTomMood, applyMood, MOODS };
