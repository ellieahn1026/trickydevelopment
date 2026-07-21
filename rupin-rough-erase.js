const COMPOSER_Z = 4;
const SHAKE_MS = 130;
const DETACH_JITTER_MS = 45;
const SETTLE_MS = 220;
const BUCKET_COUNT = 56;

const pileState = {
  el: null,
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

function raiseBucket(bucket) {
  const next = bucketHeight(bucket) + 1;
  pileState.buckets.set(bucket, next);
  return next;
}

function findLowestNearbyBucket(originBucket, stackLayer) {
  const radius = 1 + Math.min(6, Math.floor(stackLayer / 1.5));
  let bestBucket = originBucket;
  let bestHeight = bucketHeight(originBucket);

  for (let offset = -radius; offset <= radius; offset += 1) {
    const candidate = originBucket + offset;
    if (candidate < 0 || candidate >= BUCKET_COUNT) continue;

    const height = bucketHeight(candidate);
    if (height < bestHeight) {
      bestHeight = height;
      bestBucket = candidate;
    }
  }

  return { bucket: bestBucket, stackLayer: bestHeight };
}

/** Land under source; as pile grows, spill sideways and slide outward. */
function resolveLanding(pileBounds, pieceWidth, pieceHeight, sourceRect) {
  const minX = pileBounds.left;
  const maxX = pileBounds.right - pieceWidth;
  const innerWidth = Math.max(pileBounds.width - pieceWidth, 1);
  const sourceCenter = sourceRect.left + sourceRect.width / 2;
  const bucketWidth = innerWidth / BUCKET_COUNT;

  const originBucket = bucketIndexForX(sourceCenter - pileBounds.left, innerWidth);
  let originHeight = bucketHeight(originBucket);

  const { bucket, stackLayer: baseLayer } = findLowestNearbyBucket(
    originBucket,
    originHeight,
  );

  const spreadStrength = Math.min(1, baseLayer * 0.14 + originHeight * 0.08);
  const bucketCenter = pileBounds.left + bucket * bucketWidth + bucketWidth * 0.5;
  const spreadRange = bucketWidth * (0.35 + spreadStrength * 1.6);
  let landX = clampX(bucketCenter - pieceWidth / 2 + (Math.random() - 0.5) * spreadRange, minX, maxX);

  const stackLayer = raiseBucket(bucket);

  const layerHeight = Math.max(pieceHeight * 0.38, 8);
  const floorY = pileBounds.bottom - 6;
  const landY = floorY - pieceHeight - stackLayer * layerHeight;

  const pileCenter = pileBounds.left + innerWidth * 0.5;
  const outward = landX <= pileCenter ? -1 : 1;
  const slideX =
    outward * (10 + stackLayer * 5 + spreadStrength * 24) +
    (Math.random() - 0.5) * (8 + spreadStrength * 14);
  const slideY = 2 + Math.random() * 4 + stackLayer * 0.35;

  return { landX, landY, slideX, slideY, stackLayer };
}

function gravityPourKeyframes(dropY, spin, slideX, slideY, swayX) {
  const yAt = (t) => dropY * t * t;
  const xAt = (t) => swayX * t * t;
  const impactY = dropY;
  const impactX = swayX;

  return [
    { transform: "translate(0px, 0px) rotate(0deg)", opacity: 1, offset: 0 },
    {
      transform: `translate(${xAt(0.22)}px, ${yAt(0.22)}px) rotate(${spin * 0.08}deg)`,
      opacity: 1,
      offset: 0.22,
    },
    {
      transform: `translate(${xAt(0.48)}px, ${yAt(0.48)}px) rotate(${spin * 0.22}deg)`,
      opacity: 1,
      offset: 0.48,
    },
    {
      transform: `translate(${xAt(0.74)}px, ${yAt(0.74)}px) rotate(${spin * 0.45}deg)`,
      opacity: 1,
      offset: 0.74,
    },
    {
      transform: `translate(${impactX}px, ${impactY}px) rotate(${spin * 0.72}deg)`,
      opacity: 1,
      offset: 0.86,
    },
    {
      transform: `translate(${impactX + slideX}px, ${impactY + slideY}px) rotate(${spin}deg)`,
      opacity: 0.94,
      offset: 1,
    },
  ];
}

function spawnFallingPiece(unit, sourceRect, { delayMs = 0 } = {}) {
  const pile = getOrCreatePile();
  const piece = document.createElement("span");
  piece.className = "letter-pile__piece";
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
  piece.style.zIndex = String(COMPOSER_Z - 2);

  document.body.appendChild(piece);

  const pieceRect = piece.getBoundingClientRect();
  const pileBounds = getPileBounds(pile);
  const { landX, landY, slideX, slideY } = resolveLanding(
    pileBounds,
    pieceRect.width,
    pieceRect.height,
    sourceRect,
  );

  const dropY = landY - sourceRect.top;
  const swayX = (Math.random() - 0.5) * 8;
  const spin = (Math.random() - 0.5) * 40;
  const skew = (Math.random() - 0.5) * 6;
  const fallMs = 360 + Math.sqrt(Math.max(dropY, 80)) * 22 + Math.random() * 90;

  piece.style.left = `${sourceRect.left}px`;
  piece.style.top = `${sourceRect.top}px`;

  return new Promise((resolve) => {
    const animation = piece.animate(
      gravityPourKeyframes(dropY, spin, slideX, slideY, swayX),
      {
        duration: fallMs,
        delay: delayMs,
        easing: "linear",
        fill: "forwards",
      },
    );

    animation.onfinish = () => {
      piece.getAnimations().forEach((active) => active.cancel());

      const settledBounds = getPileBounds(pile);
      const finalX = landX + slideX;
      const finalY = landY + slideY;

      piece.style.position = "absolute";
      piece.style.left = `${finalX - settledBounds.left}px`;
      piece.style.top = `${finalY - settledBounds.top}px`;
      piece.style.transform = `rotate(${spin}deg) skewX(${skew}deg)`;
      piece.style.opacity = "0.92";
      piece.style.zIndex = "";
      pile.appendChild(piece);
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

  getOrCreatePile();
  const host = phraseEl.closest(".chat-answer");
  host?.classList.add("is-scrape-erasing");

  const units = collectUnits(phraseEl);
  if (units.length === 0) return;

  phraseEl.classList.add("is-dropping");
  onFrame?.();
  await wait(SHAKE_MS, token);
  if (isAborted(token)) throw new DOMException("Aborted", "AbortError");

  const fallPromises = units.map((unit) => {
    const rect = unit.getBoundingClientRect();
    unit.dataset.scraped = "true";
    unit.classList.add("is-scraped");
    unit.style.visibility = "hidden";

    const delayMs = Math.random() * DETACH_JITTER_MS;
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
