import { logInteraction } from "./interaction-log.js";

const WITHDRAW_LABEL = "Not interested.";
const END_LABEL = "conversation over";
const HESITATE_PREFIX = "hmm...";
const HESITATE_DURATION_MS = 5000;
const QUESTION_DISMISS_MS = 420;
const SHORT_GRAVITY = 3400;
const SHORT_DROP_START = -180;

function wait(ms, isCancelled) {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (isCancelled?.()) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      resolve();
    }, ms);
  });
}

function animateGravityDrop(el, isCancelled) {
  return new Promise((resolve, reject) => {
    let y = SHORT_DROP_START;
    let vy = 0;
    let last = performance.now();
    let rafId = 0;

    el.style.willChange = "transform";

    const finish = () => {
      cancelAnimationFrame(rafId);
      el.style.transform = "";
      el.style.willChange = "";
    };

    const frame = (now) => {
      if (isCancelled?.()) {
        finish();
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const dt = Math.min((now - last) / 1000, 0.032);
      last = now;
      vy += SHORT_GRAVITY * dt;
      y += vy * dt;

      if (y >= 0) {
        finish();
        resolve();
        return;
      }

      el.style.transform = `translateY(${y}px)`;
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
  });
}

function dismissQuestion(questionEl, isCancelled) {
  return new Promise((resolve, reject) => {
    if (!questionEl?.isConnected) {
      resolve();
      return;
    }

    logInteraction("potter.question.dismiss");

    questionEl.classList.add("is-potter-dismiss");

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      questionEl.removeEventListener("animationend", settle);
      questionEl.remove();

      if (isCancelled?.()) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      resolve();
    };

    questionEl.addEventListener("animationend", settle);
    window.setTimeout(settle, QUESTION_DISMISS_MS + 80);
  });
}

export function clearPotterWithdrawShift(composer) {
  if (!composer) return;
  composer.classList.remove(
    "is-withdraw-shift",
    "is-withdraw-pop",
    "is-withdraw-nudge",
  );
  composer.style.removeProperty("--withdraw-offset");
  delete composer.dataset.withdrawOffset;
}

export function clearConversationEndDivider(chatPanel) {
  chatPanel
    ?.querySelector(".chat-panel__conversation-end")
    ?.remove();
}

async function renderSilence(el, questionEl, isCancelled, onScroll) {
  await dismissQuestion(questionEl, isCancelled);
  el.remove();
  onScroll?.();
}

async function renderShort(el, text, isCancelled, onScroll) {
  el.className = "chat-answer chat-answer--short";
  const content = text.trim() || el.textContent.trim() || "…";
  el.textContent = content;
  onScroll?.();
  await animateGravityDrop(el, isCancelled);
  await wait(280, isCancelled);
}

async function renderHesitate(el, text, isCancelled, onScroll) {
  const content = text.trim() || el.textContent.trim() || "…";

  el.className = "chat-answer chat-answer--hesitate";
  el.textContent = HESITATE_PREFIX;
  onScroll?.();

  await wait(HESITATE_DURATION_MS, isCancelled);

  el.textContent = content;
  onScroll?.();
  await wait(Math.min(1200, 180 + content.length * 24), isCancelled);
}

async function renderWithdraw(el, questionEl, text, isCancelled, onScroll) {
  await dismissQuestion(questionEl, isCancelled);

  el.className = "chat-answer chat-answer--withdraw";
  el.textContent = text.trim() || WITHDRAW_LABEL;
  onScroll?.();
  await wait(700, isCancelled);
}

async function renderEnd(el, text, isCancelled, onScroll) {
  el.className = "chat-answer chat-answer--end";
  el.replaceChildren();

  const divider = document.createElement("hr");
  divider.className = "potter-end__divider";
  divider.setAttribute("aria-hidden", "true");

  if (text.trim()) {
    const farewell = document.createElement("p");
    farewell.className = "potter-end__farewell";
    farewell.textContent = text.trim();
    el.appendChild(farewell);
  }

  el.appendChild(divider);

  const label = document.createElement("p");
  label.className = "potter-end__label";
  label.textContent = END_LABEL;
  el.appendChild(label);

  onScroll?.();
  await wait(640, isCancelled);
}

/**
 * @returns {Promise<boolean>} true when the action UI handled rendering
 */
export async function renderPotterActionAnswer({
  el,
  action,
  text,
  questionEl,
  isCancelled,
  onScroll,
}) {
  logInteraction("potter.action.render", { action, textLength: text?.length ?? 0 });

  switch (action) {
    case "silence":
      await renderSilence(el, questionEl, isCancelled, onScroll);
      return true;
    case "short":
      await renderShort(el, text, isCancelled, onScroll);
      return true;
    case "hesitate":
      await renderHesitate(el, text, isCancelled, onScroll);
      return true;
    case "withdraw":
      await renderWithdraw(el, questionEl, text, isCancelled, onScroll);
      return true;
    case "end":
      await renderEnd(el, text, isCancelled, onScroll);
      return true;
    case "respond":
    default:
      return false;
  }
}

export { WITHDRAW_LABEL, END_LABEL };
