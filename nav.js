const characterButtons = [...document.querySelectorAll(".character")];
const activeCharacter = document.body.dataset.character;

function syncActiveCharacter(name) {
  characterButtons.forEach((button) => {
    const isActive = button.dataset.name === name;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

syncActiveCharacter(activeCharacter);

characterButtons.forEach((button) => {
  button.addEventListener("dblclick", () => {
    const href = button.dataset.href;
    if (!href || button.classList.contains("is-active")) return;
    syncActiveCharacter(button.dataset.name);
    window.location.href = href;
  });
});
