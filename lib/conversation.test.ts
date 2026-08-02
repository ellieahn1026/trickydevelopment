import { describe, expect, test } from "bun:test";
import { buildPotterResponsesInput } from "./conversation";

describe("buildPotterResponsesInput", () => {
  test("returns only the current user message on first turn", () => {
    expect(buildPotterResponsesInput([], "안녕")).toEqual([
      { role: "user", content: "안녕" },
    ]);
  });

  test("includes prior user and assistant turns", () => {
    expect(
      buildPotterResponsesInput(
        [
          { role: "user", content: "내 이름은 민수야" },
          { role: "assistant", content: "그래, 민수." },
        ],
        "내 이름 기억해?",
      ),
    ).toEqual([
      { role: "user", content: "내 이름은 민수야" },
      { role: "assistant", content: "그래, 민수." },
      { role: "user", content: "내 이름 기억해?" },
    ]);
  });

  test("does not duplicate the current user message", () => {
    expect(
      buildPotterResponsesInput(
        [{ role: "user", content: "같은 질문" }],
        "같은 질문",
      ),
    ).toEqual([{ role: "user", content: "같은 질문" }]);
  });

  test("skips behavior entries and empty lines", () => {
    expect(
      buildPotterResponsesInput(
        [
          { role: "user", content: "첫 질문" },
          { role: "assistant", content: "첫 답" },
          { kind: "behavior", action: "silence" },
          { role: "assistant", content: "   " },
        ],
        "이어서",
      ),
    ).toEqual([
      { role: "user", content: "첫 질문" },
      { role: "assistant", content: "첫 답" },
      { role: "user", content: "이어서" },
    ]);
  });
});
