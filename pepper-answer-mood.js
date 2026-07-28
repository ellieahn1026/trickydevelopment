import { getPepperMood } from "./pepper-mood.js";

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
  return Math.max(1, Math.ceil(el.getBoundingClientRect().width));
}

function getDroopProgress(index, arcStart, textLength) {
  if (index < arcStart) {
    return 0;
  }

  return Math.min(1, (index - arcStart) / Math.max(1, textLength - arcStart - 1));
}

function layoutSadText(el, text, maxWidth, arcStart) {
  const chars = [...text];
  const widths = chars.map((char) => measureChar(el, char));
  const positions = [];

  let x = 0;
  let y = 0;

  for (let i = 0; i < chars.length; i += 1) {
    const width = widths[i];

    if (x + width > maxWidth && x > 0) {
      x = 0;
      y += LINE_HEIGHT;
    }

    const progress = getDroopProgress(i, arcStart, chars.length);
    positions.push({
      x,
      y: y + 68 * progress * progress,
      rot: 20 * progress,
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

function measureStraightPositions(el, text) {
  const textNode = el.firstChild;
  const hostRect = el.getBoundingClientRect();
  let offset = 0;

  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    return [...text].map(() => ({ x: 0, y: 0 }));
  }

  return [...text].map((char) => {
    const range = document.createRange();
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset + char.length);
    const rect = range.getBoundingClientRect();
    offset += char.length;

    return {
      x: rect.left - hostRect.left,
      y: rect.top - hostRect.top,
    };
  });
}

function appendSadPathChar(pathWrap, char, position, startPosition, index) {
  const span = document.createElement("span");
  span.className = "chat-answer__char chat-answer__char--sad";
  span.textContent = char === " " ? "\u00a0" : char;
  span.style.setProperty("--i", String(index));
  span.style.transitionDelay = `${Math.min(index * 5, 450)}ms`;

  const { x, y, rot } = position;
  span.style.transform = `translate(${startPosition.x.toFixed(2)}px, ${startPosition.y.toFixed(2)}px) rotate(0deg)`;
  pathWrap.appendChild(span);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    span.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
  }));

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

function animateSadArc(el, text) {
  const straightPositions = measureStraightPositions(el, text);
  const { pathWrap, positions } = createSadArcStructure(el, text);

  [...text].forEach((char, index) => {
    appendSadPathChar(
      pathWrap,
      char,
      positions[index],
      straightPositions[index] ?? { x: 0, y: 0 },
      index,
    );
  });
}

function applyPepperAnswerMood(el, text, mood = getPepperMood()) {
  if (document.body.dataset.character !== "Pepper") {
    return;
  }

  if (mood === "happy") {
    wrapHappyDance(el, text);
  } else if (mood === "sad") {
    animateSadArc(el, text);
  }
}

export { applyPepperAnswerMood };
