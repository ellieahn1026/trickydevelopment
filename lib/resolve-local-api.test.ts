import { expect, test } from "bun:test";

import {
  isRetryableLocalApiResponse,
  resolveLocalApiCandidates,
} from "./resolve-local-api";

test("resolveLocalApiCandidates prefers same origin on localhost", () => {
  globalThis.window = {
    location: {
      protocol: "http:",
      hostname: "localhost",
      port: "3000",
      origin: "http://localhost:3000",
    },
  } as Window & typeof globalThis;

  const candidates = resolveLocalApiCandidates("/api/chat");
  expect(candidates[0]).toBe("http://localhost:3000/api/chat");
  expect(candidates).toContain("http://localhost:3001/api/chat");
});

test("resolveLocalApiCandidates falls back to dev ports for file URLs", () => {
  globalThis.window = {
    location: {
      protocol: "file:",
      hostname: "",
      port: "",
      origin: "null",
    },
  } as Window & typeof globalThis;

  const candidates = resolveLocalApiCandidates("/chat");
  expect(candidates[0]).toBe("http://localhost:3000/chat");
  expect(candidates).toContain("http://localhost:3001/chat");
});

test("isRetryableLocalApiResponse retries sandbox-blocked OpenAI errors", () => {
  const response = new Response(null, { status: 500 });
  const body =
    "OpenAI API error (403): Blocked by sandbox network policy\nDestination: api.openai.com:443";

  expect(isRetryableLocalApiResponse(response, body)).toBe(true);
});

test("isRetryableLocalApiResponse does not retry normal OpenAI quota errors", () => {
  const response = new Response(null, { status: 429 });
  const body = "OpenAI 요청 한도에 도달했습니다.";

  expect(isRetryableLocalApiResponse(response, body)).toBe(false);
});
