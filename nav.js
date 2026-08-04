const characterButtons = [...document.querySelectorAll(".character")];
const f1Link = document.querySelector(".character--f1");
const activeCharacter = document.body.dataset.character;

function syncActiveCharacter(name) {
  characterButtons.forEach((button) => {
    const isActive = button.dataset.name === name;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (f1Link) {
    const isF1 = name === "F1";
    f1Link.classList.toggle("is-active", isF1);
    f1Link.setAttribute("aria-current", isF1 ? "page" : "false");
  }
}

syncActiveCharacter(activeCharacter);

characterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const href = button.dataset.href;
    if (!href || button.classList.contains("is-active")) return;
    syncActiveCharacter(button.dataset.name);
    window.location.href = href;
  });
});
