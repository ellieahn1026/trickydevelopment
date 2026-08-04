/** Keep composer width tied to --composer-w (80% of sideline-right lane) on resize. */
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

  composer.style.removeProperty("width");
  composer.style.removeProperty("max-width");
}

function onViewportResize() {
  syncComposerWidth();
  document.dispatchEvent(new CustomEvent("composer:resize"));
}

window.addEventListener("resize", onViewportResize);
window.visualViewport?.addEventListener("resize", onViewportResize);
