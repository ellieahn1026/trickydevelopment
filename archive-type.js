const ARCHIVE_ENTRIES = [
  `(1) Reading your message carefully and identifying the main question. Looking for the most relevant information while keeping the response clear, accurate, and easy to understand. Comparing a few possible approaches before deciding on the one that best matches your request. Organizing the explanation into a logical order so it is simple to follow. Double-checking for consistency, clarity, and completeness. Making a few final refinements before generating the response.`,
  `(2) Analyzing the request in context and determining the user's intent. Searching through relevant knowledge and evaluating multiple possible answers. Filtering out unnecessary details and focusing on the information that will be the most useful. Restructuring the explanation to improve readability and flow. Performing a final review for accuracy before preparing the response.`,
  `(3) Organizing the response...`,
];

const TYPE_INTERVAL_MS = 8;
const archive = document.querySelector(".archive-text");

let lastEntryIndex = -1;
let typing = false;
const queue = [];

function pickRandomEntry() {
  if (ARCHIVE_ENTRIES.length === 1) return ARCHIVE_ENTRIES[0];

  let index;
  do {
    index = Math.floor(Math.random() * ARCHIVE_ENTRIES.length);
  } while (index === lastEntryIndex);

  lastEntryIndex = index;
  return ARCHIVE_ENTRIES[index];
}

function typeNextEntry() {
  if (!archive || typing || queue.length === 0) return;

  typing = true;
  archive.classList.add("is-typing");

  const entry = queue.shift();
  const prefix = archive.textContent.trim() ? "\n\n" : "";
  const text = `${prefix}${entry}`;
  let index = 0;

  const timer = window.setInterval(() => {
    archive.textContent += text[index];
    index += 1;

    if (index >= text.length) {
      window.clearInterval(timer);
      typing = false;
      archive.classList.remove("is-typing");
      typeNextEntry();
    }
  }, TYPE_INTERVAL_MS);
}

function appendRandomArchiveEntry() {
  if (!archive) return;
  queue.push(pickRandomEntry());
  typeNextEntry();
}

if (archive) {
  archive.textContent = "";
  appendRandomArchiveEntry();
}

export { appendRandomArchiveEntry };
