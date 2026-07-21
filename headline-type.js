const DEFAULT_HEADLINE = "You want to talk with me? Follow.";
const REJECT_HEADLINE = "I don't want to talk now actually.";
const LOCK_HEADLINE = "ok then..I'll listen to you.";
const DOUBT_HEADLINE = "Are you serious? Hmm";
const DISTANT_HEADLINE = "Hey, My interest is far away.";
const REJECT_HOLD_MS = 5_000;
const TYPE_SPEED_MS = 28;

let headlineMode = "default";
let rejectTimer = 0;
let typingTimer = 0;

function clearHeadlineTimers() {
  window.clearTimeout(rejectTimer);
  window.clearInterval(typingTimer);
  rejectTimer = 0;
  typingTimer = 0;
}

function setDefaultHeadline(element) {
  element.classList.remove("is-wave", "is-typing");
  element.textContent = DEFAULT_HEADLINE;
}

function setWaveHeadline(element, text) {
  element.classList.remove("is-typing");
  element.classList.add("is-wave");
  element.innerHTML = [...text]
    .map((char, index) => {
      const content = char === " " ? "\u00a0" : char;
      return `<span class="prompt__headline-char" style="--i: ${index}">${content}</span>`;
    })
    .join("");
}

function typeHeadline(element, text, speed = TYPE_SPEED_MS) {
  if (!element) return;

  clearHeadlineTimers();
  element.classList.remove("is-wave");
  element.textContent = "";
  element.classList.add("is-typing");
  headlineMode = "lock";

  let index = 0;
  typingTimer = window.setInterval(() => {
    element.textContent += text[index];
    index += 1;

    if (index >= text.length) {
      window.clearInterval(typingTimer);
      typingTimer = 0;
      element.classList.remove("is-typing");
    }
  }, speed);
}

function initHeadline(element) {
  if (!element) return;
  clearHeadlineTimers();
  element.dataset.defaultHeadline = DEFAULT_HEADLINE;
  setDefaultHeadline(element);
  headlineMode = "default";
}

/** Show reject wave for ~5s after a proximity bounce, then restore default. */
function triggerRejectHeadline(element) {
  if (!element) return;
  if (headlineMode === "lock") return;

  clearHeadlineTimers();

  if (headlineMode !== "reject") {
    headlineMode = "reject";
    setWaveHeadline(element, REJECT_HEADLINE);
  }

  rejectTimer = window.setTimeout(() => {
    rejectTimer = 0;
    if (headlineMode === "lock") return;
    headlineMode = "default";
    setDefaultHeadline(element);
  }, REJECT_HOLD_MS);
}

function setPenaltyHeadline(element, text) {
  if (!element) return;
  clearHeadlineTimers();
  element.classList.remove("is-wave", "is-typing");
  element.textContent = text;
  headlineMode = "penalty";
}

function setDoubtHeadline(element) {
  setPenaltyHeadline(element, DOUBT_HEADLINE);
}

function setDistantHeadline(element) {
  setPenaltyHeadline(element, DISTANT_HEADLINE);
}

function typeLockHeadline(element) {
  if (!element) return;
  typeHeadline(element, LOCK_HEADLINE);
}

export {
  DEFAULT_HEADLINE,
  REJECT_HEADLINE,
  LOCK_HEADLINE,
  DOUBT_HEADLINE,
  DISTANT_HEADLINE,
  initHeadline,
  triggerRejectHeadline,
  typeLockHeadline,
  setDoubtHeadline,
  setDistantHeadline,
};
