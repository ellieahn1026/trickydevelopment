import { expect, test } from "bun:test";

import { resolveLocalApiCandidates } from "./resolve-local-api";

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
