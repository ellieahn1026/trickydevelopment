const SHAKE_MS = 130;
const DETACH_JITTER_MS = 45;
const SETTLE_MS = 220;
const BUCKET_COUNT = 96;

const pileState = {
  el: null,
  fallLayer: null,
  buckets: new Map(),
};

function getOrCreatePile() {
  if (pileState.el?.isConnected) return pileState.el;

  const pile = document.createElement("div");
  pile.className = "letter-pile";
  pile.setAttribute("aria-hidden", "true");
  document.querySelector(".screen")?.appendChild(pile);
  pileState.el = pile;
  return pile;
}

function getOrCreateFallLayer() {
  if (pileState.fallLayer?.isConnected) return pileState.fallLayer;

  getOrCreatePile();
  const layer = document.createElement("div");
  layer.className = "letter-fall-layer";
  layer.setAttribute("aria-hidden", "true");
  document.querySelector(".screen")?.appendChild(layer);
  pileState.fallLayer = layer;
  return layer;
}

function indexWords(phrase) {
  const words = [];
  const re = /\S+/g;
  let match = re.exec(phrase);
  while (match) {
    words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    match = re.exec(phrase);
  }
  return words;
}

/** Mix of long clauses, medium phrases, whole words — not only tiny shards. */
function splitPhraseIntoFallUnits(phrase) {
  const words = indexWords(phrase);
  if (words.length === 0) return [phrase];
  if (words.length === 1) {
    const word = words[0].text;
    if (word.length > 10) {
      const mid = Math.ceil(word.length / 2);
      return [phrase.slice(0, mid), phrase.slice(mid)];
    }
    return [phrase];
  }

  const units = [];
  let index = 0;

  while (index < words.length) {
    const remaining = words.length - index;
    const roll = Math.random();
    let take;

    if (remaining >= 5 && roll < 0.42) {
      take = Math.min(remaining, 4 + Math.floor(Math.random() * 4));
    } else if (remaining >= 3 && roll < 0.72) {
      take = Math.min(remaining, 2 + Math.floor(Math.random() * 2));
    } else if (remaining >= 2 && roll < 0.88) {
      take = 2;
    } else {
      take = 1;
    }

    const start = words[index].start;
    const sliceEnd =
      index + take >= words.length ? phrase.length : words[index + take].start;
    const chunk = phrase.slice(start, sliceEnd);

    if (chunk.trim()) {
      units.push(chunk);
    }

    index += take;
  }

  return units;
}

function buildScrapeMarkup(text) {
  const fragment = document.createDocumentFragment();

  for (const unitText of splitPhraseIntoFallUnits(text)) {
    const unit = document.createElement("span");
    unit.className = "chat-scrape__unit";
    if (unitText.trim().length > 12 || unitText.trim().split(/\s+/).length >= 3) {
      unit.classList.add("chat-scrape__unit--chunk");
    }
    unit.textContent = unitText;
    fragment.appendChild(unit);
  }

  return fragment;
}

function prepareAnswerTextForScrape(textWrap, text) {
  textWrap.textContent = "";
  textWrap.classList.add("chat-scrape-text");
  textWrap.appendChild(buildScrapeMarkup(text));
}

function getPileBounds(pile) {
  const pileRect = pile.getBoundingClientRect();
  const thread = document.querySelector(".chat-panel__thread");
  const threadRect = thread?.getBoundingClientRect();

  if (!threadRect || threadRect.width <= 0) {
    return {
      left: pileRect.left,
      right: pileRect.right,
      top: pileRect.top,
      bottom: pileRect.bottom,
      width: pileRect.width,
      height: pileRect.height,
    };
  }

  return {
    left: threadRect.left,
    right: threadRect.right,
    top: pileRect.top,
    bottom: pileRect.bottom,
    width: threadRect.width,
    height: pileRect.height,
  };
}

function clampX(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function bucketIndexForX(x, pileWidth) {
  const clamped = Math.max(0, Math.min(pileWidth - 1, x));
  return Math.min(BUCKET_COUNT - 1, Math.floor((clamped / pileWidth) * BUCKET_COUNT));
}

function bucketHeight(bucket) {
  return pileState.buckets.get(bucket) ?? 0;
}

function totalBucketFill() {
  let total = 0;
  for (const height of pileState.buckets.values()) {
    total += height;
  }
  return total;
}

function raiseBucket(bucket) {
  const next = bucketHeight(bucket) + 1;
  pileState.buckets.set(bucket, next);
  return next;
}

function findLowestNearbyBucket(originBucket) {
  const stackPressure = totalBucketFill();
  const radius = 6 + Math.min(28, Math.floor(stackPressure * 0.35 + 8));
  let minHeight = Infinity;
  const candidates = [];

  for (let offset = -radius; offset <= radius; offset += 1) {
    const candidate = originBucket + offset;
    if (candidate < 0 || candidate >= BUCKET_COUNT) continue;

    const height = bucketHeight(candidate);
    if (height < minHeight) {
      minHeight = height;
      candidates.length = 0;
      candidates.push(candidate);
    } else if (height === minHeight) {
      candidates.push(candidate);
    }
  }

  const bucket =
    candidates[Math.floor(Math.random() * candidates.length)] ?? originBucket;

  return { bucket, stackLayer: minHeight };
}

/** Land across the thread width; prefer low stacks and spread as the pile grows. */
function resolveLanding(pileBounds, pieceWidth, pieceHeight, sourceRect) {
  const minX = pileBounds.left;
  const maxX = pileBounds.right - pieceWidth;
  const innerWidth = Math.max(pileBounds.width - pieceWidth, 1);
  const bucketWidth = innerWidth / BUCKET_COUNT;
  const pileFill = totalBucketFill();
  const spreadFactor = Math.min(0.88, 0.34 + pileFill * 0.055);

  const sourceCenter = sourceRect.left + sourceRect.width / 2;
  const sourceNorm = clampX(sourceCenter - pileBounds.left, 0, innerWidth) / innerWidth;
  const randomNorm = Math.random();
  const targetNorm = sourceNorm * (1 - spreadFactor) + randomNorm * spreadFactor;
  const targetCenter = pileBounds.left + targetNorm * innerWidth;

  const originBucket = bucketIndexForX(targetCenter - pileBounds.left, innerWidth);
  const { bucket } = findLowestNearbyBucket(originBucket);

  const bucketCenter = pileBounds.left + bucket * bucketWidth + bucketWidth * 0.5;
  const spreadRange = bucketWidth * (1.1 + spreadFactor * 2.8 + Math.random() * 0.9);
  const landX = clampX(
    bucketCenter - pieceWidth / 2 + (Math.random() - 0.5) * spreadRange * 2,
    minX,
    maxX,
  );

  const stackLayer = raiseBucket(bucket);

  const layerHeight = Math.max(pieceHeight * 0.34, 7);
  const floorY = pileBounds.bottom - 6;
  const landY = floorY - pieceHeight - stackLayer * layerHeight;

  const slideX =
    (Math.random() - 0.5) * (18 + spreadFactor * 46 + stackLayer * 2.5);
  const slideY = 1 + Math.random() * 5 + stackLayer * 0.28;

  return { landX, landY, slideX, slideY, stackLayer, spreadFactor };
}

function gravityFallKeyframes(startX, startY, endX, endY, spin, skew, swayX) {
  const offsets = [0, 0.14, 0.3, 0.5, 0.68, 0.84, 0.94, 1];
  return offsets.map((t) => {
    const easedY = t * t;
    const driftX = swayX * t * (1 - t);
    const x = startX + (endX - startX) * t + driftX;
    const y = startY + (endY - startY) * easedY;
    const settleBlend = Math.max(0, (t - 0.94) / 0.06);
    const landX = x + (endX - x) * settleBlend;
    const landY = y + (endY - y) * settleBlend;

    return {
      left: `${landX}px`,
      top: `${landY}px`,
      transform: `rotate(${spin * t}deg) skewX(${skew * t}deg)`,
      opacity: t < 1 ? 1 : 0.94,
      offset: t,
    };
  });
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function commitPieceToPile(piece, pile, landX, landY, spin, skew) {
  piece.getAnimations().forEach((active) => {
    active.commitStyles?.();
    active.cancel();
  });

  const settledBounds = getPileBounds(pile);

  piece.classList.remove("letter-pile__piece--falling");
  piece.style.position = "absolute";
  piece.style.left = `${landX - settledBounds.left}px`;
  piece.style.top = `${landY - settledBounds.top}px`;
  piece.style.transform = `rotate(${spin}deg) skewX(${skew}deg)`;
  piece.style.opacity = "0.92";
  piece.style.zIndex = "";
  pile.appendChild(piece);
}

async function spawnFallingPiece(unit, sourceRect, { delayMs = 0 } = {}) {
  const pile = getOrCreatePile();
  const fallLayer = getOrCreateFallLayer();
  const piece = document.createElement("span");
  piece.className = "letter-pile__piece letter-pile__piece--falling";
  if (unit.classList.contains("chat-scrape__unit--chunk")) {
    piece.classList.add("letter-pile__piece--chunk");
  }
  piece.textContent = unit.textContent;

  const style = window.getComputedStyle(unit);
  piece.style.fontFamily = style.fontFamily;
  piece.style.fontSize = style.fontSize;
  piece.style.fontWeight = style.fontWeight;
  piece.style.letterSpacing = style.letterSpacing;
  piece.style.lineHeight = style.lineHeight;
  piece.style.color = style.color;

  const startX = sourceRect.left;
  const startY = sourceRect.top;
  piece.style.left = `${startX}px`;
  piece.style.top = `${startY}px`;
  piece.style.visibility = "hidden";

  fallLayer.appendChild(piece);

  const pieceRect = piece.getBoundingClientRect();
  const pileBounds = getPileBounds(pile);
  const { landX, landY, slideX, slideY, spreadFactor } = resolveLanding(
    pileBounds,
    pieceRect.width,
    pieceRect.height,
    sourceRect,
  );

  const endX = landX + slideX;
  const endY = landY + slideY;
  const dropY = endY - startY;
  const swayX = (Math.random() - 0.5) * (24 + spreadFactor * 52);
  const spin = (Math.random() - 0.5) * 48;
  const skew = (Math.random() - 0.5) * 8;
  const fallMs = 520 + Math.sqrt(Math.max(dropY, 80)) * 28 + Math.random() * 120;

  await waitForNextFrame();
  piece.style.visibility = "visible";

  return new Promise((resolve) => {
    const animation = piece.animate(
      gravityFallKeyframes(startX, startY, endX, endY, spin, skew, swayX),
      {
        duration: fallMs,
        delay: delayMs,
        easing: "linear",
        fill: "forwards",
      },
    );

    animation.onfinish = () => {
      commitPieceToPile(piece, pile, endX, endY, spin, skew);
      resolve();
    };
  });
}

function collectUnits(phraseEl) {
  return [...phraseEl.querySelectorAll(".chat-scrape__unit")].filter(
    (unit) => unit.dataset.scraped !== "true",
  );
}

/**
 * Shake the phrase loose, then pour all fragments down with gravity.
 */
async function scrapeFallPhrase(phraseEl, token, { wait, isAborted, onFrame }) {
  if (!phraseEl) return;

  getOrCreateFallLayer();
  const host = phraseEl.closest(".chat-answer");
  host?.classList.add("is-scrape-erasing");

  const units = collectUnits(phraseEl);
  if (units.length === 0) return;

  phraseEl.classList.add("is-dropping");
  onFrame?.();
  await wait(SHAKE_MS, token);
  if (isAborted(token)) throw new DOMException("Aborted", "AbortError");

  const fallPromises = units.map((unit, index) => {
    const rect = unit.getBoundingClientRect();
    unit.dataset.scraped = "true";
    unit.classList.add("is-scraped");
    unit.style.visibility = "hidden";

    const delayMs = index * 8 + Math.random() * DETACH_JITTER_MS;
    return spawnFallingPiece(unit, rect, { delayMs });
  });

  onFrame?.();
  await Promise.all(fallPromises);
  await wait(SETTLE_MS, token);

  phraseEl.classList.remove("is-dropping");
}

export {
  prepareAnswerTextForScrape,
  scrapeFallPhrase,
};
