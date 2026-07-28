const activeCharacterButton = () => {
  const name = document.body.dataset.character;
  if (!name) return null;
  return document.querySelector(`.character.is-active[data-name="${name}"]`);
};

export function setCharacterSpeaking(active) {
  const button = activeCharacterButton();
  if (!button?.querySelector(".character__icon--speaking")) return;

  button.classList.toggle("is-speaking", active);
}
