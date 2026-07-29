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

export function renderAnswerMarkdown(el, text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const fragment = document.createDocumentFragment();
  let paragraphLines = [];
  let list = null;
  let codeLines = null;
  let codeLanguage = "";

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const paragraph = document.createElement("p");
    appendInlineMarkdown(paragraph, paragraphLines.join("\n"));
    fragment.appendChild(paragraph);
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
        fragment.appendChild(pre);
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
      fragment.appendChild(document.createElement("hr"));
      return;
    }

    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const node = document.createElement(`h${heading[1].length + 2}`);
      appendInlineMarkdown(node, heading[2]);
      fragment.appendChild(node);
      return;
    }

    const item = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
    if (item) {
      flushParagraph();
      const tag = item[2] ? "ol" : "ul";
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = document.createElement(tag);
        fragment.appendChild(list);
      }
      const listItem = document.createElement("li");
      appendInlineMarkdown(listItem, item[3]);
      list.appendChild(listItem);
      return;
    }

    closeList();
    paragraphLines.push(line);
  });

  if (codeLines) {
    paragraphLines.push(`\`\`\`${codeLanguage}`, ...codeLines);
  }
  flushParagraph();

  el.classList.add("chat-answer--formatted");
  el.replaceChildren(fragment);
}

export function hasStructuredAnswer(text) {
  return (
    text.includes("\n") ||
    /^\s*(?:#{1,3}\s+|[-*+]\s+|\d+[.)]\s+|```)/m.test(text)
  );
}
