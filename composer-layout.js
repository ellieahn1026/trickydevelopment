/**
 * Composer width sync — delegates layout px to layout-engine.js.
 * Debug logging available via ?composer-debug=1
 */

import {
  clientToLayoutLocal,
  computeLayoutMetrics,
  elementLayoutSize,
  getLayoutMetrics,
  readLayoutZoom,
  refreshLayout,
  targetComposerWidthPx,
  targetLaneWidthPx,
} from "./layout-engine.js";

const COMPOSER_DEBUG =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).has("composer-debug") ||
    window.localStorage?.getItem("composer-debug") === "1");

export {
  clientToLayoutLocal,
  computeLayoutMetrics,
  elementLayoutSize,
  getLayoutMetrics,
  readLayoutZoom as layoutZoom,
  refreshLayout,
  targetComposerWidthPx,
  targetLaneWidthPx,
};

/** @deprecated Use elementLayoutSize — kept for existing imports */
export function layoutRectSize(el) {
  return elementLayoutSize(el);
}

export function syncLayoutViewportVars() {
  return refreshLayout();
}

function isPotterPage() {
  return document.body.dataset.character === "Potter";
}

function applyLayoutWidth(el, px) {
  if (!el || !(px > 0)) return;
  el.style.setProperty("width", `${px}px`, "important");
  el.style.setProperty("max-width", `${px}px`, "important");
}

/** Pin px widths on every visible Potter composer surface (boot-fake + runaway). */
export function syncPotterVisibleWidths() {
  if (!isPotterPage()) return;

  const m = getLayoutMetrics();
  applyLayoutWidth(document.querySelector(".boot-fake__composer-wrap"), m.composerW);
  applyLayoutWidth(document.querySelector(".chat-panel__composer"), m.composerW);

  const lane = document.querySelector(".potter-composer-lane");
  if (lane) {
    lane.style.setProperty("width", `${m.sidelineLaneWidth}px`, "important");
  }

  const center = document.querySelector(".boot-fake__center");
  if (center) {
    center.style.setProperty("width", `${m.sidelineLaneWidth}px`, "important");
  }
}

export function applyPotterComposerWidth(composer) {
  if (!composer) return 0;
  const width = targetComposerWidthPx();
  applyLayoutWidth(composer, width);
  return width;
}

export function syncComposerWidth() {
  const composer = document.querySelector(".chat-panel__composer");

  if (composer?.classList.contains("f1-composer--animating")) {
    composer.style.removeProperty("width");
    composer.style.removeProperty("max-width");
    void composer.offsetWidth;
    const newW = composer.offsetWidth;
    composer.style.setProperty("width", `${newW}px`, "important");
    composer.style.setProperty("max-width", `${newW}px`, "important");
    return;
  }

  if (isPotterPage()) {
    syncPotterVisibleWidths();
    return;
  }

  if (!composer) return;

  composer.style.removeProperty("width");
  composer.style.removeProperty("max-width");
}

function elementVisualWidth(el) {
  return el?.getBoundingClientRect().width ?? null;
}

export function logComposerWidthDebug(label = "composer-width") {
  const m = getLayoutMetrics();
  const lane = document.querySelector(".potter-composer-lane");
  const composer = document.querySelector(".chat-panel__composer");
  const bootWrap = document.querySelector(".boot-fake__composer-wrap");
  const bootCenter = document.querySelector(".boot-fake__center");

  const payload = {
    label,
    engine: m,
    dom: {
      bootWrap: bootWrap
        ? {
            layout: elementLayoutSize(bootWrap).width,
            visual: elementVisualWidth(bootWrap),
            computed: getComputedStyle(bootWrap).width,
            inline: bootWrap.style.width,
          }
        : null,
      bootCenter: bootCenter
        ? {
            layout: elementLayoutSize(bootCenter).width,
            visual: elementVisualWidth(bootCenter),
            computed: getComputedStyle(bootCenter).width,
          }
        : null,
      lane: lane
        ? {
            layout: elementLayoutSize(lane).width,
            visual: elementVisualWidth(lane),
            computed: getComputedStyle(lane).width,
          }
        : null,
      composer: composer
        ? {
            layout: elementLayoutSize(composer).width,
            visual: elementVisualWidth(composer),
            computed: getComputedStyle(composer).width,
            inline: composer.style.width,
            runaway: composer.classList.contains("chat-panel__composer--runaway"),
          }
        : null,
    },
    deltas: {
      bootWrap_vs_engine: bootWrap ? elementLayoutSize(bootWrap).width - m.composerW : null,
      bootWrapVisual_vs_engineVisual: bootWrap
        ? elementVisualWidth(bootWrap) - m.composerW * m.zoom
        : null,
      lane_vs_engine: lane ? elementLayoutSize(lane).width - m.sidelineLaneWidth : null,
      composer_vs_engine: composer ? elementLayoutSize(composer).width - m.composerW : null,
      composerVisual_vs_engineVisual: composer
        ? elementVisualWidth(composer) - m.composerW * m.zoom
        : null,
    },
  };

  console.group(`[composer-debug] ${label}`);
  console.log(payload);
  console.groupEnd();
  return payload;
}

function onLayoutRefresh() {
  syncComposerWidth();
  document.dispatchEvent(new CustomEvent("composer:resize"));
  if (COMPOSER_DEBUG && isPotterPage()) {
    logComposerWidthDebug("layout:refresh");
  }
}

document.addEventListener("layout:refresh", onLayoutRefresh);

if (typeof window !== "undefined") {
  window.logComposerWidthDebug = logComposerWidthDebug;
  window.syncLayoutViewportVars = syncLayoutViewportVars;
  window.syncPotterVisibleWidths = syncPotterVisibleWidths;

  if (COMPOSER_DEBUG && isPotterPage()) {
    document.addEventListener("DOMContentLoaded", () => logComposerWidthDebug("boot"));
    document.addEventListener("boot:revealed", () => logComposerWidthDebug("boot:revealed"), {
      once: true,
    });
  }
}
