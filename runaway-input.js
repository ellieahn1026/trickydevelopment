import {
  initHeadline,
  triggerRejectHeadline,
  typeLockHeadline,
} from "./headline-type.js";

const CURSOR_RADIUS = 36;
const REPEL_RADIUS = 200;
const WALL_BOUNCE = 0.72;
const FRICTION = 0.994;
const ESCAPE_FRICTION = 0.996;
const MAX_SPEED = 28;
const ESCAPE_GLIDE = 0.1;
const ESCAPE_IMPULSE = 14;
const ESCAPE_BLEND = 0.32;
const MIN_SPEED = 2.2;
const IDLE_KICK = 3.5;
const BOB_STRENGTH = 0.28;
const MAX_DODGE_MS = 15_000;
const SEND_LEAVE_DIST = 72;

const composer = document.querySelector(".chat-panel__composer");
const input = document.getElementById("chat-input");
const headline = document.getElementById("chat-headline");
const sendButton = document.querySelector(".prompt__send");
const sideline = document.querySelector(".sideline");

if (!composer || !input) {
  console.warn("Runaway input: required elements not found");
} else {
  let locked = false;
  let posX = 0;
  let posY = 0;
  let velX = 0;
  let velY = 0;
  let mouseX = -9999;
  let mouseY = -9999;
  let rafId = 0;
  let sizeW = 0;
  let sizeH = 0;
  let cursorTouching = false;
  let sendHitActive = false;
  let hitCursorX = 0;
  let hitCursorY = 0;
  let catchReady = false;
  let catchReadyAt = 0;
  let maxDodgeTimer = 0;
  let catchReadyTimer = 0;

  function distanceCursorToComposer() {
    const rect = composer.getBoundingClientRect();
    const nearestX = clamp(mouseX, rect.left, rect.right);
    const nearestY = clamp(mouseY, rect.top, rect.bottom);
    return Math.hypot(mouseX - nearestX, mouseY - nearestY);
  }

  /** Same proximity used when composer starts bouncing away. */
  function isCursorInBounceRange() {
    syncSize();
    const cx = posX + sizeW / 2;
    const cy = posY + sizeH / 2;
    const ballRadius = Math.min(sizeW, sizeH) * 0.5;
    const centerDist = Math.hypot(cx - mouseX, cy - mouseY);
    return (
      distanceCursorToComposer() < CURSOR_RADIUS ||
      centerDist < CURSOR_RADIUS + ballRadius
    );
  }

  function setSendHit(active) {
    if (locked) return;
    sendHitActive = active;
    sendButton?.classList.toggle("is-cursor-hit", active);
    if (sendButton) {
      sendButton.style.backgroundColor = active ? "#ff0084" : "#000000";
      sendButton.textContent = active ? "oops" : "Send";
    }
  }

  function markSendHitFromBounce() {
    hitCursorX = mouseX;
    hitCursorY = mouseY;
    setSendHit(true);
  }

  function updateSendHitFromCursor() {
    if (locked) return;

    if (isCursorInBounceRange()) {
      hitCursorX = mouseX;
      hitCursorY = mouseY;
      if (!sendHitActive) setSendHit(true);
      return;
    }

    if (!sendHitActive) return;

    const cursorMovedAway =
      Math.hypot(mouseX - hitCursorX, mouseY - hitCursorY) > SEND_LEAVE_DIST;
    if (cursorMovedAway) setSendHit(false);
  }

  function updateComposerCursorProximity() {
    const near = isCursorInBounceRange();
    if (near && !cursorTouching) {
      cursorTouching = true;
      markSendHitFromBounce();
      triggerRejectHeadline(headline);
      return;
    }

    if (!near) cursorTouching = false;
    updateSendHitFromCursor();
  }

  function viewportWidth() {
    return window.visualViewport?.width ?? document.documentElement.clientWidth;
  }

  function viewportHeight() {
    return window.visualViewport?.height ?? document.documentElement.clientHeight;
  }

  function viewportOffsetX() {
    return window.visualViewport?.offsetLeft ?? 0;
  }

  function viewportOffsetY() {
    return window.visualViewport?.offsetTop ?? 0;
  }

  function syncSize() {
    const rect = composer.getBoundingClientRect();
    sizeW = rect.width;
    sizeH = rect.height;
  }

  /** Left wall = sideline. Right wall = viewport right edge. */
  function getWalls() {
    const sidelineRect = sideline
      ? sideline.getBoundingClientRect()
      : { right: 366, left: 365 };

    const leftWall = sidelineRect.left;
    const rightWall = viewportOffsetX() + viewportWidth();
    const topWall = viewportOffsetY();
    const bottomWall = viewportOffsetY() + viewportHeight();

    return { leftWall, rightWall, topWall, bottomWall };
  }

  function getBounds() {
    syncSize();
    const { leftWall, rightWall, topWall, bottomWall } = getWalls();

    return {
      minX: leftWall,
      maxX: Math.max(leftWall, rightWall - sizeW),
      minY: topWall,
      maxY: Math.max(topWall, bottomWall - sizeH),
      laneWidth: Math.max(0, rightWall - leftWall),
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function measureSize() {
    const { laneWidth } = getBounds();
    const travelRoom = Math.max(120, laneWidth * 0.32);
    let targetW = Math.max(220, Math.min(640, laneWidth - travelRoom));
    targetW = Math.min(targetW, laneWidth);

    composer.style.width = `${targetW}px`;
    composer.style.maxWidth = `${targetW}px`;
    syncSize();

    if (sizeW > laneWidth && laneWidth > 0) {
      composer.style.width = `${laneWidth}px`;
      composer.style.maxWidth = `${laneWidth}px`;
      syncSize();
    }
  }

  function limitSpeed() {
    const speed = Math.hypot(velX, velY);
    if (speed > MAX_SPEED) {
      velX = (velX / speed) * MAX_SPEED;
      velY = (velY / speed) * MAX_SPEED;
    }
  }

  /** Hard clamp: composer must stay fully inside sideline ↔ viewport right. */
  function enforceVisible() {
    syncSize();
    const bounds = getBounds();

    posX = clamp(posX, bounds.minX, bounds.maxX);
    posY = clamp(posY, bounds.minY, bounds.maxY);

    composer.style.left = `${posX}px`;
    composer.style.top = `${posY}px`;

    const rect = composer.getBoundingClientRect();
    const walls = getWalls();

    if (rect.left < walls.leftWall) {
      posX += walls.leftWall - rect.left;
    }
    if (rect.right > walls.rightWall) {
      posX -= rect.right - walls.rightWall;
    }
    if (rect.top < walls.topWall) {
      posY += walls.topWall - rect.top;
    }
    if (rect.bottom > walls.bottomWall) {
      posY -= rect.bottom - walls.bottomWall;
    }

    composer.style.left = `${posX}px`;
    composer.style.top = `${posY}px`;
  }

  function containInBounds() {
    const bounds = getBounds();

    if (posX < bounds.minX) {
      posX = bounds.minX;
      velX = Math.abs(velX) * WALL_BOUNCE + 0.4;
    } else if (posX > bounds.maxX) {
      posX = bounds.maxX;
      velX = -Math.abs(velX) * WALL_BOUNCE - 0.4;
    }

    if (posY < bounds.minY) {
      posY = bounds.minY;
      velY = Math.abs(velY) * WALL_BOUNCE + 0.4;
    } else if (posY > bounds.maxY) {
      posY = bounds.maxY;
      velY = -Math.abs(velY) * WALL_BOUNCE - 0.4;
    }

    enforceVisible();
  }

  function captureInitialPosition() {
    composer.classList.add("chat-panel__composer--runaway");
    measureSize();
    const bounds = getBounds();
    posX = clamp((bounds.minX + bounds.maxX) / 2, bounds.minX, bounds.maxX);
    posY = clamp((bounds.minY + bounds.maxY) / 2, bounds.minY, bounds.maxY);
    enforceVisible();

    const angle = Math.random() * Math.PI * 2;
    velX = Math.cos(angle) * IDLE_KICK;
    velY = Math.sin(angle) * IDLE_KICK;
  }

  function getFarthestPosition() {
    syncSize();
    const bounds = getBounds();
    const corners = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.minX, y: bounds.maxY },
      { x: bounds.maxX, y: bounds.maxY },
    ];

    let best = corners[0];
    let bestDist = -Infinity;

    for (const corner of corners) {
      const centerX = corner.x + sizeW / 2;
      const centerY = corner.y + sizeH / 2;
      const dist = Math.hypot(centerX - mouseX, centerY - mouseY);
      if (dist > bestDist) {
        bestDist = dist;
        best = corner;
      }
    }

    return best;
  }

  /** Drift toward the farthest corner — soft water-like escape, not a hard snap. */
  function fleeFromCursor() {
    syncSize();
    const target = getFarthestPosition();
    const targetCenterX = target.x + sizeW / 2;
    const targetCenterY = target.y + sizeH / 2;

    posX += (target.x - posX) * ESCAPE_GLIDE;
    posY += (target.y - posY) * ESCAPE_GLIDE;

    let dx = targetCenterX - mouseX;
    let dy = targetCenterY - mouseY;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const escapeSpeed = Math.min(MAX_SPEED, ESCAPE_IMPULSE + dist * 0.015);

    velX = velX * (1 - ESCAPE_BLEND) + nx * escapeSpeed * ESCAPE_BLEND;
    velY = velY * (1 - ESCAPE_BLEND) + ny * escapeSpeed * ESCAPE_BLEND;

    enforceVisible();
  }

  function placeAtCursor() {
    syncSize();
    const bounds = getBounds();
    posX = clamp(mouseX - sizeW / 2, bounds.minX, bounds.maxX);
    posY = clamp(mouseY - sizeH / 2, bounds.minY, bounds.maxY);
    enforceVisible();
  }

  function collideWithCursor() {
    const nearComposer = isCursorInBounceRange();

    if (nearComposer) {
      if (catchReady) {
        placeAtCursor();
        lockComposer();
        return;
      }

      markSendHitFromBounce();
      if (!cursorTouching) {
        cursorTouching = true;
        triggerRejectHeadline(headline);
      }
      fleeFromCursor();
      containInBounds();
      return;
    }

    const cx = posX + sizeW / 2;
    const cy = posY + sizeH / 2;
    let dx = cx - mouseX;
    let dy = cy - mouseY;
    let dist = Math.hypot(dx, dy);

    if (dist < 0.001) return;

    const nx = dx / dist;
    const ny = dy / dist;

    const warnRadius = REPEL_RADIUS * 0.65;
    if (dist < warnRadius) {
      const t = 1 - dist / warnRadius;
      const push = t * t * 12;
      velX += nx * push;
      velY += ny * push;
    }
  }

  function applyWaterBob() {
    const t = performance.now() * 0.001;
    velX += Math.sin(t * 1.15 + posY * 0.004) * BOB_STRENGTH;
    velY += Math.cos(t * 0.85 + posX * 0.003) * BOB_STRENGTH * 1.4;
  }

  function tick() {
    if (locked || document.body.classList.contains("chat-started")) return;

    collideWithCursor();
    applyWaterBob();

    posX += velX;
    posY += velY;

    const cx = posX + sizeW / 2;
    const cy = posY + sizeH / 2;
    const nearCursor = Math.hypot(cx - mouseX, cy - mouseY) < REPEL_RADIUS;
    const drag = nearCursor ? ESCAPE_FRICTION : FRICTION;

    velX *= drag;
    velY *= drag;

    const speed = Math.hypot(velX, velY);
    if (speed < MIN_SPEED) {
      if (speed < 0.01) {
        const angle = Math.random() * Math.PI * 2;
        velX = Math.cos(angle) * IDLE_KICK;
        velY = Math.sin(angle) * IDLE_KICK;
      } else {
        velX = (velX / speed) * MIN_SPEED;
        velY = (velY / speed) * MIN_SPEED;
      }
    }

    limitSpeed();
    containInBounds();
    updateComposerCursorProximity();

    rafId = window.requestAnimationFrame(tick);
  }

  function nudgeFromPointer(clientX, clientY) {
    if (locked) return;
    mouseX = clientX;
    mouseY = clientY;

    if (catchReady && isCursorInBounceRange()) {
      placeAtCursor();
      lockComposer();
      return;
    }

    markSendHitFromBounce();
    cursorTouching = true;
    triggerRejectHeadline(headline);
    fleeFromCursor();
  }

  function enableCatch() {
    if (locked || catchReady) return;
    catchReady = true;
    if (isCursorInBounceRange()) {
      placeAtCursor();
      lockComposer();
    }
  }

  function forceEndDodge() {
    // By 15s, catching must be possible — lock on contact, or immediately if already near.
    enableCatch();
  }

  function lockComposer(initialValue = "") {
    if (locked) return;
    locked = true;
    window.clearTimeout(catchReadyTimer);
    window.clearTimeout(maxDodgeTimer);
    window.cancelAnimationFrame(rafId);
    velX = 0;
    velY = 0;
    placeAtCursor();
    enforceVisible();
    sendButton?.classList.remove("is-cursor-hit");
    if (sendButton) {
      sendButton.style.backgroundColor = "#000000";
      sendButton.textContent = "Send";
    }
    sendHitActive = false;
    cursorTouching = false;
    typeLockHeadline(headline);
    composer.classList.add("is-locked");
    document.body.classList.add("composer-locked");
    input.disabled = false;
    input.focus();
    if (initialValue) {
      input.value = initialValue;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function bindRunaway() {
    if (document.body.dataset.character === "Rupin") {
      return;
    }

    input.disabled = true;
    initHeadline(headline);
    catchReadyAt = Math.random() * MAX_DODGE_MS;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        captureInitialPosition();
        rafId = window.requestAnimationFrame(tick);
      });
    });

    catchReadyTimer = window.setTimeout(enableCatch, catchReadyAt);
    maxDodgeTimer = window.setTimeout(forceEndDodge, MAX_DODGE_MS);

    document.addEventListener("mousemove", (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      if (!locked) updateComposerCursorProximity();
    });

    composer.addEventListener("mouseenter", (event) => {
      nudgeFromPointer(event.clientX, event.clientY);
    });

    input.addEventListener("mousedown", (event) => {
      if (locked) return;
      event.preventDefault();
      nudgeFromPointer(event.clientX, event.clientY);
    });

    input.addEventListener("focus", (event) => {
      if (locked) return;
      event.preventDefault();
      input.blur();
      nudgeFromPointer(mouseX, mouseY);
    });

    window.addEventListener("resize", () => {
      if (document.body.classList.contains("chat-started")) return;
      if (locked) {
        enforceVisible();
        return;
      }
      measureSize();
      enforceVisible();
    });

    window.visualViewport?.addEventListener("resize", () => {
      if (document.body.classList.contains("chat-started")) return;
      if (locked) {
        enforceVisible();
        return;
      }
      measureSize();
      enforceVisible();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindRunaway);
  } else {
    bindRunaway();
  }
}
