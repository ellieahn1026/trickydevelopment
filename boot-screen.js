const BOOT_SESSION_KEY = "hackedgpt-boot-seen";
const MENU_HIGHLIGHT_MS = 1000;
const FLICKER_MS = 1600;
const COLLAPSE_MS = 950;
const REVEAL_MS = 550;
const PIXEL_CELL = 24;
const PIXEL_SPREAD_MS = 1300;
const PIXEL_BLUE_FILL_MS = 520;
const PIXEL_BLUE = "#0000aa";
const PIXEL_BLACK = "#000000";
const PIXEL_CHARS = ["±", "+", "0", "x", "?", "#"];

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
  if (roll < 0.44) return "solid";
  if (roll < 0.78) return "dither";
  return "char";
}

function getViewportPixelSize() {
  const viewport = window.visualViewport;
  const width = Math.ceil(
    viewport?.width ?? window.innerWidth ?? document.documentElement.clientWidth,
  );
  const height = Math.ceil(
    viewport?.height ?? window.innerHeight ?? document.documentElement.clientHeight,
  );

  return {
    width: Math.max(width, 1),
    height: Math.max(height, 1),
  };
}

function generatePixelColumns(width, height, cellW, spreadMs) {
  const blocks = [];
  const cols = Math.ceil(width / cellW) + 1;
  const rows = Math.ceil(height / cellW) + 1;
  const fullHeight = rows * cellW;
  const decorativeCount = Math.floor(cols * rows * 0.12);

  for (let col = 0; col < cols; col += 1) {
    const grow = col % 2 === 0 ? "down" : "up";
    const anchorRow = grow === "down" ? 0 : rows - 1;
    const blueBias = 0.34 + (col / Math.max(cols, 1)) * 0.42;
    const primary = pickPixelColor(blueBias);
    const secondary = primary === PIXEL_BLUE ? PIXEL_BLACK : PIXEL_BLUE;

    blocks.push({
      x: col * cellW,
      y: anchorRow * cellW,
      w: cellW,
      targetH: fullHeight,
      grow,
      kind: pickBlockKind(),
      color: primary,
      altColor: secondary,
      char: PIXEL_CHARS[Math.floor(Math.random() * PIXEL_CHARS.length)],
      revealAt: (col / Math.max(cols, 1)) * spreadMs * 0.78 + Math.random() * 36,
      growMs: 110 + Math.random() * 420,
      alpha: 0,
    });
  }

  for (let i = 0; i < decorativeCount; i += 1) {
    const spanW = Math.random() < 0.72 ? 1 : 2;
    const col = Math.floor(Math.random() * Math.max(1, cols - spanW + 1));
    const grow = Math.random() < 0.5 ? "down" : "up";
    const anchorRow = grow === "down"
      ? Math.floor(Math.random() * Math.max(1, rows - 1))
      : Math.floor(Math.random() * rows);
    const primary = pickPixelColor(0.62);
    const secondary = primary === PIXEL_BLUE ? PIXEL_BLACK : PIXEL_BLUE;

    blocks.push({
      x: col * cellW,
      y: anchorRow * cellW,
      w: spanW * cellW,
      targetH: (1 + Math.floor(Math.random() * rows)) * cellW,
      grow,
      kind: pickBlockKind(),
      color: primary,
      altColor: secondary,
      char: PIXEL_CHARS[Math.floor(Math.random() * PIXEL_CHARS.length)],
      revealAt: Math.random() * spreadMs * 0.9,
      growMs: 90 + Math.random() * 280,
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
  const eased = 1 - (1 - growProgress) ** 2.4;
  const currentH = Math.max(cellW * 0.5, block.targetH * eased);

  if (block.grow === "down") {
    return { x: block.x, y: block.y, w: block.w, h: currentH };
  }

  if (block.grow === "up") {
    return { x: block.x, y: block.y - currentH + cellW, w: block.w, h: currentH };
  }

  const half = currentH * 0.5;
  return { x: block.x, y: block.y - half, w: block.w, h: currentH };
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
    const fontSize = Math.max(8, Math.min(rect.w, rect.h) * 0.72);
    ctx.fillStyle = block.altColor;
    ctx.font = `${fontSize}px "IBM Plex Mono", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(block.char, rect.x + rect.w * 0.5, rect.y + rect.h * 0.5);
  }

  ctx.restore();
}

function startPixelSpread(screen) {
  const canvas = document.createElement("canvas");
  canvas.className = "boot-pixel-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const { width, height } = getViewportPixelSize();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

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

      ctx.clearRect(0, 0, width, height);

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
