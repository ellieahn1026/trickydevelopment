import {
  initHeadline,
  triggerRejectHeadline,
  typeLockHeadline,
  setDoubtHeadline,
  setDistantHeadline,
  setConversationEndHeadline,
} from "./headline-type.js";
import { isLowScore, scoreInput } from "./input-score.js";
import { recordTrailPoint } from "./composer-trail.js";
import { logInteraction } from "./interaction-log.js";
import {
  clientToLayoutLocal,
  elementLayoutSize,
  getLayoutMetrics,
  refreshLayout,
  syncComposerWidth,
  targetComposerWidthPx,
  targetLaneWidthPx,
} from "./composer-layout.js";

const CURSOR_RADIUS = 58;
const REPEL_RADIUS = 248;
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
const END_RUNAWAY_MAX_MS = 15_000;
const SEND_LEAVE_DIST = 72;
const LOADING_BOUNCE_MS = 580;

const composer = document.querySelector(".chat-panel__composer");
const input = document.getElementById("chat-input");
const headline = document.getElementById("chat-headline");
const sendButton = document.querySelector(".prompt__send");

/** @type {(message: string, onCaught?: () => void) => { deferred: boolean }} */
let evaluateSubmittedMessage = () => ({ deferred: false });

/** @type {(onCaught?: () => void) => void} */
let startConversationEndRunaway = () => {};

/** @type {(active: boolean) => void} */
let notifyPotterGenerationChange = () => {};

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
  let conversationEndRunawayActive = false;
  let loadingPenaltyEvasion = false;
  let loadingBounceAnimating = false;
  let loadingBounceTimer = 0;
  let composerHoveredDuringLoading = false;
  let pendingCaughtCallback = null;
  let activeMaxDodgeMs = INITIAL_MAX_DODGE_MS;
  /** @type {HTMLDivElement | null} */
  let composerLane = null;
  let mouseLaneX = -9999;
  let mouseLaneY = -9999;

  function ensureComposerLane() {
    if (composerLane?.isConnected) return composerLane;
    composerLane = document.createElement("div");
    composerLane.className = "potter-composer-lane";
    composerLane.setAttribute("aria-hidden", "true");
    document.body.appendChild(composerLane);
    return composerLane;
  }

  /** Move composer into the sideline-right lane; positions use lane-local layout px. */
  function mountComposerInLane() {
    const lane = ensureComposerLane();
    if (composer.parentElement === lane) return;

    const rect = composer.getBoundingClientRect();
    const clientX = rect.left;
    const clientY = rect.top;

    lane.appendChild(composer);

    const p = clientToLayoutLocal(lane, clientX, clientY);
    posX = Math.max(0, p.x);
    posY = Math.max(0, p.y);
  }

  function pointerToLane(clientX, clientY) {
    if (!composerLane) return { x: clientX, y: clientY };
    return clientToLayoutLocal(composerLane, clientX, clientY);
  }

  function syncPointerLane(clientX, clientY) {
    mouseX = clientX;
    mouseY = clientY;
    const p = pointerToLane(clientX, clientY);
    mouseLaneX = p.x;
    mouseLaneY = p.y;
  }

  function distanceCursorToComposer() {
    const rect = composer.getBoundingClientRect();
    const nearestX = clamp(mouseX, rect.left, rect.right);
    const nearestY = clamp(mouseY, rect.top, rect.bottom);
    return Math.hypot(mouseX - nearestX, mouseY - nearestY);
  }

  /** Same proximity used when composer starts bouncing away. */
  function isCursorInBounceRange() {
    const rect = composer.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ballRadius = Math.min(rect.width, rect.height) * 0.5;
    const centerDist = Math.hypot(cx - mouseX, cy - mouseY);
    return (
      distanceCursorToComposer() < CURSOR_RADIUS ||
      centerDist < CURSOR_RADIUS + ballRadius
    );
  }

  function isPotterGenerating() {
    return document.body.classList.contains("potter-generating");
  }

  function shouldLoadingPenaltyEvasion() {
    return loadingPenaltyEvasion && isPotterGenerating();
  }

  function isLoadingPenaltyHoverActive() {
    return shouldLoadingPenaltyEvasion() && composerHoveredDuringLoading;
  }

  function setSendHit(active) {
    if (locked && !isLoadingPenaltyHoverActive()) return;
    sendHitActive = active;
    sendButton?.classList.toggle("is-cursor-hit", active);
    if (sendButton) {
      sendButton.style.backgroundColor = active ? "#ff0084" : "#000000";
      if (!isPotterGenerating()) {
        sendButton.textContent = active ? "oops" : "Send";
      }
    }
  }

  function markSendHitFromBounce() {
    hitCursorX = mouseX;
    hitCursorY = mouseY;
    setSendHit(true);
  }

  function updateSendHitFromCursor() {
    if (locked && !isLoadingPenaltyHoverActive()) return;

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

  function syncSize() {
    const size = elementLayoutSize(composer);
    sizeW = size.width;
    sizeH = size.height;
  }

  function getBounds() {
    syncSize();
    const laneW = composerLane ? targetLaneWidthPx() : 0;
    const laneH = composerLane ? elementLayoutSize(composerLane).height : 0;

    return {
      minX: 0,
      maxX: Math.max(0, laneW - sizeW),
      minY: 0,
      maxY: Math.max(0, laneH - sizeH),
      laneWidth: laneW,
    };
  }

  function applyPos() {
    composer.style.left = `${posX}px`;
    composer.style.top = `${posY}px`;
  }

  /** Stable viewport-layout center — avoids getBoundingClientRect jitter under html zoom. */
  function composerCenterInViewportLayout() {
    const { sidelineLeft } = getLayoutMetrics();
    return {
      x: sidelineLeft + posX + sizeW / 2,
      y: posY + sizeH / 2,
    };
  }

  function recordComposerTrail() {
    const center = composerCenterInViewportLayout();
    recordTrailPoint(center.x, center.y);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function measureSize() {
    syncComposerWidth();
    syncSize();
    const targetW = targetComposerWidthPx();
    if (targetW > 0 && Math.abs(sizeW - targetW) > 1) {
      sizeW = targetW;
    }
  }

  function limitSpeed() {
    const speed = Math.hypot(velX, velY);
    if (speed > MAX_SPEED) {
      velX = (velX / speed) * MAX_SPEED;
      velY = (velY / speed) * MAX_SPEED;
    }
  }

  /** Hard clamp: composer must stay fully inside the sideline-right lane. */
  function enforceVisible() {
    syncSize();
    const bounds = getBounds();

    posX = clamp(posX, bounds.minX, bounds.maxX);
    posY = clamp(posY, bounds.minY, bounds.maxY);

    applyPos();
    recordComposerTrail();
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
    mountComposerInLane();
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
      const dist = Math.hypot(centerX - mouseLaneX, centerY - mouseLaneY);
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

    let dx = targetCenterX - mouseLaneX;
    let dy = targetCenterY - mouseLaneY;
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
    posX = clamp(mouseLaneX - sizeW / 2, bounds.minX, bounds.maxX);
    posY = clamp(mouseLaneY - sizeH / 2, bounds.minY, bounds.maxY);
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
    let dx = cx - mouseLaneX;
    let dy = cy - mouseLaneY;
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

  function bounceComposerFromLoadingHover() {
    if (!shouldLoadingPenaltyEvasion() || loadingBounceAnimating) return;

    mountComposerInLane();
    measureSize();
    syncPointerLane(mouseX, mouseY);
    posX = composer.offsetLeft;
    posY = composer.offsetTop;

    const bounds = getBounds();
    const target = getFarthestPosition();
    const blend = 0.84 + Math.random() * 0.14;
    const nextX = clamp(posX + (target.x - posX) * blend, bounds.minX, bounds.maxX);
    const nextY = clamp(posY + (target.y - posY) * blend, bounds.minY, bounds.maxY);

    composer.classList.remove("is-diagonal-nudge", "is-diagonal-nudge-doubt");
    composer.classList.add("is-loading-penalty-evasion", "is-loading-penalty-bounce");
    syncCatchPosition();
    void composer.offsetWidth;

    posX = nextX;
    posY = nextY;
    syncCatchPosition();
    markSendHitFromBounce();
    recordComposerTrail();

    loadingBounceAnimating = true;
    window.clearTimeout(loadingBounceTimer);
    loadingBounceTimer = window.setTimeout(() => {
      loadingBounceAnimating = false;
      composer.classList.remove("is-loading-penalty-bounce");
      recordComposerTrail();

      if (
        shouldLoadingPenaltyEvasion() &&
        composer.matches(":hover") &&
        isCursorInBounceRange()
      ) {
        bounceComposerFromLoadingHover();
      }
    }, LOADING_BOUNCE_MS);
  }

  function beginLoadingEvasionFromPointer(clientX, clientY) {
    if (!shouldLoadingPenaltyEvasion()) return;

    syncPointerLane(clientX, clientY);
    composerHoveredDuringLoading = true;
    bounceComposerFromLoadingHover();
  }

  function stopLoadingEvasionLoop() {
    composerHoveredDuringLoading = false;
    loadingBounceAnimating = false;
    window.clearTimeout(loadingBounceTimer);
    loadingBounceTimer = 0;
    sendButton?.classList.remove("is-cursor-hit");
    if (sendButton) {
      sendButton.style.backgroundColor = "#000000";
    }
    sendHitActive = false;
    cursorTouching = false;
    composer.classList.remove(
      "is-loading-penalty-evasion",
      "is-loading-penalty-bounce",
    );
    if (locked) syncCatchPosition();
  }

  notifyPotterGenerationChange = function notifyPotterGenerationChangeImpl(active) {
    if (document.body.dataset.character !== "Potter") return;

    if (!active) {
      loadingPenaltyEvasion = false;
      stopLoadingEvasionLoop();
    }
  };

  function tick() {
    if (locked) return;
    if (
      document.body.classList.contains("chat-started") &&
      !penaltyRunawayActive &&
      !conversationEndRunawayActive
    ) {
      return;
    }

    collideWithCursor();
    applyWaterBob();

    posX += velX;
    posY += velY;

    const cx = posX + sizeW / 2;
    const cy = posY + sizeH / 2;
    const nearCursor = Math.hypot(cx - mouseLaneX, cy - mouseLaneY) < REPEL_RADIUS;
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

  function fleeFromPointer(clientX, clientY, { skipRejectHeadline = false } = {}) {
    syncPointerLane(clientX, clientY);
    markSendHitFromBounce();
    cursorTouching = true;
    if (!skipRejectHeadline) triggerRejectHeadline(headline);
    fleeFromCursor();
  }

  function nudgeFromPointer(clientX, clientY) {
    if (shouldLoadingPenaltyEvasion()) {
      composerHoveredDuringLoading = true;
      beginLoadingEvasionFromPointer(clientX, clientY);
      return;
    }

    if (locked) return;
    syncPointerLane(clientX, clientY);

    if (catchReady && isCursorInBounceRange()) {
      placeAtCursor();
      lockComposer();
      return;
    }

    fleeFromPointer(clientX, clientY);
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
    enforceVisible();
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

  function nudgeComposerDiagonal(distanceScale = 1) {
    recordComposerTrail();
    syncSize();
    posX = composer.offsetLeft;
    posY = composer.offsetTop;
    const bounds = getBounds();
    const angle = Math.random() * Math.PI * 2;
    const dist = (220 + Math.random() * 260) * distanceScale;
    posX = clamp(posX + Math.cos(angle) * dist, bounds.minX, bounds.maxX);
    posY = clamp(posY + Math.sin(angle) * dist, bounds.minY, bounds.maxY);

    if (distanceScale > 1) {
      composer.classList.add("is-diagonal-nudge-doubt");
    }
    syncCatchPosition(true);
    const settleMs = distanceScale > 1 ? 680 : 520;
    window.setTimeout(() => {
      composer.classList.remove("is-diagonal-nudge", "is-diagonal-nudge-doubt");
      recordComposerTrail();
    }, settleMs);
  }

  function applyPenaltyStage1() {
    logInteraction("potter.penalty.stage1");
    loadingPenaltyEvasion = true;
    setDoubtHeadline(headline);
    nudgeComposerDiagonal(3);
  }

  function applyPenaltyStage2() {
    logInteraction("potter.penalty.stage2");
    loadingPenaltyEvasion = true;
    setDistantHeadline(headline);
    nudgeComposerDiagonal();
  }

  function startRunawayMode(onCaught, options = {}) {
    const {
      maxDodgeMs = PENALTY_MAX_CATCH_MS,
      minCatchMs = PENALTY_MIN_CATCH_MS,
      catchWindowMs = PENALTY_MAX_CATCH_MS - PENALTY_MIN_CATCH_MS,
      conversationEnd = false,
      onStart,
    } = options;

    pendingCaughtCallback = onCaught ?? null;
    penaltyRunawayActive = !conversationEnd;
    conversationEndRunawayActive = conversationEnd;
    clearPenaltyVisuals();

    logInteraction(conversationEnd ? "potter.runaway.conversation_end" : "potter.runaway.penalty");

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

    mountComposerInLane();
    composer.classList.add("chat-panel__composer--runaway");
    measureSize();
    syncSize();
    posX = composer.offsetLeft;
    posY = composer.offsetTop;
    enforceVisible();

    const angle = Math.random() * Math.PI * 2;
    velX = Math.cos(angle) * IDLE_KICK;
    velY = Math.sin(angle) * IDLE_KICK;

    catchReadyAt = conversationEnd
      ? Math.random() * maxDodgeMs
      : minCatchMs + Math.random() * catchWindowMs;

    onStart?.();
    catchReadyTimer = window.setTimeout(enableCatch, catchReadyAt);
    maxDodgeTimer = window.setTimeout(forceEndDodge, maxDodgeMs);
    rafId = window.requestAnimationFrame(tick);
  }

  function startPenaltyRunaway(onCaught) {
    lowScoreStrikes = 0;
    startRunawayMode(onCaught);
  }

  function startConversationEndRunawayImpl(onCaught) {
    startRunawayMode(onCaught, {
      conversationEnd: true,
      maxDodgeMs: END_RUNAWAY_MAX_MS,
      onStart: () => {
        setConversationEndHeadline(headline);
      },
    });
  }

  startConversationEndRunaway = startConversationEndRunawayImpl;

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
    if (conversationEndRunawayActive) return { deferred: true };
    if (!locked || penaltyRunawayActive) return { deferred: true };

    const score = scoreInput(message);
    if (!isLowScore(score)) return { deferred: false };

    logInteraction("potter.penalty.low_score", { score, strikes: lowScoreStrikes });

    return handleMessageLowScore(onCaught);
  };

  function lockComposer(initialValue = "") {
    if (locked) return;
    locked = true;

    logInteraction("potter.composer.caught", {
      hasInitialValue: Boolean(initialValue),
    });

    penaltyRunawayActive = false;
    conversationEndRunawayActive = false;
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
    recordComposerTrail();
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
    if (
      document.body.dataset.character === "Rupin" ||
      document.body.dataset.character === "Pepper" ||
      document.body.dataset.character === "F1"
    ) {
      return;
    }

    input.disabled = true;
    initHeadline(headline);
    activeMaxDodgeMs = INITIAL_MAX_DODGE_MS;
    catchReadyAt = Math.random() * activeMaxDodgeMs;

    composer.classList.add("chat-panel__composer--runaway");
    mountComposerInLane();
    refreshLayout();
    syncComposerWidth();

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        captureInitialPosition();
        rafId = window.requestAnimationFrame(tick);
      });
    });

    catchReadyTimer = window.setTimeout(enableCatch, catchReadyAt);
    maxDodgeTimer = window.setTimeout(forceEndDodge, activeMaxDodgeMs);

    document.addEventListener("mousemove", (event) => {
      syncPointerLane(event.clientX, event.clientY);
      if (shouldLoadingPenaltyEvasion() && composer.matches(":hover")) {
        composerHoveredDuringLoading = true;
        if (isCursorInBounceRange() && !loadingBounceAnimating) {
          bounceComposerFromLoadingHover();
        } else {
          updateSendHitFromCursor();
        }
        return;
      }
      if (!locked) updateComposerCursorProximity();
    });

    composer.addEventListener("mouseenter", (event) => {
      nudgeFromPointer(event.clientX, event.clientY);
    });

    composer.addEventListener("mouseleave", () => {
      composerHoveredDuringLoading = false;
    });

    input.addEventListener("mousedown", (event) => {
      if (shouldLoadingPenaltyEvasion()) {
        event.preventDefault();
        composerHoveredDuringLoading = true;
        beginLoadingEvasionFromPointer(event.clientX, event.clientY);
        return;
      }
      if (locked) return;
      event.preventDefault();
      nudgeFromPointer(event.clientX, event.clientY);
    });

    input.addEventListener("focus", (event) => {
      if (shouldLoadingPenaltyEvasion()) {
        event.preventDefault();
        input.blur();
        composerHoveredDuringLoading = true;
        beginLoadingEvasionFromPointer(mouseX, mouseY);
        return;
      }
      if (locked) return;
      event.preventDefault();
      input.blur();
      nudgeFromPointer(mouseX, mouseY);
    });

    document.addEventListener("composer:resize", () => {
      measureSize();
      enforceVisible();
    });
  }

  function scheduleRunawayBind() {
    if (document.body.dataset.character !== "Potter") return;

    const bootPending =
      document.body.classList.contains("boot-active") ||
      Boolean(document.getElementById("boot-screen"));

    if (!bootPending) {
      bindRunaway();
      return;
    }

    document.addEventListener("boot:revealed", () => bindRunaway(), { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRunawayBind);
  } else {
    scheduleRunawayBind();
  }
}

export {
  evaluateSubmittedMessage,
  startConversationEndRunaway,
  notifyPotterGenerationChange,
};
