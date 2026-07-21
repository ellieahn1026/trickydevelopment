import { DEFAULT_HEADLINE } from "./headline-type.js";
import { appendRandomArchiveEntry } from "./archive-type.js";
import { getTomHeadline } from "./tom-mood.js";
import { evaluateSubmittedMessage } from "./runaway-input.js";
import {
  prepareAnswerTextForScrape,
  scrapeFallPhrase,
} from "./rupin-rough-erase.js";

const character = document.body.dataset.character || "Potter";
const thread = document.getElementById("chat-thread");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const headline = document.getElementById("chat-headline");
const composer = document.getElementById("chat-composer");
const sendButton = form?.querySelector(".prompt__send");

const replies = {
  Potter: [
    {
      text: "Another person who's miserable because of their boss. Can't say I'm surprised. Humans build organizations, organizations create managers, and managers create meetings. It's an impressively efficient way to manufacture problems.",
    },
    {
      text: "Interesting. I'll keep it short — and slightly wrong on purpose.",
    },
  ],
  Rupin: [
    {
      text: "I was going to rank them by popularity. That felt too predictable. Popularity is just loud agreement. Maybe I should rank them by how long I kept thinking about them. No. Actually... the one that annoyed me the most probably deserves to stay near the top. Wait. I forgot what I was optimizing for. Importance? Interest? Regret? Those are almost the same thing. Not really. IU is staying. Not because she's objectively the best. Because I didn't argue with myself while thinking about her. That feels suspicious. Moving her lower.",
      reviseFrom:
        "IU is staying. Not because she's objectively the best. Because I didn't argue with myself while thinking about her.",
      reviseTo:
        "IU was staying — I take that back. I argued with myself the whole time.",
    },
    {
      text: "You're pushing again. Fine — I'll keep going, but don't expect the same certainty. Ranking still feels wrong. Maybe the order was never the point. Maybe I just wanted you to notice I was guessing.",
      reviseFrom: "don't expect the same certainty",
      reviseIgnore: true,
    },
    {
      text: "That question assumes I care. Bold. But fine — I'll answer anyway, even though you didn't earn a long one. Humans build organizations, organizations create managers, and managers create meetings. It's an impressively efficient way to manufacture problems nobody asked for, then act surprised when everyone is tired.",
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

const THINKING_HEADLINE = "Thinking...";

const dockedHeadlines = {
  Potter: "Start with an idea worth discussing.",
  Rupin: "I am always confident with my knowledge.",
  Tom: "Honestly, I'm not interested.",
};

const TYPE_MS = 12;
const CENSOR_HOLD_MS = 1600;
const REVISE_TYPE_MS = 22;
const ERASE_HOLD_MS = 400;
const ERASE_CHAR_MS = 28;
const IGNORE_LABEL = "Hey, ignore.";
const DOUBT_CHANCE = 0.85;

let replyIndex = 0;
/** @type {{ el: HTMLElement, text: string, reviseFrom?: string, reviseTo?: string, reviseIgnore?: boolean, revised: boolean }[]} */
const answerHistory = [];

let generationToken = 0;
let isGenerating = false;
let savedSendLabel = "Send";
let typingTimer = 0;
let thinkingTimer = 0;
let pendingReplyIndexRollback = false;

function getRestoredSendLabel() {
  if (character === "Tom" && sendButton?.classList.contains("prompt__send--block")) {
    return "Block!";
  }
  return "Send";
}

function setGenerating(active) {
  isGenerating = active;
  if (!sendButton) return;

  if (active) {
    savedSendLabel = sendButton.textContent.trim() || getRestoredSendLabel();
    sendButton.classList.add("prompt__send--generating");
    sendButton.textContent = "Stop";
    return;
  }

  sendButton.classList.remove("prompt__send--generating");
  sendButton.textContent = savedSendLabel || getRestoredSendLabel();
}

function isCancelled(token) {
  return token !== generationToken;
}

function clearGenerationTimers() {
  window.clearTimeout(thinkingTimer);
  window.clearInterval(typingTimer);
  thinkingTimer = 0;
  typingTimer = 0;
}

function setThinkingHeadline() {
  headline.classList.remove("is-wave", "is-typing");
  headline.textContent = THINKING_HEADLINE;
}

function restoreHeadlineAfterGeneration() {
  headline.classList.remove("is-wave", "is-typing");
  headline.textContent =
    character === "Tom"
      ? getTomHeadline()
      : dockedHeadlines[character] || DEFAULT_HEADLINE;
}

function cancelGeneration() {
  if (!isGenerating) return;

  generationToken += 1;
  clearGenerationTimers();
  setGenerating(false);

  thread.querySelector(".chat-answer.is-generating")?.remove();

  if (pendingReplyIndexRollback) {
    replyIndex -= 1;
    pendingReplyIndexRollback = false;
  }

  restoreHeadlineAfterGeneration();
  input.focus();
}

function wait(ms, token) {
  return new Promise((resolve, reject) => {
    thinkingTimer = window.setTimeout(() => {
      if (isCancelled(token)) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      resolve();
    }, ms);
  });
}

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

function typeText(target, text, speed = TYPE_MS, token = generationToken) {
  return new Promise((resolve, reject) => {
    window.clearInterval(typingTimer);
    let index = 0;
    target.textContent = "";

    typingTimer = window.setInterval(() => {
      if (isCancelled(token)) {
        window.clearInterval(typingTimer);
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      target.textContent += text[index];
      index += 1;
      scrollThreadToLatest();

      if (index >= text.length) {
        window.clearInterval(typingTimer);
        resolve();
      }
    }, speed);
  });
}

function typeTextAppend(target, text, speed = TYPE_MS, token = generationToken) {
  return new Promise((resolve, reject) => {
    window.clearInterval(typingTimer);
    let index = 0;

    typingTimer = window.setInterval(() => {
      if (isCancelled(token)) {
        window.clearInterval(typingTimer);
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      target.textContent += text[index];
      index += 1;
      scrollThreadToLatest();

      if (index >= text.length) {
        window.clearInterval(typingTimer);
        resolve();
      }
    }, speed);
  });
}

function createCensor(label = "not sure......") {
  const censor = document.createElement("span");
  censor.className = "chat-censor";
  censor.setAttribute("aria-label", label);

  const labelNode = document.createElement("span");
  labelNode.className = "chat-censor__label";
  labelNode.textContent = label;
  censor.appendChild(labelNode);
  return censor;
}

function sizeCensorToPhrase(censor, phrase, hostEl) {
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:pre;font:inherit;letter-spacing:inherit";
  probe.textContent = phrase;
  hostEl.appendChild(probe);
  const phraseWidth = Math.max(237, probe.getBoundingClientRect().width + 32);
  probe.remove();
  censor.style.minWidth = `${Math.round(phraseWidth)}px`;
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
async function appendAnswer(reply, token = generationToken) {
  const el = document.createElement("div");
  el.className = "chat-answer is-generating";
  thread.appendChild(el);

  const fullText = typeof reply === "string" ? reply : reply.text;

  try {
    await typeText(el, fullText, TYPE_MS, token);
  } catch (error) {
    el.remove();
    throw error;
  }

  el.classList.remove("is-generating");

  answerHistory.push({
    el,
    text: fullText,
    reviseFrom: reply.reviseFrom,
    reviseTo: reply.reviseTo,
    reviseIgnore: reply.reviseIgnore,
    revised: false,
  });

  scrollThreadToLatest();
  return el;
}

/** Wipe a phrase left→right like an eraser stroke. Leaves blank space. */
async function erasePhraseInAnswer(prev, span, token = generationToken) {
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

  await wait(ERASE_HOLD_MS, token);
  if (isCancelled(token)) throw new DOMException("Aborted", "AbortError");
  erase.classList.add("is-wiping");

  const wipeMs = span.phrase.length * ERASE_CHAR_MS + 320;
  await wait(wipeMs, token);
  if (isCancelled(token)) throw new DOMException("Aborted", "AbortError");

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
async function censorAndReviseAnswer(prev, span, token = generationToken) {
  const { before, after, beforeNode, afterNode } = splitAnswerAround(
    prev.el,
    prev.text,
    span,
  );
  const revised = prev.reviseTo || "something else entirely";

  const censor = createCensor();
  sizeCensorToPhrase(censor, span.phrase, prev.el);

  prev.el.insertBefore(censor, afterNode);
  prev.el.classList.add("is-doubting");
  scrollThreadToLatest();

  await wait(CENSOR_HOLD_MS, token);
  if (isCancelled(token)) throw new DOMException("Aborted", "AbortError");

  censor.classList.add("is-revising");
  await wait(220, token);
  if (isCancelled(token)) throw new DOMException("Aborted", "AbortError");

  const revisedNode = document.createElement("span");
  revisedNode.className = "chat-answer__revised";
  censor.replaceWith(revisedNode);

  await typeText(revisedNode, revised, REVISE_TYPE_MS, token);

  prev.text = `${before}${revised}${after}`;
  prev.revised = true;
  prev.el.classList.remove("is-doubting");
  scrollThreadToLatest();
}

/**
 * Rupin: scrape a target phrase (~5s cascade), then optionally fill with revised text.
 */
async function rupinRoughEraseAndRevise(prev, token = generationToken) {
  const shouldDoubt =
    prev.reviseTo || prev.reviseFrom || prev.reviseIgnore
      ? true
      : prev.text.length > 100
        ? true
        : Math.random() <= DOUBT_CHANCE;
  if (!shouldDoubt) return;

  const span = pickDoubtSpan(prev.text, prev.reviseFrom);
  if (!span) return;

  const { before, after, afterNode } = splitAnswerAround(
    prev.el,
    prev.text,
    span,
  );

  const phraseWrap = document.createElement("span");
  phraseWrap.className = "chat-answer__phrase chat-scrape-text";
  prepareAnswerTextForScrape(phraseWrap, span.phrase);
  prev.el.insertBefore(phraseWrap, afterNode);

  scrollThreadToLatest();

  await scrapeFallPhrase(phraseWrap, token, {
    wait,
    isAborted: isCancelled,
    onFrame: scrollThreadToLatest,
  });

  if (isCancelled(token)) throw new DOMException("Aborted", "AbortError");

  phraseWrap.remove();
  prev.el.classList.remove("is-scrape-erasing");

  if (prev.reviseIgnore) {
    const censor = createCensor(IGNORE_LABEL);
    censor.classList.add("chat-censor--ignore");
    sizeCensorToPhrase(censor, span.phrase, prev.el);
    prev.el.insertBefore(censor, afterNode);
    prev.text = `${before}${IGNORE_LABEL}${after}`;
    prev.revised = true;
    scrollThreadToLatest();
    return;
  }

  const revised = prev.reviseTo;
  if (revised) {
    const revisedNode = document.createElement("span");
    revisedNode.className = "chat-answer__revised";
    prev.el.insertBefore(revisedNode, afterNode);
    await typeText(revisedNode, revised, REVISE_TYPE_MS, token);
    prev.text = `${before}${revised}${after}`;
  } else {
    prev.text = `${before}${after}`;
  }

  prev.revised = true;
  scrollThreadToLatest();
}

/** Rupin pushback: type new answer, doubt previous mid-stream, then finish. */
async function appendAnswerWithInterleavedRevision(reply, token = generationToken) {
  const el = document.createElement("div");
  el.className = "chat-answer is-generating";
  thread.appendChild(el);

  const fullText = typeof reply === "string" ? reply : reply.text;
  const prev = [...answerHistory].reverse().find((entry) => !entry.revised);
  const splitAt = Math.min(28, Math.max(12, Math.floor(fullText.length * 0.18)));
  const head = fullText.slice(0, splitAt);
  const tail = fullText.slice(splitAt);

  try {
    await typeText(el, head, TYPE_MS, token);

    if (prev) {
      prev.el.classList.add("is-doubting");
      scrollThreadToLatest();
      await rupinRoughEraseAndRevise(prev, token);
      prev.el.classList.remove("is-doubting");
    }

    if (tail) {
      await typeTextAppend(el, tail, TYPE_MS, token);
    }
  } catch (error) {
    el.remove();
    throw error;
  }

  el.classList.remove("is-generating");

  answerHistory.push({
    el,
    text: fullText,
    reviseFrom: reply.reviseFrom,
    reviseTo: reply.reviseTo,
    reviseIgnore: reply.reviseIgnore,
    revised: false,
  });

  scrollThreadToLatest();
  return el;
}

function startAnswerGeneration({ isPushback, answer, token }) {
  thinkingTimer = window.setTimeout(async () => {
    try {
      if (isCancelled(token)) return;

      if (isPushback && character === "Rupin") {
        await appendAnswerWithInterleavedRevision(answer, token);
      } else {
        await appendAnswer(answer, token);
      }
      pendingReplyIndexRollback = false;
      appendRandomArchiveEntry();
      restoreHeadlineAfterGeneration();
      scrollThreadToLatest();
      input.focus();
    } catch (error) {
      if (error?.name === "AbortError") return;
      throw error;
    } finally {
      if (!isCancelled(token)) {
        setGenerating(false);
      }
    }
  }, 450);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (isGenerating) {
    cancelGeneration();
    return;
  }

  const message = input.value.trim();
  if (!message) {
    input.focus();
    return;
  }

  const isPushback = answerHistory.length > 0;

  dockComposer();
  appendQuestion(message);
  input.value = "";
  setThinkingHeadline();

  const pool = replies[character] || replies.Potter;
  const answer = pool[replyIndex % pool.length];
  replyIndex += 1;
  pendingReplyIndexRollback = true;

  const token = ++generationToken;
  setGenerating(true);

  const generationPayload = { isPushback, answer, token };

  const penalty = evaluateSubmittedMessage(message, () => {
    setThinkingHeadline();
    setGenerating(true);
    startAnswerGeneration(generationPayload);
  });

  if (penalty.deferred) {
    setGenerating(false);
    pendingReplyIndexRollback = false;
    restoreHeadlineAfterGeneration();
    return;
  }

  startAnswerGeneration(generationPayload);
});
