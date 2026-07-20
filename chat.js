import { DEFAULT_HEADLINE } from "./headline-type.js";
import { appendRandomArchiveEntry } from "./archive-type.js";
import { getTomHeadline } from "./tom-mood.js";

const character = document.body.dataset.character || "Potter";
const thread = document.getElementById("chat-thread");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const headline = document.getElementById("chat-headline");
const composer = document.getElementById("chat-composer");

const replies = {
  Potter: [
    {
      text: "Another person who's miserable because of their boss. Can't say I'm surprised. Humans build organizations, organizations create managers, and managers create meetings. It's an impressively efficient way to manufacture problems.",
      reviseFrom: "impressively efficient way to manufacture problems",
      reviseTo: "impressively boring way to avoid real work",
    },
    {
      text: "Interesting. I'll keep it short — and slightly wrong on purpose.",
      reviseFrom: "slightly wrong on purpose",
      reviseTo: "exactly wrong, on purpose",
    },
  ],
  Rupin: [
    {
      text: "I don't want to talk now actually. Try again later.",
      reviseFrom: "Try again later",
      reviseTo: "Or don't. Either works for me",
    },
    {
      text: "That question assumes I care. Bold.",
      reviseFrom: "assumes I care",
      reviseTo: "assumes I owe you an answer",
    },
  ],
  Tom: [
    {
      text: "Logged. Don't expect comfort. Expect a useful contradiction.",
    },
    {
      text: "Noted. The answer exists. Whether you like it is optional.",
    },
  ],
};

const thinkingHeadlines = {
  Potter: "Thinking...",
  Rupin: "I don't want to talk now actually.",
  Tom: "Honestly, I'm not interested.",
};

const dockedHeadlines = {
  Potter: DEFAULT_HEADLINE,
  Rupin: "I am always confident with my knowledge.",
  Tom: "Honestly, I'm not interested.",
};

const TYPE_MS = 12;
const CENSOR_HOLD_MS = 1600;
const REVISE_TYPE_MS = 22;
const ERASE_HOLD_MS = 400;
const ERASE_CHAR_MS = 28;
const DOUBT_CHANCE = 0.85;
const ERASE_CHANCE = 0.45; // among doubted answers, erase instead of black-box revise

let replyIndex = 0;
/** @type {{ el: HTMLElement, text: string, reviseFrom?: string, reviseTo?: string, revised: boolean }[]} */
const answerHistory = [];

function scrollThreadToLatest() {
  requestAnimationFrame(() => {
    thread.scrollTop = thread.scrollHeight;
  });
}

function dockComposer() {
  if (document.body.classList.contains("chat-started")) return;

  document.body.classList.add("chat-started", "composer-locked");
  composer?.classList.add("is-locked");

  // Potter: keep the catch position where cursor met the composer
  const keepCatchPosition = character === "Potter";

  if (keepCatchPosition) {
    if (composer) {
      const catchX = composer.dataset.catchX;
      const catchY = composer.dataset.catchY;
      if (catchX != null && catchY != null) {
        composer.style.setProperty("--catch-x", `${catchX}px`);
        composer.style.setProperty("--catch-y", `${catchY}px`);
        composer.style.left = `${catchX}px`;
        composer.style.top = `${catchY}px`;
      }
      composer.classList.add("is-catch-locked", "chat-panel__composer--runaway");
    }
    if (input) input.disabled = false;
    return;
  }

  // Rupin/Tom: dock to bottom center after first send
  composer?.classList.remove("chat-panel__composer--runaway", "is-catch-locked");

  if (composer) {
    composer.style.left = "";
    composer.style.top = "";
    composer.style.width = "";
    composer.style.maxWidth = "";
    composer.style.removeProperty("--catch-x");
    composer.style.removeProperty("--catch-y");
  }

  if (input) input.disabled = false;
}

function appendQuestion(text) {
  const el = document.createElement("div");
  el.className = "chat-question";
  el.textContent = text;
  thread.appendChild(el);
  scrollThreadToLatest();
  return el;
}

function typeText(target, text, speed = TYPE_MS) {
  return new Promise((resolve) => {
    let index = 0;
    target.textContent = "";
    const timer = window.setInterval(() => {
      target.textContent += text[index];
      index += 1;
      scrollThreadToLatest();
      if (index >= text.length) {
        window.clearInterval(timer);
        resolve();
      }
    }, speed);
  });
}

function createCensor() {
  const censor = document.createElement("span");
  censor.className = "chat-censor";
  censor.setAttribute("aria-label", "not sure");

  const label = document.createElement("span");
  label.className = "chat-censor__label";
  label.textContent = "not sure......";
  censor.appendChild(label);
  return censor;
}

function pickDoubtSpan(text, reviseFrom) {
  if (reviseFrom && text.includes(reviseFrom)) {
    const start = text.indexOf(reviseFrom);
    return { start, end: start + reviseFrom.length, phrase: reviseFrom };
  }

  const words = text.split(" ");
  if (words.length < 6) return null;

  const startWord = Math.floor(words.length * 0.45);
  const endWord = Math.min(
    words.length,
    startWord + 4 + Math.floor(Math.random() * 3),
  );
  const phrase = words.slice(startWord, endWord).join(" ");
  const start = text.indexOf(phrase);
  if (start < 0) return null;
  return { start, end: start + phrase.length, phrase };
}

function splitAnswerAround(el, text, span) {
  const before = text.slice(0, span.start);
  const after = text.slice(span.end);

  el.textContent = "";

  const beforeNode = document.createElement("span");
  beforeNode.textContent = before;

  const afterNode = document.createElement("span");
  afterNode.textContent = after;

  el.append(beforeNode, afterNode);
  return { before, after, beforeNode, afterNode };
}

/** Show the full answer first — no censor yet. */
async function appendAnswer(reply) {
  const el = document.createElement("div");
  el.className = "chat-answer";
  thread.appendChild(el);

  const fullText = typeof reply === "string" ? reply : reply.text;
  await typeText(el, fullText);

  answerHistory.push({
    el,
    text: fullText,
    reviseFrom: reply.reviseFrom,
    reviseTo: reply.reviseTo,
    revised: false,
  });

  scrollThreadToLatest();
  return el;
}

/** Wipe a phrase left→right like an eraser stroke. Leaves blank space. */
async function erasePhraseInAnswer(prev, span) {
  const { before, after, beforeNode, afterNode } = splitAnswerAround(
    prev.el,
    prev.text,
    span,
  );

  const erase = document.createElement("span");
  erase.className = "chat-erase";
  erase.setAttribute("aria-label", "erased");

  [...span.phrase].forEach((char, index) => {
    const unit = document.createElement("span");
    unit.className = "chat-erase__char";
    unit.style.setProperty("--i", String(index));
    unit.textContent = char === " " ? "\u00a0" : char;
    erase.appendChild(unit);
  });

  prev.el.insertBefore(erase, afterNode);
  prev.el.classList.add("is-erasing");
  scrollThreadToLatest();

  await new Promise((r) => window.setTimeout(r, ERASE_HOLD_MS));
  erase.classList.add("is-wiping");

  const wipeMs = span.phrase.length * ERASE_CHAR_MS + 320;
  await new Promise((r) => window.setTimeout(r, wipeMs));

  // Keep a soft gap where the text used to be (eraser residue)
  const gap = document.createElement("span");
  gap.className = "chat-erase-gap";
  gap.style.width = `${Math.max(48, erase.getBoundingClientRect().width * 0.55)}px`;
  erase.replaceWith(gap);

  prev.text = `${before}${after}`;
  prev.revised = true;
  prev.el.classList.remove("is-erasing");
  scrollThreadToLatest();
}

/** Black-box "not sure......", then rewrite the covered phrase. */
async function censorAndReviseAnswer(prev, span) {
  const { before, after, beforeNode, afterNode } = splitAnswerAround(
    prev.el,
    prev.text,
    span,
  );
  const revised = prev.reviseTo || "something else entirely";

  const censor = createCensor();
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:pre;font:inherit;letter-spacing:inherit";
  probe.textContent = span.phrase;
  prev.el.appendChild(probe);
  const phraseWidth = Math.max(237, probe.getBoundingClientRect().width + 32);
  probe.remove();
  censor.style.minWidth = `${Math.round(phraseWidth)}px`;

  prev.el.insertBefore(censor, afterNode);
  prev.el.classList.add("is-doubting");
  scrollThreadToLatest();

  await new Promise((r) => window.setTimeout(r, CENSOR_HOLD_MS));

  censor.classList.add("is-revising");
  await new Promise((r) => window.setTimeout(r, 220));

  const revisedNode = document.createElement("span");
  revisedNode.className = "chat-answer__revised";
  censor.replaceWith(revisedNode);

  await typeText(revisedNode, revised, REVISE_TYPE_MS);

  prev.text = `${before}${revised}${after}`;
  prev.revised = true;
  prev.el.classList.remove("is-doubting");
  scrollThreadToLatest();
}

/**
 * When the user pushes back, either erase a disliked phrase
 * or cover it with "not sure......" and rewrite.
 */
async function revisePreviousAnswerOnPushback() {
  const prev = [...answerHistory].reverse().find((entry) => !entry.revised);
  if (!prev) return;
  if (Math.random() > DOUBT_CHANCE) return;

  const span = pickDoubtSpan(prev.text, prev.reviseFrom);
  if (!span) return;

  if (Math.random() < ERASE_CHANCE) {
    await erasePhraseInAnswer(prev, span);
    return;
  }

  await censorAndReviseAnswer(prev, span);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const message = input.value.trim();
  if (!message) {
    input.focus();
    return;
  }

  const isPushback = answerHistory.length > 0;

  dockComposer();
  appendQuestion(message);
  input.value = "";
  headline.classList.remove("is-wave", "is-typing");
  headline.textContent =
    character === "Tom"
      ? getTomHeadline()
      : thinkingHeadlines[character] || "Thinking...";

  const pool = replies[character] || replies.Potter;
  const answer = pool[replyIndex % pool.length];
  replyIndex += 1;

  window.setTimeout(async () => {
    // Potter/Rupin: on pushback, erase or rewrite the prior answer.
    // Tom: answers stay as-is — no censor / erase.
    if (isPushback && character !== "Tom") {
      await revisePreviousAnswerOnPushback();
    }

    await appendAnswer(answer);
    appendRandomArchiveEntry();
    headline.classList.remove("is-wave", "is-typing");
    headline.textContent =
      character === "Tom"
        ? getTomHeadline()
        : dockedHeadlines[character] || DEFAULT_HEADLINE;
    scrollThreadToLatest();
    input.focus();
  }, 450);
});
