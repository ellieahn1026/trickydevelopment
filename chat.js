import { setCharacterSpeaking } from "./character-icon-talk.js";
import { evaluateSubmittedMessage, startConversationEndRunaway } from "./runaway-input.js";
import {
  clearPotterWithdrawShift,
  clearConversationEndDivider,
  renderPotterActionAnswer,
  WITHDRAW_LABEL,
  END_LABEL,
  SILENCE_LABEL,
} from "./potter-action-ui.js";
import {
  prepareAnswerTextForScrape,
  scrapeFallPhrase,
} from "./rupin-rough-erase.js";
import { logInteraction } from "./interaction-log.js";
import {
  initF1Composer,
  notifyF1AnswerComplete,
  notifyF1GenerationCancelled,
  notifyF1MessageSubmit,
} from "./f1-composer-ui.js";
import { hasStructuredAnswer } from "./answer-markdown.js";
import {
  buildAnswerSegments,
  hasRenderableAnnotationSegments,
  renderAnswer,
} from "./answer-renderer.js";
import {
  createAssistantMessageId,
  parseAssistantResult,
  validateAssistantPayload,
} from "./lib/assistant-result.ts";
import { fetchLocalApi } from "./lib/resolve-local-api.ts";
import {
  findSpanInText,
  mergeRupinSelfRevisionPlans,
  resolveRupinPushbackPlan,
  resolveRupinSelfRevisionPlans,
} from "./lib/rupin-pushback.ts";
import {
  resolveRupinPushbackFallbackPlan,
  resolveRupinSelfFallbackPlans,
} from "./lib/rupin-fallback.ts";
import potterLoadingIcon from "./assets/icons/potter-loading.svg";

const character = document.body.dataset.character || "Potter";
const isF1 = character === "F1";
const thread = document.getElementById("chat-thread");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const headline = document.getElementById("chat-headline");
const composer = document.getElementById("chat-composer");
const sendButton = form?.querySelector(".prompt__send");

/** @type {Record<string, string>} */
const previousResponseIds = {};

const THINKING_HEADLINE = "Thinking...";

const dockedHeadlines = {
  Potter: "Start with an idea worth discussing.",
  Rupin: "I am always confident with my knowledge.",
  Pepper: "What do you want to talk about?",
  F1: "I know everything. Just Ask and Believe.",
};

const TYPE_MS = 12;
const CENSOR_HOLD_MS = 1600;
const REVISE_TYPE_MS = 22;
const ERASE_HOLD_MS = 400;
const ERASE_CHAR_MS = 28;
const IGNORE_LABEL = "Just Ignore.";

/** @type {import("./lib/assistant-result.ts").ValidatedAssistantPayload["validation"]} */
const EMPTY_ASSISTANT_VALIDATION = {
  uncertainty: null,
  revision: null,
  annotations: [],
};

/**
 * @type {Array<{
 *   id: string;
 *   responseId: string | null;
 *   el: HTMLElement;
 *   text: string;
 *   mood?: "happy" | "sad" | "common";
 *   assistantResult: import("./lib/assistant-result.ts").AssistantResult;
 *   validation: import("./lib/assistant-result.ts").ValidatedAssistantPayload["validation"];
 *   reviseFrom?: string;
 *   reviseTo?: string;
 *   reviseIgnore?: boolean;
 *   revised: boolean;
 * }>}
 */
const answerHistory = [];

let generationToken = 0;
let isGenerating = false;
let savedSendLabel = "Send";
let typingTimer = 0;
let thinkingTimer = 0;
/** @type {AbortController | null} */
let fetchController = null;

/** @type {HTMLElement | null} */
let lastQuestionEl = null;

/** @type {unknown | undefined} */
let potterAgentState;

/** @type {{ role: "user" | "assistant"; content: string }[]} */
const potterMessages = [];

const INITIAL_POTTER_AGENT_STATE = {
  willingness: 0.7,
  fatigue: 0.2,
  interest: 0.55,
  distance: 0.25,
  conversationOpen: true,
  turnCount: 0,
  lastAction: "respond",
};

function resetPotterAgentState() {
  potterAgentState = { ...INITIAL_POTTER_AGENT_STATE };
}

function handlePotterConversationEnd(answer) {
  logInteraction("potter.conversation.end", {
    text: answer.text?.trim().slice(0, 120) ?? "",
  });

  startConversationEndRunaway(() => {
    resetPotterAgentState();
    clearConversationEndDivider(document.querySelector(".chat-panel"));
    clearPotterWithdrawShift(composer);
    if (answer.text?.trim()) {
      potterMessages.push({
        kind: "behavior",
        action: "end",
        note: answer.text.trim().slice(0, 200),
      });
    }
    document.body.classList.add("composer-locked");
    composer?.classList.add("is-locked", "is-catch-locked");
    restoreHeadlineAfterGeneration();
    focusInputIfEnabled();
  });
}

function logPotterAgentState(result) {
  if (character !== "Potter") return;
  if (!result || typeof result !== "object") return;

  logInteraction("potter.agent", {
    action: result.action,
    evaluation: result.evaluation,
    state: result.state,
  });

  window.__POTTER_AGENT__ = {
    action: result.action,
    evaluation: result.evaluation,
    state: result.state,
  };
}

function getRestoredSendLabel() {
  return "Send";
}

function focusInputIfEnabled() {
  if (input && !input.disabled) {
    input.focus();
  }
}

let characterSpeakingStarted = false;

function beginCharacterSpeaking() {
  if (characterSpeakingStarted) return;
  characterSpeakingStarted = true;
  setCharacterSpeaking(true);
}

function stopCharacterSpeaking() {
  characterSpeakingStarted = false;
  setCharacterSpeaking(false);
}

function setGenerating(active) {
  isGenerating = active;
  if (!active) {
    stopCharacterSpeaking();
  }
  if (!sendButton) return;

  if (active) {
    savedSendLabel = sendButton.textContent.trim() || getRestoredSendLabel();
    sendButton.classList.add("prompt__send--generating");
    sendButton.textContent = "Stop";
    sendButton.disabled = false;
    return;
  }

  sendButton.classList.remove("prompt__send--generating");
  sendButton.textContent = getRestoredSendLabel();
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
  headline.textContent = dockedHeadlines[character] || DEFAULT_HEADLINE;
}

function cancelGeneration() {
  if (!isGenerating) return;

  logInteraction("generation.cancel");

  generationToken += 1;
  fetchController?.abort();
  fetchController = null;
  clearGenerationTimers();
  setGenerating(false);

  thread.querySelector(".chat-answer.is-generating")?.remove();

  restoreHeadlineAfterGeneration();
  focusInputIfEnabled();
  if (isF1) notifyF1GenerationCancelled();
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

  // Rupin/Pepper/F1: dock to bottom center after first send
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
  lastQuestionEl = el;
  scrollThreadToLatest();
  return el;
}

function createAnswerLoadingIcon() {
  const wrap = document.createElement("span");
  wrap.className = "chat-answer__loading";

  const icon = document.createElement("img");
  icon.className = "chat-loading__icon";
  icon.src = potterLoadingIcon;
  icon.alt = "";
  icon.width = 180;
  icon.height = 110;
  icon.decoding = "async";
  icon.setAttribute("aria-hidden", "true");
  wrap.appendChild(icon);
  return wrap;
}

function mountAnswerLoadingIndicator(el) {
  el.replaceChildren();
  el.classList.add("chat-answer--loading");

  if (character === "Potter" || character === "Rupin") {
    el.appendChild(createAnswerLoadingIcon());
    return;
  }

  const wrap = document.createElement("span");
  wrap.className = "chat-answer__loading chat-answer__loading--dots";
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.className = "chat-loading__dot";
    dot.style.setProperty("--i", String(index));
    wrap.appendChild(dot);
  }
  el.appendChild(wrap);
}

function clearAnswerLoadingState(el) {
  el.classList.remove("chat-answer--loading");
}

function answerHasAnnotationSegments(text, annotations = []) {
  return hasRenderableAnnotationSegments(
    buildAnswerSegments(text, annotations),
  );
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
      if (index === 0) {
        beginCharacterSpeaking();
      }
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
      if (index === 0) {
        beginCharacterSpeaking();
      }
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

function measurePhraseBox(hostEl, phrase, insertBefore) {
  const probe = document.createElement("span");
  probe.className = "chat-phrase-measure";
  probe.setAttribute("aria-hidden", "true");
  probe.textContent = phrase;
  hostEl.insertBefore(probe, insertBefore);

  const rect = probe.getBoundingClientRect();
  probe.remove();

  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  };
}

function applyPhraseCoverSize(cover, box) {
  cover.style.width = `${Math.round(box.width)}px`;
  cover.style.height = `${Math.round(box.height)}px`;
}

function fitIgnoreLabelToCover(cover) {
  const label = cover.querySelector(".chat-ignore-cover__label");
  if (!label) return;

  label.style.transform = "translate(-50%, -50%)";

  requestAnimationFrame(() => {
    if (!cover.isConnected || !label.isConnected) return;

    const coverWidth = cover.clientWidth;
    const coverHeight = cover.clientHeight;
    const labelWidth = label.scrollWidth;
    const labelHeight = label.scrollHeight;
    if (coverWidth <= 0 || coverHeight <= 0 || labelWidth <= 0 || labelHeight <= 0) {
      return;
    }

    const scale = Math.min(1, coverWidth / labelWidth, coverHeight / labelHeight);
    label.style.transform =
      scale < 1
        ? `translate(-50%, -50%) scale(${scale})`
        : "translate(-50%, -50%)";
  });
}

function createIgnoreCover(phrase, hostEl, insertBefore) {
  const cover = document.createElement("span");
  cover.className = "chat-ignore-cover";
  cover.setAttribute("aria-label", IGNORE_LABEL);
  applyPhraseCoverSize(
    cover,
    measurePhraseBox(hostEl, phrase, insertBefore),
  );

  const label = document.createElement("span");
  label.className = "chat-ignore-cover__label";
  label.setAttribute("aria-hidden", "true");
  label.textContent = IGNORE_LABEL;
  cover.appendChild(label);

  return cover;
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
async function appendAnswer(reply, token = generationToken, answerMood = null) {
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

  const isStructured = hasStructuredAnswer(fullText);
  const annotations = typeof reply === "object" ? reply.annotations ?? [] : [];
  renderAnswer(el, fullText, annotations);

  answerHistory.push(
    createAssistantHistoryEntry({
      el,
      text: fullText,
      reviseFrom: reply.reviseFrom,
      reviseTo: reply.reviseTo,
      reviseIgnore: reply.reviseIgnore,
    }),
  );

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

async function rupinCoverPhraseAfterFall(
  prev,
  span,
  createCover,
  token,
  buildStoredText,
) {
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

  const cover = createCover(span.phrase, prev.el, afterNode);
  cover.classList.add("is-revealed");
  prev.el.insertBefore(cover, afterNode);
  fitIgnoreLabelToCover(cover);
  prev.text = buildStoredText(before, after);
  prev.revised = true;
  scrollThreadToLatest();
}

async function rupinRedactPhrase(prev, span, token = generationToken) {
  await rupinCoverPhraseAfterFall(
    prev,
    span,
    createIgnoreCover,
    token,
    (before, after) => `${before}${after}`,
  );
}

async function rupinIgnorePhrase(prev, span, token = generationToken) {
  await rupinCoverPhraseAfterFall(
    prev,
    span,
    createIgnoreCover,
    token,
    (before, after) => `${before}${after}`,
  );
}

async function rupinIgnoreFullAnswer(prev, token = generationToken) {
  const text = prev.text.trim();

  if (text) {
    const phraseWrap = document.createElement("span");
    phraseWrap.className = "chat-answer__phrase chat-scrape-text";
    prepareAnswerTextForScrape(phraseWrap, text);
    prev.el.replaceChildren(phraseWrap);
    prev.el.classList.add("is-scrape-erasing");
    scrollThreadToLatest();

    await scrapeFallPhrase(phraseWrap, token, {
      wait,
      isAborted: isCancelled,
      onFrame: scrollThreadToLatest,
    });

    if (isCancelled(token)) throw new DOMException("Aborted", "AbortError");

    phraseWrap.remove();
    prev.el.classList.remove("is-scrape-erasing");
  }

  prev.el.classList.add("chat-answer--fully-ignored");
  prev.el.replaceChildren();

  const panel = document.createElement("div");
  panel.className = "chat-answer__ignore-panel";

  const label = document.createElement("span");
  label.className = "chat-answer__ignore-label";
  label.textContent = IGNORE_LABEL;
  panel.appendChild(label);
  prev.el.appendChild(panel);

  prev.text = IGNORE_LABEL;
  prev.revised = true;
  scrollThreadToLatest();
}

async function rupinReplacePhrase(prev, span, replacement, token = generationToken) {
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

  const revisedNode = document.createElement("span");
  revisedNode.className = "chat-answer__revised";
  prev.el.insertBefore(revisedNode, afterNode);
  await typeText(revisedNode, replacement, REVISE_TYPE_MS, token);

  prev.text = `${before}${replacement}${after}`;
  prev.revised = true;
  scrollThreadToLatest();
}

function spanForPlan(entry, plan) {
  return (
    findSpanInText(entry.text, plan.matchedPhrase) ??
    findSpanInText(entry.text, plan.from)
  );
}

async function rupinApplyPlan(entry, plan, token = generationToken) {
  if (plan.mode === "ignore-full") {
    await rupinIgnoreFullAnswer(entry, token);
    return;
  }

  const span = spanForPlan(entry, plan);
  if (!span) return;

  switch (plan.mode) {
    case "redact":
      await rupinRedactPhrase(entry, span, token);
      break;
    case "ignore-span":
      await rupinIgnorePhrase(entry, span, token);
      break;
    case "replace":
      if (plan.replacement?.trim()) {
        await rupinReplacePhrase(entry, span, plan.replacement, token);
      } else {
        await rupinRedactPhrase(entry, span, token);
      }
      break;
  }
}

async function rupinApplySelfRevisions(
  entry,
  annotations,
  userMessage = "",
  token = generationToken,
) {
  const annotationPlans = resolveRupinSelfRevisionPlans(annotations, entry.text);
  const fallbackPlans = resolveRupinSelfFallbackPlans(entry.text, { userMessage });
  const plans = mergeRupinSelfRevisionPlans(
    annotationPlans,
    fallbackPlans,
    entry.text,
  );

  if (fallbackPlans.length > 0 && plans.length > annotationPlans.length) {
    logInteraction("rupin.fallback.self", {
      planCount: plans.length - annotationPlans.length,
      totalPlans: plans.length,
      annotationPlans: annotationPlans.length,
    });
  }
  if (plans.length === 0) return;

  entry.el.classList.add("is-doubting");
  scrollThreadToLatest();

  try {
    for (const plan of plans) {
      await rupinApplyPlan(entry, plan, token);
      if (isCancelled(token)) throw new DOMException("Aborted", "AbortError");
    }
    entry.revised = true;
  } finally {
    entry.el.classList.remove("is-doubting");
  }
}

/**
 * Rupin pushback: apply revision annotations to the prior answer.
 */
async function rupinHandlePushback(
  prev,
  annotations,
  userMessage = "",
  token = generationToken,
) {
  let plan = resolveRupinPushbackPlan(annotations, prev.text);
  if (!plan && userMessage.trim()) {
    plan = resolveRupinPushbackFallbackPlan(prev.text, userMessage);
    if (plan) {
      logInteraction("rupin.fallback.pushback", { mode: plan.mode });
    }
  }
  if (!plan) return;

  prev.el.classList.add("is-doubting");
  scrollThreadToLatest();

  try {
    await rupinApplyPlan(prev, plan, token);
  } finally {
    prev.el.classList.remove("is-doubting");
  }
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
      const annotations =
        typeof reply === "object" ? reply.annotations ?? [] : [];
      await rupinHandlePushback(prev, annotations, token);
    }

    if (tail) {
      await typeTextAppend(el, tail, TYPE_MS, token);
    }
  } catch (error) {
    el.remove();
    throw error;
  }

  el.classList.remove("is-generating");

  answerHistory.push(
    createAssistantHistoryEntry({
      el,
      text: fullText,
      reviseFrom: reply.reviseFrom,
      reviseTo: reply.reviseTo,
      reviseIgnore: reply.reviseIgnore,
    }),
  );

  scrollThreadToLatest();
  return el;
}

function parseServerSentEvent(block) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data || data === "[DONE]") return null;
  return JSON.parse(data);
}

function findAssistantMessageById(messageId) {
  const trimmed = messageId?.trim();
  if (!trimmed) return undefined;

  return answerHistory.find(
    (entry) => entry.id === trimmed || entry.responseId === trimmed,
  );
}

function logAssistantValidation(validation, responseId) {
  if (validation.uncertainty && !validation.uncertainty.valid) {
    logInteraction("assistant.uncertainty.invalid", {
      responseId,
      reason: validation.uncertainty.reason,
    });
  }

  if (validation.revision && !validation.revision.valid) {
    logInteraction("assistant.revision.invalid", {
      responseId,
      reason: validation.revision.reason,
      resolvedMessageId: validation.revision.resolvedMessageId ?? null,
    });
  }

  for (const annotationValidation of validation.annotations ?? []) {
    if (!annotationValidation.valid) {
      logInteraction("assistant.annotation.invalid", {
        responseId,
        annotationId: annotationValidation.id,
        reason: annotationValidation.reason,
      });
    }
  }
}

function getPriorAssistantTexts() {
  return answerHistory.map((entry) => entry.text);
}

function parseAndValidateChatAnswer(rawJson) {
  const parsed = parseAssistantResult(rawJson);
  if (!parsed.answer.trim()) {
    throw createRetryableChatError(
      "Chat response was empty.",
      "empty_answer",
    );
  }

  const validated = validateAssistantPayload(
    parsed,
    findAssistantMessageById,
    { priorAssistantTexts: getPriorAssistantTexts() },
  );
  return validated;
}

function createAssistantHistoryEntry({
  el,
  text,
  mood = "common",
  responseId = null,
  assistantResult = null,
  validation = EMPTY_ASSISTANT_VALIDATION,
  revised = false,
  reviseFrom,
  reviseTo,
  reviseIgnore,
}) {
  const entry = {
    id: createAssistantMessageId(responseId),
    responseId,
    el,
    text,
    mood,
    assistantResult: assistantResult ?? {
      answer: text,
      annotations: [],
      uncertainty: null,
      revision: null,
    },
    validation,
    revised,
  };

  if (reviseFrom !== undefined) entry.reviseFrom = reviseFrom;
  if (reviseTo !== undefined) entry.reviseTo = reviseTo;
  if (reviseIgnore !== undefined) entry.reviseIgnore = reviseIgnore;

  return entry;
}

function stripMoodLabel(text, isPartial = false) {
  const cleaned = text.replace(
    /^\s*mood\s*:\s*(?:happy|sad|common)\s*/i,
    "",
  );

  if (cleaned !== text) {
    return cleaned;
  }

  if (isPartial) {
    const candidate = text.trimStart().toLowerCase();
    const moodLabels = ["mood: happy", "mood: sad", "mood: common"];
    if (candidate && moodLabels.some((label) => label.startsWith(candidate))) {
      return "";
    }
  }

  return text;
}

function createRetryableChatError(message, reason) {
  return Object.assign(new Error(message), {
    retryable: true,
    reason,
  });
}

function extractPartialAnswer(rawJson) {
  const match = /"answer"\s*:\s*"/.exec(rawJson);
  if (!match) return "";

  const start = match.index + match[0].length;
  let rawValue = "";
  let escaped = false;

  for (let index = start; index < rawJson.length; index += 1) {
    const char = rawJson[index];

    if (escaped) {
      rawValue += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      rawValue += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      break;
    }

    rawValue += char;
  }

  if (escaped) {
    rawValue = rawValue.slice(0, -1);
  }

  try {
    return stripMoodLabel(JSON.parse(`"${rawValue}"`), true);
  } catch {
    return null;
  }
}

async function fetchChatReply(message, token, onDelta) {
  fetchController?.abort();
  fetchController = new AbortController();

  const requestBody =
    character === "Potter"
      ? {
          character,
          message,
          messages: potterMessages,
          agentState: potterAgentState,
        }
      : {
          character,
          message,
          previousResponseId: previousResponseIds[character],
        };

  const response = await fetchLocalApi("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: fetchController.signal,
  });

  if (isCancelled(token)) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (!response.ok) {
    const raw = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      // Keep the original server text when the response is not JSON.
    }
    const message = payload?.error || raw || "Chat request failed.";
    if (response.status === 429 || response.status >= 500) {
      throw createRetryableChatError(message, `http_${response.status}`);
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const result = await response.json();
    logPotterAgentState(result);

    if (character === "Potter") {
      potterAgentState = result.state;
      potterMessages.push({ role: "user", content: message });
      if (typeof result.text === "string" && result.text.trim()) {
        potterMessages.push({ role: "assistant", content: result.text });
      } else if (result.action === "silence") {
        potterMessages.push({ role: "assistant", content: SILENCE_LABEL });
      }
    }

    return {
      text: typeof result.text === "string" ? result.text : "",
      mood: "common",
      action: result.action,
      state: result.state,
    };
  }

  if (!response.body) {
    throw new Error("Chat response stream was empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let responseId = "";
  let completed = false;
  let potterTurn = null;
  let potterComplete = null;

  const handleEvent = (block) => {
    const payload = parseServerSentEvent(block);
    if (!payload) return;

    if (payload.type === "potter.turn") {
      potterTurn = payload;
      if (character === "Potter") {
        potterAgentState = payload.state;
        logPotterAgentState(payload);
      }
      return;
    }

    if (payload.type === "potter.complete") {
      potterComplete = payload;
      if (character === "Potter") {
        potterAgentState = payload.state;
      }
      completed = true;
      return;
    }

    if (payload.type === "response.output_text.delta" && payload.delta) {
      text += payload.delta;
      onDelta?.(payload.delta, extractPartialAnswer(text));
      return;
    }

    if (payload.type === "response.created" && payload.response?.id) {
      responseId = payload.response.id;
      return;
    }

    if (payload.type === "response.completed") {
      responseId = payload.response?.id || responseId;
      if (character !== "Potter") {
        completed = true;
      }
      return;
    }

    if (payload.type === "response.incomplete") {
      const reason =
        payload.response?.incomplete_details?.reason || "unknown_reason";
      console.warn("[chat] response incomplete", {
        character,
        reason,
      });
      throw createRetryableChatError(
        `Chat response was incomplete: ${reason}`,
        reason,
      );
    }

    if (payload.type === "error" || payload.type === "response.failed") {
      throw new Error(
        payload.error?.message ||
          payload.response?.error?.message ||
          "Chat stream failed.",
      );
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.forEach(handleEvent);

    if (done) break;
    if (isCancelled(token)) {
      await reader.cancel();
      throw new DOMException("Aborted", "AbortError");
    }
  }

  if (buffer.trim()) {
    handleEvent(buffer);
  }

  if (character === "Potter") {
    if (!potterComplete) {
      throw createRetryableChatError(
        "Potter chat stream ended before completion.",
        "stream_interrupted",
      );
    }

    logPotterAgentState(potterComplete);
    potterMessages.push({ role: "user", content: message });

    let finalText = potterComplete.text ?? "";
    if (!finalText.trim() && text.trim()) {
      try {
        finalText = parseAssistantResult(text).answer;
      } catch {
        finalText = extractPartialAnswer(text) ?? "";
      }
    }

    if (finalText.trim()) {
      potterMessages.push({ role: "assistant", content: finalText });
    } else if (potterComplete.action === "silence") {
      potterMessages.push({ role: "assistant", content: SILENCE_LABEL });
    }

    return {
      text: finalText,
      mood: "common",
      action: potterComplete.action ?? potterTurn?.action,
      state: potterComplete.state ?? potterTurn?.state,
    };
  }

  if (!completed) {
    throw createRetryableChatError(
      "Chat response stream ended before completion.",
      "stream_interrupted",
    );
  }

  if (!text.trim()) {
    throw new Error("Chat response was empty.");
  }

  const validated = parseAndValidateChatAnswer(text);
  logAssistantValidation(validated.validation, responseId);

  if (responseId) {
    previousResponseIds[character] = responseId;
  }

  const messageId = createAssistantMessageId(responseId);

  return {
    text: validated.answer,
    mood: validated.mood,
    responseId: responseId || null,
    messageId,
    assistantResult: {
      answer: validated.answer,
      annotations: validated.annotations,
      uncertainty: validated.uncertainty,
      revision: validated.revision,
    },
    validation: validated.validation,
  };
}

async function fetchChatReplyWithRetry(message, token, onDelta, onRetry) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchChatReply(message, token, onDelta);
    } catch (error) {
      const retryable =
        error?.retryable === true || error instanceof TypeError;

      if (!retryable || attempt === 1 || isCancelled(token)) {
        throw error;
      }

      console.warn("[chat] retrying response", {
        character,
        attempt: attempt + 2,
        reason: error?.reason || "network_error",
      });
      onRetry?.();
    }
  }

  throw new Error("Chat request failed after retry.");
}

function appendErrorAnswer(message) {
  logInteraction("answer.error", { message });

  const el = document.createElement("div");
  el.className = "chat-answer chat-answer--error";
  el.textContent = message;
  thread.appendChild(el);
  scrollThreadToLatest();
}

async function appendStreamingAnswer(
  message,
  token,
  isPushback,
) {
  const el = document.createElement("div");
  el.className = "chat-answer is-generating";
  thread.appendChild(el);
  mountAnswerLoadingIndicator(el);
  scrollThreadToLatest();

  try {
    const answer = await fetchChatReplyWithRetry(
      message,
      token,
      (_delta, partialAnswer) => {
        if (partialAnswer == null) return;
        if (partialAnswer.trim()) {
          beginCharacterSpeaking();
        }
        clearAnswerLoadingState(el);
        el.textContent = partialAnswer;
        scrollThreadToLatest();
      },
      () => {
        stopCharacterSpeaking();
        mountAnswerLoadingIndicator(el);
      },
    );

    clearAnswerLoadingState(el);
    el.classList.remove("is-generating");

    if (character === "Potter" && answer.action && answer.action !== "respond") {
      logInteraction("potter.action", {
        action: answer.action,
        textLength: answer.text?.length ?? 0,
      });

      beginCharacterSpeaking();

      await renderPotterActionAnswer({
        el,
        action: answer.action,
        text: answer.text,
        questionEl: lastQuestionEl,
        isCancelled: () => isCancelled(token),
        onScroll: scrollThreadToLatest,
        renderText: (target, content) => renderAnswer(target, content),
      });

      const recordText =
        answer.action === "withdraw"
          ? answer.text?.trim() || WITHDRAW_LABEL
          : answer.action === "end"
            ? answer.text || END_LABEL
            : answer.action === "silence"
              ? SILENCE_LABEL
              : answer.text;

      answerHistory.push(
        createAssistantHistoryEntry({
          el,
          text: recordText,
          mood: "common",
        }),
      );

      if (answer.action === "end") {
        handlePotterConversationEnd(answer);
        return { el, conversationEnded: true };
      }

      return { el, conversationEnded: false };
    }

    if (answer.text?.trim()) {
      beginCharacterSpeaking();
    }
    el.textContent = answer.text;

    const answerMood = answer.mood;
    el.dataset.answerMood = answerMood;
    const annotations = answer.assistantResult?.annotations ?? [];

    if (character === "Rupin") {
      renderAnswer(el, answer.text, []);
      const currentEntry = { el, text: answer.text, revised: false };
      await rupinApplySelfRevisions(currentEntry, annotations, message, token);
      answer.text = currentEntry.text;
    } else {
      renderAnswer(el, answer.text, annotations);
    }

    logInteraction("answer.received", {
      mood: answerMood,
      messageId: answer.messageId,
      responseId: answer.responseId,
      hasUncertainty: Boolean(answer.assistantResult?.uncertainty),
      hasRevision: Boolean(answer.assistantResult?.revision),
      annotationCount: answer.assistantResult?.annotations?.length ?? 0,
      droppedAnnotationCount:
        answer.validation?.annotations?.filter((item) => !item.valid).length ??
        0,
      textLength: answer.text?.length ?? 0,
      isPushback,
    });

    if (isPushback && character === "Rupin") {
      const prev = [...answerHistory].reverse().find((entry) => !entry.revised);
      if (prev) {
        await rupinHandlePushback(
          prev,
          answer.assistantResult?.annotations ?? [],
          message,
          token,
        );
      }
    }

    answerHistory.push(
      createAssistantHistoryEntry({
        el,
        text: answer.text,
        mood: answerMood,
        responseId: answer.responseId,
        assistantResult: answer.assistantResult,
        validation: answer.validation,
      }),
    );

    return { el, conversationEnded: false };
  } catch (error) {
    el.remove();
    throw error;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isGenerating) {
    cancelGeneration();
    return;
  }

  const message = input.value.trim();
  if (!message) {
    focusInputIfEnabled();
    return;
  }

  logInteraction("message.submit", {
    message,
    isPushback: answerHistory.length > 0,
  });

  if (isF1) notifyF1MessageSubmit();

  if (character === "Potter") {
    clearPotterWithdrawShift(composer);
  }

  const isPushback = answerHistory.length > 0;

  dockComposer();
  appendQuestion(message);
  input.value = "";
  setThinkingHeadline();

  const token = ++generationToken;
  setGenerating(true);

  const runGeneration = async () => {
    try {
      if (isCancelled(token)) return;
      const result = await appendStreamingAnswer(message, token, isPushback);
      if (!result.conversationEnded) {
        if (isF1) {
          await notifyF1AnswerComplete();
        }
        restoreHeadlineAfterGeneration();
        focusInputIfEnabled();
      }
      scrollThreadToLatest();
    } catch (error) {
      if (error?.name === "AbortError") return;

      appendErrorAnswer(
        error instanceof Error
          ? error.message
          : "Something went wrong. Try again.",
      );
      if (isF1) {
        await notifyF1AnswerComplete();
      }
      restoreHeadlineAfterGeneration();
      focusInputIfEnabled();
    } finally {
      if (!isCancelled(token)) {
        setGenerating(false);
        fetchController = null;
      }
    }
  };

  const penalty = evaluateSubmittedMessage(message, () => {
    setThinkingHeadline();
    setGenerating(true);
    void runGeneration();
  });

  if (penalty.deferred) {
    logInteraction("penalty.deferred", { message });
    setGenerating(false);
    restoreHeadlineAfterGeneration();
    return;
  }

  await runGeneration();
});

if (isF1) {
  initF1Composer({
    composer,
    input,
    onTimeoutSubmit: () => form.requestSubmit(),
  });
}
