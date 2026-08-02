import { test, expect } from "bun:test";
import {
  hasStructuredAnswer,
  isSectionLabelLine,
  normalizeAnswerText,
  renderAnswerMarkdown,
} from "./answer-markdown.js";

function makeElement(tag = "div") {
  const el = {
    tagName: tag.toUpperCase(),
    className: "",
    classList: { values: [], add(value) { this.values.push(value); } },
    children: [],
    textContent: "",
    dataset: {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
  };
  return el;
}

function makeText(value) {
  return { nodeType: 3, textContent: value };
}

globalThis.document = {
  createElement(tag) {
    return makeElement(tag);
  },
  createDocumentFragment() {
    return {
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    };
  },
  createTextNode(value) {
    return makeText(value);
  },
};

function paragraphText(node) {
  return node.children.map((child) => child.textContent).join("");
}

test("normalizeAnswerText splits inline numbered items onto separate lines", () => {
  expect(normalizeAnswerText("Intro. 1. First 2. Second 3. Third")).toBe(
    "Intro.\n1. First\n2. Second\n3. Third",
  );
});

test("normalizeAnswerText inserts blank lines around section labels", () => {
  expect(
    normalizeAnswerText("답변\n내용입니다.\n근거\n이유입니다.\n결론\n마무리.\n제안\n시도해보세요."),
  ).toBe(
    "답변\n\n내용입니다.\n\n근거\n\n이유입니다.\n\n결론\n\n마무리.\n\n제안\n\n시도해보세요.",
  );
});

test("isSectionLabelLine detects Korean section headers", () => {
  expect(isSectionLabelLine("답변")).toBe(true);
  expect(isSectionLabelLine("근거:")).toBe(true);
  expect(isSectionLabelLine("내용 1")).toBe(true);
  expect(isSectionLabelLine("결론")).toBe(true);
  expect(isSectionLabelLine("제안")).toBe(true);
  expect(isSectionLabelLine("일반 문장입니다.")).toBe(false);
});

test("renderAnswerMarkdown keeps single newlines in one paragraph", () => {
  const el = makeElement("div");
  renderAnswerMarkdown(el, "First sentence.\nStill same paragraph.");

  const fragment = el.children[0];
  const paragraphs = fragment.children.filter((node) => node.tagName === "P");
  expect(paragraphs.length).toBe(1);
  expect(paragraphText(paragraphs[0])).toBe("First sentence. Still same paragraph.");
});

test("renderAnswerMarkdown splits paragraphs on blank lines", () => {
  const el = makeElement("div");
  renderAnswerMarkdown(el, "First paragraph.\n\nSecond paragraph.");

  const fragment = el.children[0];
  const paragraphs = fragment.children.filter(
    (node) => node.tagName === "P" && !node.className.includes("section-label"),
  );
  expect(paragraphs.length).toBe(2);
  expect(paragraphText(paragraphs[0])).toBe("First paragraph.");
  expect(paragraphText(paragraphs[1])).toBe("Second paragraph.");
});

test("renderAnswerMarkdown renders section labels as separate blocks", () => {
  const el = makeElement("div");
  renderAnswerMarkdown(
    el,
    "답변\n내용 1입니다.\n\n근거\n근거 설명.\n\n결론\n결론 내용.\n\n제안\n제안 내용.",
  );

  const fragment = el.children[0];
  const labels = fragment.children.filter(
    (node) => node.className === "chat-answer__section-label",
  );
  expect(labels.map((node) => paragraphText(node))).toEqual([
    "답변",
    "근거",
    "결론",
    "제안",
  ]);
});

test("renderAnswerMarkdown renders numbered lists with one item per line", () => {
  const el = makeElement("div");
  renderAnswerMarkdown(
    el,
    "Steps:\n\n1. Prepare\n2. Execute\n3. Review",
  );

  const fragment = el.children[0];
  const list = fragment.children.find((node) => node.tagName === "OL");
  expect(list).toBeTruthy();
  const items = list.children.filter((node) => node.tagName === "LI");
  expect(items.length).toBe(3);
});

test("hasStructuredAnswer detects section labels", () => {
  expect(hasStructuredAnswer("답변\n내용")).toBe(true);
  expect(hasStructuredAnswer("Plain single sentence.")).toBe(false);
});
