export const LIST_LINE_PATTERN =
  /^\s*(?:([-*+•])|(\d+)[.)])\s+(.+)$/;

const SECTION_LABEL_NAMES =
  "답변|근거|결론|제안|요약|정리|핵심|설명|예시|참고|배경|방법|단계|주의|내용(?:\\s*\\d+)?|Answer|Reason(?:ing)?|Evidence|Conclusion|Suggestion|Summary|Overview|Notes?|Key\\s+points?";

export const SECTION_LABEL_LINE_PATTERN = new RegExp(
  `^\\s*(?:#{1,3}\\s+)?(?:\\*\\*)?(?:${SECTION_LABEL_NAMES})(?:\\*\\*)?[：:]?\\s*$`,
  "i",
);

const SECTION_LABEL_START_PATTERN = new RegExp(
  `(?:#{1,3}\\s+)?(?:\\*\\*)?(?:${SECTION_LABEL_NAMES})(?:\\*\\*)?[：:]?`,
  "i",
);

const BOLD_LABEL_LINE_PATTERN = /^\s*\*\*([^*\n]{1,28})\*\*\s*$/;

export function isSectionLabelLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (SECTION_LABEL_LINE_PATTERN.test(trimmed)) return true;
  if (BOLD_LABEL_LINE_PATTERN.test(trimmed)) return true;
  if (/^\s*#{1,3}\s+\S/.test(trimmed) && trimmed.length <= 40) return true;
  return false;
}

function normalizeSectionBreaks(text) {
  let result = text;

  result = result.replace(
    new RegExp(`(?<=\\S)\\n(?=${SECTION_LABEL_START_PATTERN.source})`, "gi"),
    "\n\n",
  );

  result = result.replace(
    new RegExp(
      `^(${SECTION_LABEL_START_PATTERN.source})\\s*$\\n(?!\\n)`,
      "gim",
    ),
    "$1\n\n",
  );

  result = result.replace(
    /(?<=\S)\n(?=\*\*[^*\n]{1,28}\*\*\s*$)/gm,
    "\n\n",
  );

  result = result.replace(
    /^(\*\*[^*\n]{1,28}\*\*)\s*\n(?!\n)/gm,
    "$1\n\n",
  );

  return result;
}

export function normalizeAnswerText(text) {
  return normalizeSectionBreaks(
    text
      .replace(/\r\n?/g, "\n")
      .replace(/(?<=[^\n])\s+(?=\d+[.)]\s+\S)/g, "\n")
      .replace(/(?<=[^\n])\s+(?=[•*+\-]\s+\S)/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export function appendInlineMarkdown(target, text) {
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    target.append(document.createTextNode(text.slice(cursor, index)));

    const token = match[0];
    const node = document.createElement(token.startsWith("**") ? "strong" : "code");
    node.textContent = token.startsWith("**")
      ? token.slice(2, -2)
      : token.slice(1, -1);
    target.appendChild(node);
    cursor = index + token.length;
  }

  target.append(document.createTextNode(text.slice(cursor)));
}

function createSectionLabelElement(line) {
  const label = document.createElement("p");
  label.className = "chat-answer__section-label";
  appendInlineMarkdown(label, line.trim());
  return label;
}

function createParagraphElement(lines) {
  const paragraph = document.createElement("p");
  appendInlineMarkdown(paragraph, lines.join(" "));
  return paragraph;
}

/**
 * ChatGPT-style blocks: blank line = paragraph break; section labels = own block.
 * @param {string[]} lines
 * @param {(node: Node) => void} append
 */
export function renderFormattedLines(lines, append) {
  let paragraphLines = [];
  let list = null;
  let codeLines = null;
  let codeLanguage = "";

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    append(createParagraphElement(paragraphLines));
    paragraphLines = [];
  };

  const closeList = () => {
    list = null;
  };

  lines.forEach((line) => {
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      closeList();

      if (codeLines) {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        if (codeLanguage) code.dataset.language = codeLanguage;
        code.textContent = codeLines.join("\n");
        pre.appendChild(code);
        append(pre);
        codeLines = null;
        codeLanguage = "";
      } else {
        codeLines = [];
        codeLanguage = fence[1];
      }
      return;
    }

    if (codeLines) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      return;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      closeList();
      append(document.createElement("hr"));
      return;
    }

    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const node = document.createElement(`h${heading[1].length + 2}`);
      appendInlineMarkdown(node, heading[2]);
      append(node);
      return;
    }

    if (isSectionLabelLine(line)) {
      flushParagraph();
      closeList();
      append(createSectionLabelElement(line));
      return;
    }

    const item = line.match(LIST_LINE_PATTERN);
    if (item) {
      flushParagraph();
      const tag = item[2] ? "ol" : "ul";
      if (!list || list.tagName.toLowerCase() !== tag) {
        closeList();
        list = document.createElement(tag);
        append(list);
      }
      const listItem = document.createElement("li");
      appendInlineMarkdown(listItem, item[3]);
      list.appendChild(listItem);
      return;
    }

    closeList();
    paragraphLines.push(line.trim());
  });

  flushParagraph();

  if (codeLines) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    if (codeLanguage) code.dataset.language = codeLanguage;
    code.textContent = codeLines.join("\n");
    pre.appendChild(code);
    append(pre);
  }
}

export function renderAnswerMarkdown(el, text) {
  const fragment = document.createDocumentFragment();
  renderFormattedLines(normalizeAnswerText(text).split("\n"), (node) => {
    fragment.appendChild(node);
  });

  el.classList.add("chat-answer--formatted");
  el.replaceChildren(fragment);
}

export function hasStructuredAnswer(text) {
  const normalized = normalizeAnswerText(text);
  return (
    normalized.includes("\n\n") ||
    /^\s*(?:#{1,3}\s+|[-*+•]\s+|\d+[.)]\s+|```)/m.test(normalized) ||
    /(?<=[^\n])\s+\d+[.)]\s+\S/.test(normalized) ||
    SECTION_LABEL_LINE_PATTERN.test(normalized)
  );
}
