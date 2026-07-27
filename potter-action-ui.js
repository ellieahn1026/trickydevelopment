const WITHDRAW_LABEL = "Not interested.";
const END_LABEL = "conversation end.";
const SILENCE_DURATION_MS = 2200;
const WITHDRAW_CLICKS_TO_RECOVER = 3;
const WITHDRAW_HIDE_RATIO = 0.5;

let withdrawClickCount = 0;
let withdrawRecoveryBound = false;

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

function getComposerInput(composer) {
  return composer?.querySelector("#chat-input") ?? document.getElementById("chat-input");
}

function ensureCatchCoordinates(composer) {
  if (!composer) return;

  if (composer.dataset.catchX != null && composer.dataset.catchY != null) {
    composer.style.setProperty("--catch-x", `${composer.dataset.catchX}px`);
    composer.style.setProperty("--catch-y", `${composer.dataset.catchY}px`);
    return;
  }

  const existingX = composer.style.getPropertyValue("--catch-x").trim();
  const existingY = composer.style.getPropertyValue("--catch-y").trim();
  if (existingX && existingY) return;

  const rect = composer.getBoundingClientRect();
  composer.style.setProperty("--catch-x", `${rect.left}px`);
  composer.style.setProperty("--catch-y", `${rect.top}px`);
  composer.dataset.catchX = String(Math.round(rect.left));
  composer.dataset.catchY = String(Math.round(rect.top));
}

function bindPotterWithdrawRecovery(composer) {
  if (!composer || withdrawRecoveryBound) return;
  withdrawRecoveryBound = true;

  composer.addEventListener(
    "mousedown",
    (event) => {
      if (!composer.classList.contains("is-withdraw-shift")) return;

      event.preventDefault();
      withdrawClickCount += 1;

      const totalOffset = Number(composer.dataset.withdrawOffset || 0);
      const remainingClicks = WITHDRAW_CLICKS_TO_RECOVER - withdrawClickCount;

      if (remainingClicks <= 0) {
        composer.classList.add("is-withdraw-pop");
        clearPotterWithdrawShift(composer);
        window.setTimeout(() => {
          composer.classList.remove("is-withdraw-pop");
        }, 420);

        const input = getComposerInput(composer);
        if (input) {
          input.disabled = false;
          input.focus();
        }
        return;
      }

      const nextOffset = Math.round(
        (totalOffset * remainingClicks) / WITHDRAW_CLICKS_TO_RECOVER,
      );
      composer.style.setProperty("--withdraw-offset", `${nextOffset}px`);
      composer.classList.add("is-withdraw-nudge");
      window.setTimeout(() => {
        composer.classList.remove("is-withdraw-nudge");
      }, 180);
    },
    true,
  );
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
  withdrawClickCount = 0;
}

export function applyPotterWithdrawShift(composer) {
  if (!composer) return;

  ensureCatchCoordinates(composer);
  bindPotterWithdrawRecovery(composer);

  const width = composer.getBoundingClientRect().width;
  const offset = Math.round(width * WITHDRAW_HIDE_RATIO);
  composer.style.setProperty("--withdraw-offset", `${offset}px`);
  composer.dataset.withdrawOffset = String(offset);
  withdrawClickCount = 0;
  composer.classList.remove("is-withdraw-pop");
  composer.classList.add("is-withdraw-shift");
}

export function appendConversationEndDivider(chatPanel) {
  if (!chatPanel || chatPanel.querySelector(".chat-panel__conversation-end")) {
    return;
  }

  const divider = document.createElement("hr");
  divider.className = "chat-panel__conversation-end";
  divider.setAttribute("aria-hidden", "true");
  chatPanel.appendChild(divider);
}

export function clearConversationEndDivider(chatPanel) {
  chatPanel
    ?.querySelector(".chat-panel__conversation-end")
    ?.remove();
}

async function renderSilence(el, isCancelled, onScroll) {
  el.className = "chat-answer chat-answer--silence";
  el.replaceChildren();

  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.className = "potter-silence__dot";
    dot.style.setProperty("--i", String(index));
    el.appendChild(dot);
  }

  onScroll?.();
  await wait(SILENCE_DURATION_MS, isCancelled);
  el.classList.add("is-fading");
  await wait(420, isCancelled);
  el.remove();
}

async function renderShort(el, text, isCancelled, onScroll) {
  el.className = "chat-answer chat-answer--short";
  el.replaceChildren();

  const content = text.trim() || "…";
  [...content].forEach((char, index) => {
    const span = document.createElement("span");
    span.className = "potter-short__char";
    span.style.setProperty("--i", String(index));
    span.textContent = char === " " ? "\u00a0" : char;
    el.appendChild(span);
  });

  onScroll?.();
  await wait(Math.min(2400, 120 + content.length * 38), isCancelled);
}

async function renderHesitate(el, text, isCancelled, onScroll) {
  el.className = "chat-answer chat-answer--hesitate";
  el.replaceChildren();

  const content = text.trim() || "…";
  [...content].forEach((char, index) => {
    const span = document.createElement("span");
    span.className = "potter-hesitate__char";
    span.style.setProperty("--i", String(index));
    span.textContent = char === " " ? "\u00a0" : char;
    el.appendChild(span);
  });

  onScroll?.();
  await wait(Math.min(3200, 400 + content.length * 62), isCancelled);
}

async function renderWithdraw(el, composer, text, isCancelled, onScroll) {
  el.className = "chat-answer chat-answer--withdraw";
  el.textContent = text.trim() || WITHDRAW_LABEL;
  applyPotterWithdrawShift(composer);
  onScroll?.();
  await wait(700, isCancelled);
}

async function renderEnd(el, chatPanel, text, isCancelled, onScroll) {
  el.className = "chat-answer chat-answer--end";
  el.replaceChildren();

  if (text.trim()) {
    const farewell = document.createElement("p");
    farewell.className = "potter-end__farewell";
    farewell.textContent = text.trim();
    el.appendChild(farewell);
  }

  const label = document.createElement("p");
  label.className = "potter-end__label";
  label.textContent = END_LABEL;
  el.appendChild(label);

  appendConversationEndDivider(chatPanel);
  onScroll?.();
  await wait(480, isCancelled);
}

/**
 * @returns {Promise<boolean>} true when the action UI handled rendering
 */
export async function renderPotterActionAnswer({
  el,
  action,
  text,
  composer,
  chatPanel,
  isCancelled,
  onScroll,
}) {
  switch (action) {
    case "silence":
      await renderSilence(el, isCancelled, onScroll);
      return true;
    case "short":
      await renderShort(el, text, isCancelled, onScroll);
      return true;
    case "hesitate":
      await renderHesitate(el, text, isCancelled, onScroll);
      return true;
    case "withdraw":
      await renderWithdraw(el, composer, text, isCancelled, onScroll);
      return true;
    case "end":
      await renderEnd(el, chatPanel, text, isCancelled, onScroll);
      return true;
    case "respond":
    default:
      return false;
  }
}

export { WITHDRAW_LABEL, END_LABEL };
