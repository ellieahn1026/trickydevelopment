const MAX_ENTRIES = 200;

export function logInteraction(type, detail = {}) {
  const entry = {
    at: new Date().toISOString(),
    character: document.body?.dataset?.character ?? null,
    type,
    ...detail,
  };

  console.info(`[interaction] ${type}`, entry);

  const log = (window.__INTERACTION_LOG__ ??= []);
  log.push(entry);
  if (log.length > MAX_ENTRIES) {
    log.splice(0, log.length - MAX_ENTRIES);
  }

  return entry;
}
