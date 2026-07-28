const nameEl = document.getElementById("user-display-name");
const initialEl = document.getElementById("user-initial");

function syncUserInitial() {
  if (!nameEl || !initialEl) return;

  const name = nameEl.textContent.trim();
  initialEl.textContent = name ? name[0].toUpperCase() : "?";
}

syncUserInitial();

export { syncUserInitial };
