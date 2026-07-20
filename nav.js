document.querySelectorAll(".character").forEach((button) => {
  button.addEventListener("dblclick", () => {
    const href = button.dataset.href;
    if (!href || button.classList.contains("is-active")) return;
    window.location.href = href;
  });
});
