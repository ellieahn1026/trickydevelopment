import {
  initHeadline,
  triggerRejectHeadline,
  typeLockHeadline,
  setDoubtHeadline,
  setDistantHeadline,
} from "./headline-type.js";
import { scoreInput } from "./input-score.js";
import { recordComposerCenter } from "./composer-trail.js";

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
const INITIAL_MAX_DODGE_MS = 15_000;
const PENALTY_MIN_CATCH_MS = 5_000;
const PENALTY_MAX_CATCH_MS = 10_000;
const SEND_LEAVE_DIST = 72;

const composer = document.querySelector(".chat-panel__composer");
const input = document.getElementById("chat-input");
const headline = document.getElementById("chat-headline");
const sendButton = document.querySelector(".prompt__send");
const sideline = document.querySelector(".sideline");

/** @type {(message: string, onCaught?: () => void) => { deferred: boolean }} */
let evaluateSubmittedMessage = () => ({ deferred: false });

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
  let lowScoreStrikes = 0;
  let penaltyRunawayActive = false;
  let pendingCaughtCallback = null;
  let activeMaxDodgeMs = INITIAL_MAX_DODGE_MS;

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
    recordComposerCenter(composer);
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
    if (locked) return;
    if (
      document.body.classList.contains("chat-started") &&
      !penaltyRunawayActive
    ) {
      return;
    }

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

  function clearPenaltyVisuals() {
    composer.classList.remove("is-diagonal-nudge");
  }

  function syncCatchPosition(animate = false) {
    const catchX = posX;
    const catchY = posY;
    composer.style.setProperty("--catch-x", `${catchX}px`);
    composer.style.setProperty("--catch-y", `${catchY}px`);
    composer.style.setProperty("left", `${catchX}px`, "important");
    composer.style.setProperty("top", `${catchY}px`, "important");
    composer.dataset.catchX = String(catchX);
    composer.dataset.catchY = String(catchY);
    if (animate) composer.classList.add("is-diagonal-nudge");
  }

  function nudgeComposerDiagonal() {
    recordComposerCenter(composer);
    syncSize();
    const rect = composer.getBoundingClientRect();
    posX = rect.left;
    posY = rect.top;
    const bounds = getBounds();
    const angle = Math.random() * Math.PI * 2;
    const dist = 220 + Math.random() * 260;
    posX = clamp(posX + Math.cos(angle) * dist, bounds.minX, bounds.maxX);
    posY = clamp(posY + Math.sin(angle) * dist, bounds.minY, bounds.maxY);

    syncCatchPosition(true);
    window.setTimeout(() => {
      composer.classList.remove("is-diagonal-nudge");
      recordComposerCenter(composer);
    }, 520);
  }

  function applyPenaltyStage1() {
    setDoubtHeadline(headline);
    nudgeComposerDiagonal();
  }

  function applyPenaltyStage2() {
    setDistantHeadline(headline);
    nudgeComposerDiagonal();
  }

  function startPenaltyRunaway(onCaught) {
    lowScoreStrikes = 0;
    pendingCaughtCallback = onCaught ?? null;
    penaltyRunawayActive = true;
    clearPenaltyVisuals();

    window.clearTimeout(catchReadyTimer);
    window.clearTimeout(maxDodgeTimer);
    window.cancelAnimationFrame(rafId);

    locked = false;
    catchReady = false;
    cursorTouching = false;
    sendHitActive = false;
    input.disabled = true;
    input.blur();
    document.body.classList.remove("composer-locked");

    composer.classList.remove("is-locked", "is-catch-locked");
    composer.style.removeProperty("--catch-x");
    composer.style.removeProperty("--catch-y");
    delete composer.dataset.catchX;
    delete composer.dataset.catchY;

    sendButton?.classList.remove("is-cursor-hit");
    if (sendButton) {
      sendButton.style.backgroundColor = "#000000";
      sendButton.textContent = "Send";
    }

    composer.classList.add("chat-panel__composer--runaway");
    measureSize();
    syncSize();
    const rect = composer.getBoundingClientRect();
    posX = rect.left;
    posY = rect.top;
    enforceVisible();

    const angle = Math.random() * Math.PI * 2;
    velX = Math.cos(angle) * IDLE_KICK;
    velY = Math.sin(angle) * IDLE_KICK;

    // Catch unlocks randomly between 5s and 10s; forced catch by 10s.
    catchReadyAt =
      PENALTY_MIN_CATCH_MS +
      Math.random() * (PENALTY_MAX_CATCH_MS - PENALTY_MIN_CATCH_MS);

    catchReadyTimer = window.setTimeout(enableCatch, catchReadyAt);
    maxDodgeTimer = window.setTimeout(forceEndDodge, PENALTY_MAX_CATCH_MS);
    rafId = window.requestAnimationFrame(tick);
  }

  function handleMessageLowScore(onCaught) {
    if (penaltyRunawayActive) return { deferred: true };

    if (lowScoreStrikes === 0) {
      applyPenaltyStage1();
      lowScoreStrikes = 1;
      return { deferred: false };
    }

    if (lowScoreStrikes === 1) {
      applyPenaltyStage2();
      lowScoreStrikes = 2;
      return { deferred: false };
    }

    startPenaltyRunaway(onCaught);
    return { deferred: true };
  }

  evaluateSubmittedMessage = function evaluateSubmittedMessageImpl(
    message,
    onCaught,
  ) {
    if (document.body.dataset.character !== "Potter") return { deferred: false };
    if (!locked || penaltyRunawayActive) return { deferred: true };

    const score = scoreInput(message);
    if (score > 3) return { deferred: false };

    return handleMessageLowScore(onCaught);
  };

  function lockComposer(initialValue = "") {
    if (locked) return;
    locked = true;
    penaltyRunawayActive = false;
    activeMaxDodgeMs = INITIAL_MAX_DODGE_MS;
    window.clearTimeout(catchReadyTimer);
    window.clearTimeout(maxDodgeTimer);
    window.cancelAnimationFrame(rafId);
    velX = 0;
    velY = 0;

    // Freeze at the meeting point with the cursor
    placeAtCursor();
    enforceVisible();
    syncCatchPosition();
    recordComposerCenter(composer);
    composer.classList.add("is-locked", "is-catch-locked");

    sendButton?.classList.remove("is-cursor-hit");
    if (sendButton) {
      sendButton.style.backgroundColor = "#000000";
      sendButton.textContent = "Send";
    }
    sendHitActive = false;
    cursorTouching = false;
    typeLockHeadline(headline);
    document.body.classList.add("composer-locked");
    input.disabled = false;
    input.focus();

    if (pendingCaughtCallback) {
      const callback = pendingCaughtCallback;
      pendingCaughtCallback = null;
      callback();
    }

    if (initialValue) {
      input.value = initialValue;
    }
  }

  function bindRunaway() {
    if (document.body.dataset.character === "Rupin" || document.body.dataset.character === "Tom") {
      return;
    }

    input.disabled = true;
    initHeadline(headline);
    activeMaxDodgeMs = INITIAL_MAX_DODGE_MS;
    catchReadyAt = Math.random() * activeMaxDodgeMs;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        captureInitialPosition();
        rafId = window.requestAnimationFrame(tick);
      });
    });

    catchReadyTimer = window.setTimeout(enableCatch, catchReadyAt);
    maxDodgeTimer = window.setTimeout(forceEndDodge, activeMaxDodgeMs);

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
      if (penaltyRunawayActive) {
        measureSize();
        enforceVisible();
        return;
      }
      if (locked || document.body.classList.contains("chat-started")) {
        if (composer.classList.contains("is-catch-locked")) return;
        enforceVisible();
        return;
      }
      measureSize();
      enforceVisible();
    });

    window.visualViewport?.addEventListener("resize", () => {
      if (penaltyRunawayActive) {
        measureSize();
        enforceVisible();
        return;
      }
      if (locked || document.body.classList.contains("chat-started")) {
        if (composer.classList.contains("is-catch-locked")) return;
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

export { evaluateSubmittedMessage };
