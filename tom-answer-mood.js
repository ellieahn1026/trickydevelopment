import { getTomMood } from "./tom-mood.js";

const LINE_HEIGHT = 26;

let measureSpan = null;

function findSadArcStart(text) {
  let periodCount = 0;

  for (let i = 0; i < text.length - 1; i += 1) {
    if (text[i] === "." && text[i + 1] === " ") {
      periodCount += 1;
      if (periodCount === 2) {
        return i + 2;
      }
    }
  }

  const firstPeriod = text.indexOf(". ");
  if (firstPeriod > 0) {
    return firstPeriod + 2;
  }

  const target = Math.floor(text.length * 0.45);
  let idx = target;
  while (idx > 0 && text[idx] !== " ") {
    idx -= 1;
  }

  return idx > 0 ? idx + 1 : target;
}

function getMeasureSpan(el) {
  if (!measureSpan) {
    measureSpan = document.createElement("span");
    measureSpan.className = "chat-answer__sad-measure";
    measureSpan.setAttribute("aria-hidden", "true");
  }

  if (measureSpan.parentElement !== el) {
    el.appendChild(measureSpan);
  }

  return measureSpan;
}

function measureChar(el, char) {
  const span = getMeasureSpan(el);
  span.textContent = char;
  return span.getBoundingClientRect().width;
}

function getAnswerMaxWidth(el) {
  const thread = el.closest(".chat-panel__thread");
  const threadWidth = thread?.clientWidth ?? 640;
  return Math.max(280, Math.floor(threadWidth * 0.92));
}

function droopRotation(index, arcStart, lineIndex, arcLineIndex) {
  if (index < arcStart) {
    return 0;
  }

  const linePastArc = lineIndex - arcLineIndex;
  const charPastArc = index - arcStart;

  return Math.min(7, linePastArc * 2 + charPastArc * 0.012);
}

function layoutSadText(el, text, maxWidth, arcStart) {
  const chars = [...text];
  const widths = chars.map((char) => measureChar(el, char));
  const positions = [];

  let x = 0;
  let y = 0;
  let lineIndex = 0;
  let arcLineIndex = 0;

  for (let i = 0; i < chars.length; i += 1) {
    const width = widths[i];

    if (x + width > maxWidth && x > 0) {
      x = 0;
      y += LINE_HEIGHT;
      lineIndex += 1;
    }

    if (i === arcStart) {
      arcLineIndex = lineIndex;
    }

    positions.push({
      x,
      y,
      rot: droopRotation(i, arcStart, lineIndex, arcLineIndex),
      width,
    });

    x += width;
  }

  return positions;
}

function computePathBounds(positions, maxWidth) {
  let maxX = 0;
  let maxY = LINE_HEIGHT;

  for (const pos of positions) {
    const rotPad = Math.abs(pos.rot) * 1.6;
    maxX = Math.max(maxX, pos.x + pos.width + rotPad);
    maxY = Math.max(maxY, pos.y + LINE_HEIGHT + rotPad);
  }

  return {
    width: Math.ceil(Math.min(maxWidth + 4, maxX + 8)),
    height: Math.ceil(maxY + 10),
  };
}

function createSadArcStructure(el, text) {
  const arcStart = findSadArcStart(text);
  const maxWidth = getAnswerMaxWidth(el);
  const positions = layoutSadText(el, text, maxWidth, arcStart);
  const bounds = computePathBounds(positions, maxWidth);

  el.classList.add("chat-answer--sad-arc");
  el.replaceChildren();

  const pathWrap = document.createElement("span");
  pathWrap.className = "chat-answer__sad-path";
  pathWrap.style.width = `${bounds.width}px`;
  pathWrap.style.minHeight = `${bounds.height}px`;
  el.style.minHeight = `${bounds.height}px`;
  el.appendChild(pathWrap);

  return { pathWrap, positions, text };
}

function appendSadPathChar(pathWrap, char, position) {
  const span = document.createElement("span");
  span.className = "chat-answer__char chat-answer__char--sad";
  span.textContent = char === " " ? "\u00a0" : char;

  const { x, y, rot } = position;
  const rad = (rot * Math.PI) / 180;
  const slide = 4;
  const startX = x - (rot === 0 ? slide : Math.cos(rad) * slide);
  const startY = y - (rot === 0 ? 0 : Math.sin(rad) * slide);

  span.style.transform = `translate(${startX.toFixed(2)}px, ${startY.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
  pathWrap.appendChild(span);

  requestAnimationFrame(() => {
    span.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
  });

  return span;
}

function splitAnswerTokens(text) {
  return text.match(/\S+|\s+/g) ?? [];
}

function wrapHappyDance(el, text) {
  el.classList.add("chat-answer--happy-dance");
  el.replaceChildren();

  let wordIndex = 0;

  for (const token of splitAnswerTokens(text)) {
    if (/^\s+$/.test(token)) {
      el.append(token.replace(/ /g, "\u00a0"));
      continue;
    }

    const span = document.createElement("span");
    span.className = "chat-answer__word chat-answer__word--dance";
    span.style.setProperty("--i", String(wordIndex));
    span.textContent = token;
    el.appendChild(span);
    wordIndex += 1;
  }
}

function typeTomSadAnswer(el, text, speed, token, { isCancelled, onScroll, onTimer }) {
  const { pathWrap, positions } = createSadArcStructure(el, text);

  return new Promise((resolve, reject) => {
    let index = 0;

    const tick = () => {
      if (isCancelled(token)) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      appendSadPathChar(pathWrap, text[index], positions[index]);
      index += 1;
      onScroll?.();

      if (index >= text.length) {
        resolve();
        return;
      }

      onTimer(window.setTimeout(tick, speed));
    };

    onTimer(window.setTimeout(tick, speed));
  });
}

function isTomSadAnswerTyping(mood = getTomMood()) {
  return document.body.dataset.character === "Tom" && mood === "sad";
}

function applyTomAnswerMood(el, text, mood = getTomMood()) {
  if (document.body.dataset.character !== "Tom") {
    return;
  }

  if (mood === "happy") {
    wrapHappyDance(el, text);
  }
}

export {
  applyTomAnswerMood,
  isTomSadAnswerTyping,
  typeTomSadAnswer,
};
