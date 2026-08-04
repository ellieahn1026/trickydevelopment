const BOOT_SESSION_KEY = "hackedgpt-boot-seen";
const MENU_HIGHLIGHT_MS = 1000;
const FLICKER_MS = 1600;
const COLLAPSE_MS = 950;
const REVEAL_MS = 550;
const PIXEL_CELL = 32;
const PIXEL_SPREAD_MS = 1450;
const PIXEL_BLUE_FILL_MS = 520;
const PIXEL_BLUE = "#0000aa";
const PIXEL_BLACK = "#000000";
const PIXEL_WORDS = ["chat gpt", "lie", "UX", "fake"];

function pickWordFragment(word) {
  const compact = word.replace(/\s+/g, "");
  const roll = Math.random();

  if (roll < 0.34) {
    return word;
  }

  if (roll < 0.72) {
    const parts = word.split(/\s+/).filter(Boolean);
    const source =
      parts.length > 1 && Math.random() < 0.45
        ? parts[Math.floor(Math.random() * parts.length)]
        : compact;
    if (source.length <= 1) return source;

    const fragLen = 1 + Math.floor(Math.random() * Math.min(4, source.length));
    const start = Math.floor(Math.random() * (source.length - fragLen + 1));
    return source.slice(start, start + fragLen);
  }

  const letters = [...compact];
  const pickCount = Math.random() < 0.5 ? 1 : Math.min(2 + Math.floor(Math.random() * 2), letters.length);
  const picked = [];
  for (let i = 0; i < pickCount; i += 1) {
    picked.push(letters[Math.floor(Math.random() * letters.length)]);
  }

  return picked.join(Math.random() < 0.62 ? " " : "");
}

function pickPixelLabel() {
  const word = PIXEL_WORDS[Math.floor(Math.random() * PIXEL_WORDS.length)];
  return pickWordFragment(word);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function startMenuHighlightCycle(sidebar) {
  const items = [...sidebar.querySelectorAll(".boot-fake__menu-item")];
  if (items.length === 0) return () => {};

  let index = items.findIndex((item) =>
    item.classList.contains("boot-fake__menu-item--active"),
  );
  if (index < 0) {
    index = 0;
    items[0].classList.add("boot-fake__menu-item--active");
  }

  const intervalId = window.setInterval(() => {
    items[index].classList.remove("boot-fake__menu-item--active");
    index = (index + 1) % items.length;
    items[index].classList.add("boot-fake__menu-item--active");
  }, MENU_HIGHLIGHT_MS);

  return () => window.clearInterval(intervalId);
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function assignCollapseTargets(root) {
  const pieces = root.querySelectorAll(".boot-fake__piece");
  pieces.forEach((el, index) => {
    const angle = (index / Math.max(pieces.length, 1)) * Math.PI * 2;
    const dist = 80 + Math.random() * 160;
    const tx = Math.cos(angle) * dist * (0.6 + Math.random() * 0.8);
    const ty = 60 + Math.sin(angle) * dist + Math.random() * 120;
    const rot = (Math.random() - 0.5) * 36;
    const scale = 0.65 + Math.random() * 0.2;

    el.style.setProperty("--boot-tx", `${tx.toFixed(1)}px`);
    el.style.setProperty("--boot-ty", `${ty.toFixed(1)}px`);
    el.style.setProperty("--boot-rot", `${rot.toFixed(1)}deg`);
    el.style.setProperty("--boot-scale", scale.toFixed(2));
    el.style.setProperty("--boot-delay", `${index * 45}ms`);
    el.style.setProperty("--boot-collapse-ms", `${COLLAPSE_MS}ms`);
  });
}

function createDitherPattern(ctx, c1, c2, size = 4) {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;
  tctx.fillStyle = c1;
  tctx.fillRect(0, 0, size, size);
  tctx.fillStyle = c2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if ((x + y) % 2 === 0) tctx.fillRect(x, y, 1, 1);
    }
  }
  return ctx.createPattern(tile, "repeat");
}

function pickPixelColor(biasBlue = 0.5) {
  return Math.random() < biasBlue ? PIXEL_BLUE : PIXEL_BLACK;
}

function pickBlockKind() {
  const roll = Math.random();
  if (roll < 0.52) return "solid";
  if (roll < 0.78) return "dither";
  return "char";
}

function pickColumnGrowMs() {
  return 180 + Math.random() * 580;
}

function pickDecorativeGrowMs() {
  return 110 + Math.random() * 380;
}

function getBootScreenPixelSize(screen) {
  const width = Math.max(screen?.clientWidth ?? 0, 1);
  const height = Math.max(screen?.clientHeight ?? 0, 1);

  return { width, height };
}

function generatePixelColumns(width, height, cellW, spreadMs) {
  const blocks = [];
  const cols = Math.ceil(width / cellW) + 1;
  const rows = Math.ceil(height / cellW) + 1;
  const fullHeight = rows * cellW;
  const decorativeCount = Math.floor(cols * rows * 0.2);

  for (let col = 0; col < cols; col += 1) {
    const spanW = Math.random() < 0.78 ? 1 : 2;
    if (col + spanW > cols) continue;

    const grow = col % 2 === 0 ? "down" : "up";
    const anchorRow = grow === "down" ? 0 : rows - 1;
    const blueBias = 0.32 + (col / Math.max(cols, 1)) * 0.42;
    const primary = pickPixelColor(blueBias);
    const secondary = primary === PIXEL_BLUE ? PIXEL_BLACK : PIXEL_BLUE;

    blocks.push({
      x: col * cellW,
      y: anchorRow * cellW,
      w: spanW * cellW,
      targetH: fullHeight,
      grow,
      kind: pickBlockKind(),
      color: primary,
      altColor: secondary,
      label: pickPixelLabel(),
      revealAt: (col / Math.max(cols, 1)) * spreadMs * 0.82 + Math.random() * 64,
      growMs: pickColumnGrowMs(),
      alpha: 0,
    });
  }

  for (let i = 0; i < decorativeCount; i += 1) {
    const spanW = Math.random() < 0.62 ? 1 : Math.random() < 0.7 ? 2 : 3;
    const col = Math.floor(Math.random() * Math.max(1, cols - spanW + 1));
    const targetCells = 1 + Math.floor(Math.pow(Math.random(), 0.62) * 9);
    const maxCells = Math.min(targetCells, rows);
    const growMode = Math.random();
    const blueBias = 0.26 + (i / Math.max(decorativeCount, 1)) * 0.36;
    const primary = pickPixelColor(blueBias);
    const secondary = primary === PIXEL_BLUE ? PIXEL_BLACK : PIXEL_BLUE;

    let y;
    let grow;
    if (growMode < 0.42) {
      grow = "down";
      y = Math.floor(Math.random() * Math.max(1, rows - maxCells + 1)) * cellW;
    } else if (growMode < 0.84) {
      grow = "up";
      y = Math.floor(Math.random() * rows) * cellW;
    } else {
      grow = "both";
      y = Math.floor(Math.random() * rows) * cellW;
    }

    blocks.push({
      x: col * cellW,
      y,
      w: spanW * cellW,
      targetH: maxCells * cellW,
      grow,
      kind: pickBlockKind(),
      color: primary,
      altColor: secondary,
      label: pickPixelLabel(),
      revealAt: Math.random() * spreadMs * 0.94,
      growMs: pickDecorativeGrowMs(),
      alpha: 0,
    });
  }

  blocks.sort((a, b) => a.revealAt - b.revealAt);
  return blocks;
}

function getBlockDrawRect(block, elapsed, cellW) {
  const t = elapsed - block.revealAt;
  if (t < 0) return null;

  const growProgress = Math.min(1, t / block.growMs);
  const eased = 1 - (1 - growProgress) ** 2;
  const currentH = Math.max(cellW * 0.35, block.targetH * eased);

  if (block.grow === "down") {
    return { x: block.x, y: block.y, w: block.w, h: currentH };
  }

  if (block.grow === "up") {
    return { x: block.x, y: block.y - currentH + cellW, w: block.w, h: currentH };
  }

  const half = currentH * 0.5;
  return { x: block.x, y: block.y - half, w: block.w, h: currentH };
}

function drawPixelLabel(ctx, label, rect, color) {
  const pad = 1;
  const innerW = Math.max(rect.w - pad * 2, 1);
  const innerH = Math.max(rect.h - pad * 2, 1);
  const cx = rect.x + rect.w * 0.5;
  const cy = rect.y + rect.h * 0.5;
  const fontFamily = '"IBM Plex Mono", "Courier New", monospace';
  const maxFontSize = 26;
  const minFontSize = 10;

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const vertical = innerH > innerW * 1.6;

  if (vertical) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 2);

    let fontSize = Math.min(innerH * 0.9, maxFontSize);
    ctx.font = `${fontSize}px ${fontFamily}`;
    let metrics = ctx.measureText(label);
    while (metrics.width > innerH * 0.96 && fontSize > minFontSize) {
      fontSize -= 1;
      ctx.font = `${fontSize}px ${fontFamily}`;
      metrics = ctx.measureText(label);
    }

    ctx.fillText(label, 0, 0);
    ctx.restore();
    return;
  }

  let fontSize = Math.min(innerW * 0.68, innerH * 0.92, maxFontSize);
  ctx.font = `${fontSize}px ${fontFamily}`;
  let metrics = ctx.measureText(label);
  while ((metrics.width > innerW * 0.96 || fontSize > innerH * 0.92) && fontSize > minFontSize) {
    fontSize -= 1;
    ctx.font = `${fontSize}px ${fontFamily}`;
    metrics = ctx.measureText(label);
  }

  ctx.fillText(label, cx, cy);
}

function drawPixelBlock(ctx, block, patterns, rect) {
  if (block.alpha <= 0 || !rect || rect.h <= 0) return;

  ctx.save();
  ctx.globalAlpha = block.alpha;

  if (block.kind === "solid") {
    ctx.fillStyle = block.color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else if (block.kind === "dither") {
    const key = `${block.color}|${block.altColor}`;
    ctx.fillStyle = patterns.get(key) || block.color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else {
    ctx.fillStyle = block.color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    drawPixelLabel(ctx, block.label, rect, block.altColor);
  }

  ctx.restore();
}

function startPixelSpread(screen) {
  const canvas = document.createElement("canvas");
  canvas.className = "boot-pixel-canvas";
  canvas.setAttribute("aria-hidden", "true");
  screen.appendChild(canvas);

  const { width, height } = getBootScreenPixelSize(screen);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return { done: Promise.resolve(), destroy: () => {} };
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const blocks = generatePixelColumns(width, height, PIXEL_CELL, PIXEL_SPREAD_MS);

  const patterns = new Map([
    [`${PIXEL_BLACK}|${PIXEL_BLUE}`, createDitherPattern(ctx, PIXEL_BLACK, PIXEL_BLUE)],
    [`${PIXEL_BLUE}|${PIXEL_BLACK}`, createDitherPattern(ctx, PIXEL_BLUE, PIXEL_BLACK)],
  ]);

  const totalMs = PIXEL_SPREAD_MS + PIXEL_BLUE_FILL_MS;
  let rafId = 0;
  let startTime = 0;

  const done = new Promise((resolve) => {
    const tick = (now) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;

      ctx.fillStyle = PIXEL_BLACK;
      ctx.fillRect(0, 0, width, height);

      for (const block of blocks) {
        const rect = getBlockDrawRect(block, elapsed, PIXEL_CELL);
        if (!rect) continue;

        const t = elapsed - block.revealAt;
        block.alpha = Math.min(1, t / 55);
        drawPixelBlock(ctx, block, patterns, rect);
      }

      if (elapsed > PIXEL_SPREAD_MS) {
        const fillT = Math.min(1, (elapsed - PIXEL_SPREAD_MS) / PIXEL_BLUE_FILL_MS);
        const easedFill = fillT * fillT * (3 - 2 * fillT);
        ctx.fillStyle = PIXEL_BLUE;
        ctx.globalAlpha = easedFill;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }

      if (elapsed < totalMs) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      ctx.fillStyle = PIXEL_BLUE;
      ctx.fillRect(0, 0, width, height);
      resolve();
    };

    rafId = requestAnimationFrame(tick);
  });

  return {
    done,
    destroy: () => {
      cancelAnimationFrame(rafId);
      canvas.remove();
    },
  };
}

async function runBsodFlicker(screen, fake, bsod) {
  screen.classList.add("is-flicker");
  const start = performance.now();

  while (performance.now() - start < FLICKER_MS) {
    const showBsod = Math.random() > 0.42;
    bsod.classList.toggle("is-visible", showBsod);
    fake.style.opacity = showBsod ? "0" : "1";
    fake.style.visibility = showBsod ? "hidden" : "visible";
    await sleep(55 + Math.random() * 90);
  }

  bsod.classList.add("is-visible");
  fake.style.opacity = "0";
  fake.style.visibility = "hidden";
  screen.classList.remove("is-flicker");
}

async function runCollapse(screen, fake) {
  screen.classList.add("is-collapsing");
  fake.classList.add("is-collapsing");
  await sleep(COLLAPSE_MS + 120);
}

function revealPotterPage() {
  document.dispatchEvent(new CustomEvent("boot:revealed"));
}

function finishBoot(screen) {
  screen.classList.add("is-done");
  document.body.classList.remove("boot-active");
  document.body.classList.add("boot-complete");
  sessionStorage.setItem(BOOT_SESSION_KEY, "1");

  window.setTimeout(() => {
    screen.remove();
    revealPotterPage();
  }, REVEAL_MS + 100);
}

function skipBoot(screen) {
  screen.remove();
  document.body.classList.remove("boot-active");
  document.body.classList.add("boot-complete");
  sessionStorage.setItem(BOOT_SESSION_KEY, "1");
  revealPotterPage();
}

async function runBootSequence(screen, fake, bsod) {
  const pixel = startPixelSpread(screen);
  await pixel.done;

  fake.style.opacity = "0";
  fake.style.visibility = "hidden";
  bsod.classList.add("is-visible");
  screen.classList.remove("is-flicker");
  pixel.destroy();

  await runCollapse(screen, fake);
  finishBoot(screen);
}

function shouldForceBootReplay() {
  return new URLSearchParams(window.location.search).has("boot");
}

function initBootScreen() {
  if (document.body.dataset.character !== "Potter") return;

  const forceBoot = shouldForceBootReplay();
  if (forceBoot) {
    sessionStorage.removeItem(BOOT_SESSION_KEY);
  }
  if (!forceBoot && sessionStorage.getItem(BOOT_SESSION_KEY)) {
    document.body.classList.remove("boot-active");
    document.body.classList.add("boot-complete");
    document.getElementById("boot-screen")?.remove();
    revealPotterPage();
    return;
  }

  const screen = document.getElementById("boot-screen");
  if (!screen) return;

  document.body.classList.add("boot-active");

  const fake = screen.querySelector(".boot-fake");
  const bsod = screen.querySelector(".boot-bsod");
  if (!fake || !bsod) {
    skipBoot(screen);
    return;
  }

  assignCollapseTargets(screen);

  if (prefersReducedMotion()) {
    skipBoot(screen);
    return;
  }

  screen.classList.add("is-waiting");

  const sidebar = screen.querySelector(".boot-fake__sidebar");
  const stopMenuHighlight = sidebar ? startMenuHighlightCycle(sidebar) : () => {};

  const trigger = screen.querySelector("#boot-composer-trigger");
  let transitioning = false;

  trigger?.addEventListener("click", () => {
    if (transitioning) return;
    transitioning = true;
    stopMenuHighlight();
    screen.classList.remove("is-waiting");
    void runBootSequence(screen, fake, bsod);
  });
}

initBootScreen();
