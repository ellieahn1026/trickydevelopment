/** Placeholder scorer — replace with real keyword/content evaluation later. */
function scoreInput(text) {
  if (!text.trim()) return 5;
  return 1 + Math.floor(Math.random() * 5);
}

export { scoreInput };
