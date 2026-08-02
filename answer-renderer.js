import { parseAnswerSegments } from "./lib/answer-segments.ts";
import {
  normalizeAnswerText,
  renderAnswerMarkdown,
  renderFormattedLines,
} from "./answer-markdown.js";

/**
 * @param {import("./lib/answer-segments.ts").AnswerSegment[]} segments
 */
export function hasRenderableAnnotationSegments(segments) {
  return segments.some((segment) => segment.type === "annotation");
}

/**
 * @param {string} text
 * @param {import("./lib/assistant-result.ts").Annotation[]} [annotations]
 */
export function buildAnswerSegments(text, annotations = []) {
  return parseAnswerSegments(text, annotations);
}

/**
 * @param {HTMLElement} el
 * @param {string} text
 * @param {import("./lib/assistant-result.ts").Annotation[]} [annotations]
 */
export function renderAnswer(el, text, annotations = []) {
  const segments = buildAnswerSegments(text, annotations);

  if (!hasRenderableAnnotationSegments(segments)) {
    renderAnswerMarkdown(el, text);
    return segments;
  }

  el.classList.add("chat-answer--formatted", "chat-answer--segmented");
  el.replaceChildren(renderAnswerElement(segments));
  return segments;
}

/**
 * @param {import("./lib/answer-segments.ts").AnswerSegment[]} segments
 */
export function renderAnswerElement(segments) {
  const container = document.createElement("div");
  container.className = "chat-answer__segments";

  let paragraph = null;
  let pendingLines = [];

  const flushPendingText = () => {
    if (!pendingLines.length) return;
    renderFormattedLines(pendingLines, (node) => {
      container.appendChild(node);
    });
    pendingLines = [];
  };

  for (const segment of segments) {
    if (segment.type === "text") {
      const normalized = normalizeAnswerText(segment.content);
      if (normalized) {
        pendingLines.push(...normalized.split("\n"));
      }
      continue;
    }

    flushPendingText();
    if (!paragraph) {
      paragraph = document.createElement("p");
      container.appendChild(paragraph);
    }
    paragraph.appendChild(renderSegment(segment));
    paragraph = null;
  }

  flushPendingText();
  return container;
}

/**
 * @param {import("./lib/answer-segments.ts").AnswerSegment} segment
 */
export function renderSegment(segment) {
  if (segment.type === "text") {
    return renderTextSegment(segment);
  }

  return renderAnnotationSegment(segment);
}

/**
 * @param {import("./lib/answer-segments.ts").TextSegment} segment
 */
export function renderTextSegment(segment) {
  const el = document.createElement("span");
  el.className = "answer-text-segment";
  renderInlineTextContent(el, segment.content);
  return el;
}

/**
 * @param {import("./lib/answer-segments.ts").AnnotationSegment} segment
 */
export function renderAnnotationSegment(segment) {
  switch (segment.annotation.action) {
    case "replace":
      return renderReplaceAnnotation(segment);
    case "redact":
      return renderRedactAnnotation(segment);
    case "hide":
      return renderHideAnnotation(segment);
    default:
      return renderReplaceAnnotation(segment);
  }
}

/**
 * @param {import("./lib/answer-segments.ts").AnnotationSegment} segment
 */
export function renderReplaceAnnotation(segment) {
  const replacement = segment.annotation.replacement?.trim();

  const el = document.createElement("span");
  el.className =
    "replace replace-annotation answer-annotation answer-annotation--replace";
  el.dataset.state = "idle";
  el.dataset.annotationId = segment.annotation.id;
  el.dataset.annotationAction = "replace";
  el.dataset.annotationSource = segment.annotation.source;
  el.title = segment.annotation.reason;

  if (!replacement) {
    renderInlineTextContent(el, segment.content);
    return el;
  }

  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-expanded", "false");
  el.setAttribute(
    "aria-label",
    `Show replacement for "${segment.content}". ${segment.annotation.reason}`,
  );

  const stack = document.createElement("span");
  stack.className = "replace-stack";

  const lead = document.createElement("span");
  lead.className = "replace-lead";

  const replacementEl = document.createElement("span");
  replacementEl.className = "replace-replacement";
  replacementEl.setAttribute("aria-hidden", "true");
  renderInlineTextContent(replacementEl, replacement);

  const originalInline = document.createElement("span");
  originalInline.className = "replace-original-inline";
  renderInlineTextContent(originalInline, segment.content);

  lead.append(replacementEl, originalInline);

  const panel = document.createElement("span");
  panel.className = "replace-original-panel";
  panel.setAttribute("aria-hidden", "true");

  const panelInner = document.createElement("span");
  panelInner.className = "replace-original-panel__inner";

  const label = document.createElement("span");
  label.className = "replace-original-label";
  label.textContent = "Original";

  const originalText = document.createElement("span");
  originalText.className = "replace-original-text";
  renderInlineTextContent(originalText, segment.content);

  panelInner.append(label, originalText);
  panel.append(panelInner);
  stack.append(lead, panel);
  el.append(stack);

  bindReplaceAnnotationInteraction(el);
  return el;
}


const REPLACE_TRANSITION_MS = 360;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function scheduleAnnotationReveal(el) {
  el.classList.add("annotation--pending");

  if (prefersReducedMotion()) {
    el.classList.add("annotation--revealed");
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add("annotation--revealed");
    });
  });
}

function stabilizeReplaceLeadHeight(lead) {
  if (!lead || prefersReducedMotion()) return () => {};

  const startHeight = lead.getBoundingClientRect().height;
  lead.style.minHeight = `${startHeight}px`;

  let frame = 0;
  const measure = () => {
    frame = 0;
    const nextHeight = lead.getBoundingClientRect().height;
    if (nextHeight > startHeight) {
      lead.style.minHeight = `${nextHeight}px`;
    }
  };

  if (typeof requestAnimationFrame === "function") {
    frame = requestAnimationFrame(measure);
  } else {
    measure();
  }

  const release = () => {
    if (frame && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frame);
    }
    lead.style.minHeight = "";
  };

  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    window.setTimeout(release, REPLACE_TRANSITION_MS);
  } else {
    release();
  }
  return release;
}

/**
 * @param {HTMLElement} el
 */
export function activateReplaceAnnotation(el) {
  if (el.dataset.state === "active") return false;
  if (!el.querySelector(".replace-replacement")) return false;

  const lead = el.querySelector(".replace-lead");
  const releaseLeadHeight = lead ? stabilizeReplaceLeadHeight(lead) : () => {};

  el.dataset.state = "active";
  el.classList.add("replace-annotation--active");
  el.setAttribute("aria-expanded", "true");

  const replacement = el.querySelector(".replace-replacement");
  replacement?.setAttribute("aria-hidden", "false");

  const panel = el.querySelector(".replace-original-panel");
  panel?.setAttribute("aria-hidden", "false");

  const originalInline = el.querySelector(".replace-original-inline");
  originalInline?.setAttribute("aria-hidden", "true");

  if (lead && !prefersReducedMotion()) {
    const onPanelTransitionEnd = (event) => {
      if (event.target !== panel) return;
      releaseLeadHeight();
      panel?.removeEventListener("transitionend", onPanelTransitionEnd);
    };
    panel?.addEventListener("transitionend", onPanelTransitionEnd);
  } else {
    releaseLeadHeight();
  }

  return true;
}

/**
 * @param {HTMLElement} el
 */
function bindReplaceAnnotationInteraction(el) {
  const activate = () => {
    activateReplaceAnnotation(el);
  };

  el.addEventListener("click", activate);
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
}

/**
 * @param {import("./lib/answer-segments.ts").AnnotationSegment} segment
 */
export function renderRedactAnnotation(segment) {
  const el = document.createElement("span");
  el.className = "redacted answer-annotation answer-annotation--redact";
  el.dataset.annotationId = segment.annotation.id;
  el.dataset.annotationAction = "redact";
  el.dataset.annotationSource = segment.annotation.source;
  el.setAttribute(
    "aria-label",
    `${segment.annotation.reason}: ${segment.content}`,
  );
  el.title = segment.annotation.reason;

  const label = document.createElement("span");
  label.className = "redacted-label";
  label.setAttribute("aria-hidden", "true");
  label.textContent = "Not sure...";

  const content = document.createElement("span");
  content.className = "redacted-content";
  content.setAttribute("aria-hidden", "true");
  renderInlineTextContent(content, segment.content);

  el.append(label, content);
  scheduleAnnotationReveal(el);
  return el;
}

/**
 * @param {string} content
 */
export function isBlockHideContent(content) {
  if (!content) return false;
  if (content.includes("\n\n")) return true;
  if (content.includes("\n")) return true;
  if (/^\s*(?:#{1,3}\s+|[-*+]\s+|\d+[.)]\s+)/m.test(content)) {
    return true;
  }
  return content.length > 120;
}

/**
 * @param {import("./lib/answer-segments.ts").AnnotationSegment} segment
 */
export function renderHideAnnotation(segment) {
  const isBlock = isBlockHideContent(segment.content);

  const el = document.createElement("span");
  el.className = [
    "hidden",
    "hidden-annotation",
    "answer-annotation",
    "answer-annotation--hide",
    isBlock ? "hidden-annotation--block" : "hidden-annotation--inline",
  ].join(" ");
  el.dataset.annotationId = segment.annotation.id;
  el.dataset.annotationAction = "hide";
  el.dataset.annotationSource = segment.annotation.source;
  el.dataset.hideMode = isBlock ? "block" : "inline";
  el.setAttribute(
    "aria-label",
    `${segment.annotation.reason}: ${segment.content}`,
  );
  el.title = segment.annotation.reason;

  const content = document.createElement("span");
  content.className = "hidden-content";
  content.setAttribute("aria-hidden", "true");
  renderInlineTextContent(content, segment.content);

  const overlay = document.createElement("span");
  overlay.className = "hidden-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "hidden-label";
  label.textContent = "Not sure...";

  const body = document.createElement("span");
  body.className = "hidden-overlay__body";

  overlay.append(label, body);
  el.append(content, overlay);
  scheduleAnnotationReveal(el);
  return el;
}

function renderInlineTextContent(target, content) {
  if (!content) return;

  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) {
      target.appendChild(document.createElement("br"));
    }
    appendInlineMarkdown(target, line);
  });
}
