import { test, expect } from "bun:test";
import {
  activateReplaceAnnotation,
  isBlockHideContent,
} from "./answer-renderer.js";

test("isBlockHideContent detects multiline and long spans", () => {
  expect(isBlockHideContent("short phrase")).toBe(false);
  expect(isBlockHideContent("line one\nline two")).toBe(true);
  expect(isBlockHideContent("paragraph one\n\nparagraph two")).toBe(true);
  expect(isBlockHideContent("# Heading block")).toBe(true);
  expect(isBlockHideContent("a".repeat(121))).toBe(true);
});

test("activateReplaceAnnotation switches idle replace annotation to active", () => {
  const attributes = new Map([
    ["aria-expanded", "false"],
    ["aria-hidden", "true"],
  ]);

  const lead = {
    getBoundingClientRect: () => ({ height: 20 }),
    style: {},
  };

  const panel = {
    setAttribute: (n, v) => attributes.set(`panel:${n}`, v),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const el = {
    dataset: { state: "idle" },
    classList: {
      values: [],
      add(value) {
        this.values.push(value);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    querySelector(selector) {
      if (selector === ".replace-lead") return lead;
      if (selector === ".replace-replacement") {
        return {
          setAttribute: (n, v) => attributes.set(`replacement:${n}`, v),
        };
      }
      if (selector === ".replace-original-panel") return panel;
      if (selector === ".replace-original-inline") {
        return {
          setAttribute: (n, v) => attributes.set(`inline:${n}`, v),
        };
      }
      return null;
    },
  };

  expect(activateReplaceAnnotation(el)).toBe(true);
  expect(el.dataset.state).toBe("active");
  expect(el.classList.values).toContain("replace-annotation--active");
  expect(attributes.get("aria-expanded")).toBe("true");
  expect(attributes.get("replacement:aria-hidden")).toBe("false");
  expect(attributes.get("panel:aria-hidden")).toBe("false");
  expect(attributes.get("inline:aria-hidden")).toBe("true");
});
