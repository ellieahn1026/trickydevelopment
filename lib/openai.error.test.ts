import { expect, test } from "bun:test";

import { formatOpenAIError } from "./openai";

test("formatOpenAIError maps missing API key", () => {
  expect(formatOpenAIError(new Error("OPENAI_API_KEY is not set. Add it to your .env file."))).toContain(
    "OPENAI_API_KEY",
  );
});

test("formatOpenAIError maps 401 to key guidance", () => {
  expect(
    formatOpenAIError(
      new Error('OpenAI API error (401): {"error":{"message":"Incorrect API key provided"}}'),
    ),
  ).toContain("API 키");
});

test("formatOpenAIError maps prompt failures", () => {
  expect(
    formatOpenAIError(
      new Error('OpenAI API error (400): {"error":{"message":"invalid_prompt"}}'),
    ),
  ).toContain("Prompt");
});

test("formatOpenAIError maps Cursor sandbox network blocks", () => {
  expect(
    formatOpenAIError(
      new Error(
        "OpenAI API error (403): Blocked by sandbox network policy\nDestination: api.openai.com:443\nReason: not on allow list",
      ),
    ),
  ).toContain("Cursor 샌드박스");
});
