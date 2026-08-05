/** Keep composer width tied to --composer-w (80% of sideline-right lane) on resize. */

const COMPOSER_DEBUG =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).has("composer-debug") ||
    window.localStorage?.getItem("composer-debug") === "1");

function readCssPx(root, name) {
  const raw = root.getPropertyValue(name).trim();
  const parsed = parseFloat(raw);
  return { raw, px: Number.isFinite(parsed) ? parsed : null };
}

/** Log every input in the --composer-w calc chain + DOM measurements (Safari vs Chrome). */
export function logComposerWidthDebug(label = "composer-width") {
  const root = getComputedStyle(document.documentElement);
  const html = document.documentElement;
  const body = document.body;
  const lane = document.querySelector(".potter-composer-lane");
  const composer = document.querySelector(".chat-panel__composer");
  const vv = window.visualViewport;

  const layoutZoomVar = readCssPx(root, "--layout-zoom");
  const lvw = readCssPx(root, "--lvw");
  const lvh = readCssPx(root, "--lvh");
  const sidelineLeft = readCssPx(root, "--sideline-left");
  const sidelineLaneWidth = readCssPx(root, "--sideline-lane-width");
  const composerW = readCssPx(root, "--composer-w");
  const sidelineLaneCenterX = readCssPx(root, "--sideline-lane-center-x");

  const zoom = layoutZoom();
  const htmlRect = html.getBoundingClientRect();
  const laneRect = lane?.getBoundingClientRect();
  const composerRect = composer?.getBoundingClientRect();

  const innerW = window.innerWidth;
  const outerW = window.outerWidth;
  const docClientW = html.clientWidth;
  const docScrollW = html.scrollWidth;
  const bodyClientW = body?.clientWidth ?? null;

  const vwProbe = document.createElement("div");
  vwProbe.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(vwProbe);
  const vwProbeRect = vwProbe.getBoundingClientRect();
  document.body.removeChild(vwProbe);

  const manualLvw = innerW / (layoutZoomVar.px ?? 1);
  const manualLane = manualLvw - (sidelineLeft.px ?? 0);
  const manualComposerW = manualLane * 0.8;

  const payload = {
    label,
    character: body?.dataset.character ?? null,
    userAgent: navigator.userAgent,
    // CSS custom properties (computed on :root)
    cssVars: {
      "--layout-zoom": layoutZoomVar,
      "--lvw": lvw,
      "--lvh": lvh,
      "--sideline-left": sidelineLeft,
      "--sideline-lane-width": sidelineLaneWidth,
      "--sideline-lane-center-x": sidelineLaneCenterX,
      "--composer-w": composerW,
    },
    // Manual JS recompute from innerWidth (compare to CSS calc)
    manualFromInnerWidth: {
      innerWidth: innerW,
      lvw: manualLvw,
      sidelineLaneWidth: manualLane,
      composerW: manualComposerW,
    },
    // Viewport probes
    viewport: {
      innerWidth: innerW,
      outerWidth: outerW,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      visualViewport: vv
        ? {
            width: vv.width,
            height: vv.height,
            scale: vv.scale,
            offsetLeft: vv.offsetLeft,
            offsetTop: vv.offsetTop,
          }
        : null,
      probe100vw: vwProbeRect.width,
      documentElement: {
        clientWidth: docClientW,
        scrollWidth: docScrollW,
        offsetWidth: html.offsetWidth,
        getBoundingClientRectWidth: htmlRect.width,
        computedWidth: root.width,
        computedZoom: root.zoom,
        layoutZoomParsed: zoom,
      },
      bodyClientWidth: bodyClientW,
    },
    // DOM actual sizes (visual + layout-normalized)
    dom: {
      lane: lane
        ? {
            clientWidth: lane.clientWidth,
            offsetWidth: lane.offsetWidth,
            rectWidth: laneRect?.width ?? null,
            layoutWidth: layoutRectSize(lane).width,
            computedWidth: getComputedStyle(lane).width,
            computedLeft: getComputedStyle(lane).left,
            computedRight: getComputedStyle(lane).right,
          }
        : null,
      composer: composer
        ? {
            clientWidth: composer.clientWidth,
            offsetWidth: composer.offsetWidth,
            rectWidth: composerRect?.width ?? null,
            layoutWidth: layoutRectSize(composer).width,
            computedWidth: getComputedStyle(composer).width,
            computedMaxWidth: getComputedStyle(composer).maxWidth,
            inlineWidth: composer.style.width || null,
            resolvePotterComposerWidth: resolvePotterComposerWidth(lane),
          }
        : null,
    },
    // Deltas (where Safari usually diverges)
    deltas: {
      composerW_vs_laneLayoutWidth:
        composerW.px != null && lane
          ? composerW.px - layoutRectSize(lane).width
          : null,
      composerW_vs_laneClientWidth:
        composerW.px != null && lane ? composerW.px - lane.clientWidth : null,
      cssComposerW_vs_manualComposerW:
        composerW.px != null ? composerW.px - manualComposerW : null,
      probe100vw_vs_innerWidth: vwProbeRect.width - innerW,
      lvw_vs_manualLvw: lvw.px != null ? lvw.px - manualLvw : null,
      sidelineLaneWidth_vs_laneLayoutWidth:
        sidelineLaneWidth.px != null && lane
          ? sidelineLaneWidth.px - layoutRectSize(lane).width
          : null,
    },
  };

  console.group(`[composer-debug] ${label}`);
  console.table(payload.cssVars);
  console.log("viewport", payload.viewport);
  console.log("manualFromInnerWidth", payload.manualFromInnerWidth);
  console.log("dom", payload.dom);
  console.log("deltas", payload.deltas);
  console.groupEnd();

  return payload;
}

export function layoutZoom() {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/** Layout px from getBoundingClientRect (Safari-safe under html zoom). */
export function layoutRectSize(el) {
  if (!el) return { width: 0, height: 0 };
  const z = layoutZoom();
  const rect = el.getBoundingClientRect();
  return { width: rect.width / z, height: rect.height / z };
}

export function targetComposerWidthPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--composer-w").trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Target Potter runaway width: --composer-w (80% lane), never full lane width. */
export function resolvePotterComposerWidth(lane) {
  const { width: laneW } = layoutRectSize(lane);
  let targetW = targetComposerWidthPx();
  if (!(targetW > 0) && laneW > 0) targetW = laneW * 0.8;
  if (!(targetW > 0)) return 0;
  return laneW > 0 ? Math.min(targetW, laneW) : targetW;
}

export function applyPotterComposerWidth(composer, lane) {
  if (!composer) return 0;
  const width = resolvePotterComposerWidth(lane);
  if (!(width > 0)) {
    composer.style.removeProperty("width");
    composer.style.removeProperty("max-width");
    return 0;
  }
  composer.style.setProperty("width", `${width}px`, "important");
  composer.style.setProperty("max-width", `${width}px`, "important");
  return width;
}

function isPotterRunawayComposer(composer) {
  return (
    document.body.dataset.character === "Potter" &&
    composer.classList.contains("chat-panel__composer--runaway")
  );
}

export function syncComposerWidth() {
  const composer = document.querySelector(".chat-panel__composer");
  if (!composer) return;

  if (composer.classList.contains("f1-composer--animating")) {
    composer.style.removeProperty("width");
    composer.style.removeProperty("max-width");
    void composer.offsetWidth;
    const newW = composer.getBoundingClientRect().width;
    composer.style.setProperty("width", `${newW}px`, "important");
    composer.style.setProperty("max-width", `${newW}px`, "important");
    return;
  }

  if (isPotterRunawayComposer(composer)) {
    const lane = document.querySelector(".potter-composer-lane");
    applyPotterComposerWidth(composer, lane);
    return;
  }

  composer.style.removeProperty("width");
  composer.style.removeProperty("max-width");
}

function onViewportResize() {
  syncComposerWidth();
  document.dispatchEvent(new CustomEvent("composer:resize"));
  if (COMPOSER_DEBUG && document.body?.dataset.character === "Potter") {
    logComposerWidthDebug("resize");
  }
}

window.addEventListener("resize", onViewportResize);
window.visualViewport?.addEventListener("resize", onViewportResize);

if (typeof window !== "undefined") {
  window.logComposerWidthDebug = logComposerWidthDebug;

  const bootLog = () => {
    if (!COMPOSER_DEBUG || document.body?.dataset.character !== "Potter") return;
    logComposerWidthDebug("boot");
    document.addEventListener(
      "boot:revealed",
      () => logComposerWidthDebug("boot:revealed"),
      { once: true },
    );
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootLog);
  } else {
    bootLog();
  }
}
