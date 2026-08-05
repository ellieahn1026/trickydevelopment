/**
 * Layout engine — single source of truth for viewport-derived px values.
 *
 * Why this exists:
 * - html { zoom: 0.8 } makes Chrome and Safari disagree on 100vw, calc(), and rect/offset mapping.
 * - Browser sniffing is fragile; we never use 100vw for layout math.
 * - All layout-critical vars are computed from innerWidth/innerHeight + --layout-zoom, then written as px.
 * - Pointer ↔ layout conversion uses each element's offsetWidth / getBoundingClientRect ratio.
 */

const SIDELINE_LEFT_PX = 365;
const COMPOSER_LANE_FRACTION = 0.8;

/** @type {LayoutMetrics | null} */
let metrics = null;

/** @type {import("./layout-engine.js").LayoutMetrics} */
const EMPTY = {
  zoom: 1,
  innerWidth: 0,
  innerHeight: 0,
  lvw: 0,
  lvh: 0,
  sidelineLeft: SIDELINE_LEFT_PX,
  sidelineLaneWidth: 0,
  composerW: 0,
  sidelineLaneCenterX: 0,
};

/**
 * @typedef {Object} LayoutMetrics
 * @property {number} zoom
 * @property {number} innerWidth
 * @property {number} innerHeight
 * @property {number} lvw
 * @property {number} lvh
 * @property {number} sidelineLeft
 * @property {number} sidelineLaneWidth
 * @property {number} composerW
 * @property {number} sidelineLaneCenterX
 */

export function readLayoutZoom() {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/** Compute layout px from viewport — never reads 100vw. */
export function computeLayoutMetrics() {
  const zoom = readLayoutZoom();
  const innerWidth = window.innerWidth;
  const innerHeight = window.visualViewport?.height ?? window.innerHeight;
  const lvw = innerWidth / zoom;
  const lvh = innerHeight / zoom;
  const sidelineLaneWidth = Math.max(0, lvw - SIDELINE_LEFT_PX);
  const composerW = sidelineLaneWidth * COMPOSER_LANE_FRACTION;

  metrics = {
    zoom,
    innerWidth,
    innerHeight,
    lvw,
    lvh,
    sidelineLeft: SIDELINE_LEFT_PX,
    sidelineLaneWidth,
    composerW,
    sidelineLaneCenterX: SIDELINE_LEFT_PX + sidelineLaneWidth / 2,
  };

  return metrics;
}

export function getLayoutMetrics() {
  return metrics ?? computeLayoutMetrics();
}

/** Write px-only custom properties — CSS must not calc() these from 100vw. */
export function applyLayoutMetrics(next = getLayoutMetrics()) {
  const html = document.documentElement;
  html.style.setProperty("--lvw", `${next.lvw}px`);
  html.style.setProperty("--lvh", `${next.lvh}px`);
  html.style.setProperty("--sideline-lane-width", `${next.sidelineLaneWidth}px`);
  html.style.setProperty("--composer-w", `${next.composerW}px`);
  html.style.setProperty("--sideline-lane-center-x", `${next.sidelineLaneCenterX}px`);
  return next;
}

export function refreshLayout() {
  return applyLayoutMetrics(computeLayoutMetrics());
}

/** Layout px size — offsetWidth/offsetHeight live in the same space as our CSS px vars. */
export function elementLayoutSize(el) {
  if (!el) return { width: 0, height: 0 };
  return { width: el.offsetWidth, height: el.offsetHeight };
}

/**
 * Map viewport client coords → element-local layout px.
 * Uses per-element visual/layout scale (works under html zoom in Chrome + Safari).
 */
export function clientToLayoutLocal(el, clientX, clientY) {
  if (!el) return { x: clientX, y: clientY };

  const rect = el.getBoundingClientRect();
  const layoutW = el.offsetWidth;
  const layoutH = el.offsetHeight;
  const scaleX = rect.width > 0 ? layoutW / rect.width : 1;
  const scaleY = rect.height > 0 ? layoutH / rect.height : 1;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export function targetComposerWidthPx() {
  return getLayoutMetrics().composerW;
}

export function targetLaneWidthPx() {
  return getLayoutMetrics().sidelineLaneWidth;
}

function bindLayoutEngine() {
  const sync = () => {
    refreshLayout();
    document.dispatchEvent(new CustomEvent("layout:refresh"));
  };

  window.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }
}

bindLayoutEngine();

if (typeof window !== "undefined") {
  window.getLayoutMetrics = getLayoutMetrics;
  window.refreshLayout = refreshLayout;
}

export { EMPTY as emptyLayoutMetrics };
