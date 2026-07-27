import { DEFAULT_HEADLINE } from "./headline-type.js";
import {
  applyMood,
  getTomHeadline,
  getTomMood,
  getTomSendLabel,
  handleTomPet,
} from "./tom-mood.js";
import { applyTomAnswerMood } from "./tom-answer-mood.js";
import { evaluateSubmittedMessage, startConversationEndRunaway } from "./runaway-input.js";
import {
  clearPotterWithdrawShift,
  clearConversationEndDivider,
  renderPotterActionAnswer,
  WITHDRAW_LABEL,
} from "./potter-action-ui.js";
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

/** @type {Record<string, string>} */
const previousResponseIds = {};

const THINKING_HEADLINE = "Thinking...";

const dockedHeadlines = {
  Potter: "Start with an idea worth discussing.",
  Rupin: "I am always confident with my knowledge.",
  Tom: "What do you want to talk about?",
};

const TYPE_MS = 12;
const CENSOR_HOLD_MS = 1600;
const REVISE_TYPE_MS = 22;
const ERASE_HOLD_MS = 400;
const ERASE_CHAR_MS = 28;
const IGNORE_LABEL = "Hey, ignore.";
const DOUBT_CHANCE = 0.85;
const RESPONSE_MOODS = new Set(["happy", "sad", "common"]);

/** @type {{ el: HTMLElement, text: string, mood?: "happy" | "sad" | "common", reviseFrom?: string, reviseTo?: string, reviseIgnore?: boolean, revised: boolean }[]} */
const answerHistory = [];

let generationToken = 0;
let isGenerating = false;
let savedSendLabel = "Send";
let typingTimer = 0;
let thinkingTimer = 0;
/** @type {AbortController | null} */
let fetchController = null;

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

  console.log("[potter agent]", {
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
  if (character === "Tom") {
    return getTomSendLabel();
  }
  return "Send";
}

function isTomInputBlocked() {
  return character === "Tom" && getTomMood() === "tired";
}

function focusInputIfEnabled() {
  if (input && !input.disabled) {
    input.focus();
  }
}

function setGenerating(active) {
  isGenerating = active;
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
  headline.textContent =
    character === "Tom"
      ? getTomHeadline()
      : dockedHeadlines[character] || DEFAULT_HEADLINE;
}

function cancelGeneration() {
  if (!isGenerating) return;

  generationToken += 1;
  fetchController?.abort();
  fetchController = null;
  clearGenerationTimers();
  setGenerating(false);

  thread.querySelector(".chat-answer.is-generating")?.remove();

  restoreHeadlineAfterGeneration();
  focusInputIfEnabled();
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
    if (input) input.disabled = isTomInputBlocked();
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

  if (input) input.disabled = isTomInputBlocked();
}

function appendQuestion(text) {
  const el = document.createElement("div");
  el.className = "chat-question";
  el.textContent = text;
  thread.appendChild(el);
  scrollThreadToLatest();
  return el;
}

function mountAnswerLoadingDots(el) {
  el.replaceChildren();
  el.classList.add("chat-answer--loading");
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.className = "chat-loading__dot";
    dot.style.setProperty("--i", String(index));
    el.appendChild(dot);
  }
}

function clearAnswerLoadingState(el) {
  el.classList.remove("chat-answer--loading");
}

function appendInlineMarkdown(target, text) {
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    target.append(document.createTextNode(text.slice(cursor, index)));

    const token = match[0];
    const node = document.createElement(token.startsWith("**") ? "strong" : "code");
    node.textContent = token.startsWith("**")
      ? token.slice(2, -2)
      : token.slice(1, -1);
    target.appendChild(node);
    cursor = index + token.length;
  }

  target.append(document.createTextNode(text.slice(cursor)));
}

function renderAnswerMarkdown(el, text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const fragment = document.createDocumentFragment();
  let paragraphLines = [];
  let list = null;
  let codeLines = null;
  let codeLanguage = "";

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const paragraph = document.createElement("p");
    appendInlineMarkdown(paragraph, paragraphLines.join("\n"));
    fragment.appendChild(paragraph);
    paragraphLines = [];
  };

  const closeList = () => {
    list = null;
  };

  lines.forEach((line) => {
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      closeList();

      if (codeLines) {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        if (codeLanguage) code.dataset.language = codeLanguage;
        code.textContent = codeLines.join("\n");
        pre.appendChild(code);
        fragment.appendChild(pre);
        codeLines = null;
        codeLanguage = "";
      } else {
        codeLines = [];
        codeLanguage = fence[1];
      }
      return;
    }

    if (codeLines) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      return;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      closeList();
      fragment.appendChild(document.createElement("hr"));
      return;
    }

    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const node = document.createElement(`h${heading[1].length + 2}`);
      appendInlineMarkdown(node, heading[2]);
      fragment.appendChild(node);
      return;
    }

    const item = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
    if (item) {
      flushParagraph();
      const tag = item[2] ? "ol" : "ul";
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = document.createElement(tag);
        fragment.appendChild(list);
      }
      const listItem = document.createElement("li");
      appendInlineMarkdown(listItem, item[3]);
      list.appendChild(listItem);
      return;
    }

    closeList();
    paragraphLines.push(line);
  });

  if (codeLines) {
    paragraphLines.push(`\`\`\`${codeLanguage}`, ...codeLines);
  }
  flushParagraph();

  el.classList.add("chat-answer--formatted");
  el.replaceChildren(fragment);
}

function hasStructuredAnswer(text) {
  return (
    text.includes("\n") ||
    /^\s*(?:#{1,3}\s+|[-*+]\s+|\d+[.)]\s+|```)/m.test(text)
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
  if (
    character === "Tom" &&
    !isStructured &&
    answerMood &&
    answerMood !== "common"
  ) {
    applyTomAnswerMood(el, fullText, answerMood);
  } else {
    renderAnswerMarkdown(el, fullText);
  }

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

function parseServerSentEvent(block) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data || data === "[DONE]") return null;
  return JSON.parse(data);
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

function parseStructuredChatAnswer(rawJson) {
  let result;

  try {
    result = JSON.parse(rawJson);
  } catch {
    throw createRetryableChatError(
      "Chat response was not valid structured JSON.",
      "invalid_structured_json",
    );
  }

  if (
    !result ||
    typeof result.answer !== "string" ||
    !RESPONSE_MOODS.has(result.mood)
  ) {
    throw createRetryableChatError(
      "Chat response did not match the required mood schema.",
      "invalid_mood_schema",
    );
  }

  return {
    text: stripMoodLabel(result.answer),
    mood: result.mood,
  };
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

  const response = await fetch("/api/chat", {
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
  const isPotterJsonResponse =
    character === "Potter" && !contentType.includes("text/event-stream");

  if (isPotterJsonResponse || contentType.includes("application/json")) {
    const result = await response.json();
    logPotterAgentState(result);

    if (character === "Potter") {
      potterAgentState = result.state;
      potterMessages.push({ role: "user", content: message });
      if (typeof result.text === "string" && result.text.trim()) {
        potterMessages.push({ role: "assistant", content: result.text });
      } else if (result.action === "silence") {
        potterMessages.push({ kind: "behavior", action: "silence" });
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

  const handleEvent = (block) => {
    const payload = parseServerSentEvent(block);
    if (!payload) return;

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
      completed = true;
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

  if (!completed) {
    throw createRetryableChatError(
      "Chat response stream ended before completion.",
      "stream_interrupted",
    );
  }

  if (!text.trim()) {
    throw new Error("Chat response was empty.");
  }

  const answer = parseStructuredChatAnswer(text);

  if (responseId) {
    previousResponseIds[character] = responseId;
  }

  return answer;
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
  mountAnswerLoadingDots(el);
  scrollThreadToLatest();

  try {
    const answer = await fetchChatReplyWithRetry(
      message,
      token,
      (_delta, partialAnswer) => {
        if (partialAnswer == null) return;
        clearAnswerLoadingState(el);
        el.textContent = partialAnswer;
        scrollThreadToLatest();
      },
      () => {
        mountAnswerLoadingDots(el);
      },
    );

    clearAnswerLoadingState(el);
    el.classList.remove("is-generating");

    if (character === "Potter" && answer.action && answer.action !== "respond") {
      await renderPotterActionAnswer({
        el,
        action: answer.action,
        text: answer.text,
        composer,
        chatPanel: document.querySelector(".chat-panel"),
        isCancelled: () => isCancelled(token),
        onScroll: scrollThreadToLatest,
      });

      if (answer.action === "silence") {
        return { el, conversationEnded: false };
      }

      const recordText =
        answer.action === "withdraw"
          ? answer.text?.trim() || WITHDRAW_LABEL
          : answer.action === "end"
            ? answer.text || "conversation end."
            : answer.text;

      answerHistory.push({
        el,
        text: recordText,
        mood: "common",
        revised: false,
      });

      if (answer.action === "end") {
        handlePotterConversationEnd(answer);
        return { el, conversationEnded: true };
      }

      return { el, conversationEnded: false };
    }

    el.textContent = answer.text;

    const answerMood = answer.mood;
    el.dataset.answerMood = answerMood;
    const isStructured = hasStructuredAnswer(answer.text);

    if (character === "Tom") {
      applyMood(answerMood);
      if (!isStructured) {
        applyTomAnswerMood(el, answer.text, answerMood);
      }
    }

    if (character !== "Tom" || isStructured || answerMood === "common") {
      renderAnswerMarkdown(el, answer.text);
    }

    console.info("[chat] answer mood assigned", {
      character,
      mood: answerMood,
      uiMood:
        character === "Tom" ? document.body.dataset.tomMood ?? null : null,
    });

    if (isPushback && character === "Rupin") {
      const prev = [...answerHistory].reverse().find((entry) => !entry.revised);
      if (prev) {
        prev.el.classList.add("is-doubting");
        await rupinRoughEraseAndRevise(prev, token);
        prev.el.classList.remove("is-doubting");
      }
    }

    answerHistory.push({
      el,
      text: answer.text,
      mood: answerMood,
      revised: false,
    });

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

  if (isTomInputBlocked()) {
    handleTomPet();
    return;
  }

  const message = input.value.trim();
  if (!message) {
    focusInputIfEnabled();
    return;
  }

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
    setGenerating(false);
    restoreHeadlineAfterGeneration();
    return;
  }

  await runGeneration();
});
