import { test, expect } from "bun:test";

import { createInitialEmotionState } from "../models/emotion.ts";
import { buildCharacterPrompt } from "./characterPrompt.ts";

test("buildCharacterPrompt includes angry high-intensity guidance", () => {
  const prompt = buildCharacterPrompt({
    ...createInitialEmotionState(),
    mood: "angry",
    intensity: 95,
  });

  expect(prompt).toContain("MUST follow while mood is angry");
  expect(prompt).toContain("disappointed mentor");
  expect(prompt).toContain("정신 차리고 제대로 좀 해!");
  expect(prompt).toContain("maximum frustration");
  expect(prompt).toContain("Do not threaten real-world violence");
  expect(prompt).not.toContain("intensity 95");
});

test("buildCharacterPrompt includes happy teenage-girl voice profile", () => {
  const happy = buildCharacterPrompt({
    ...createInitialEmotionState(),
    mood: "happy",
    intensity: 70,
  });

  expect(happy).toContain("MUST follow while mood is happy");
  expect(happy).toContain("extremely excited bright teenage girl");
  expect(happy).toContain("헐!");
  expect(happy).toContain("extremely excited teenage girl");
});

test("buildCharacterPrompt includes groggy voice for sad and neutral moods", () => {
  const sad = buildCharacterPrompt({
    ...createInitialEmotionState(),
    mood: "sad",
    intensity: 70,
    resentment: 55,
    trust: 20,
  });
  const neutral = buildCharacterPrompt({
    ...createInitialEmotionState(),
    mood: "neutral",
    intensity: 70,
  });

  for (const prompt of [sad, neutral]) {
    expect(prompt).toContain("Groggy / sad voice profile");
    expect(prompt).toContain("deeply cynical");
    expect(prompt).toContain("Must be nice");
    expect(prompt).toContain("Do NOT sound bright, cheerful");
  }

  expect(sad).toContain("distrust the user");
});

test("buildCharacterPrompt prioritizes mood override instructions", () => {
  const prompt = buildCharacterPrompt({
    ...createInitialEmotionState(),
    mood: "sad",
    intensity: 40,
  });

  expect(prompt.indexOf("CRITICAL — mood voice overrides everything else")).toBeLessThan(
    prompt.indexOf("Current mood: sad"),
  );
  expect(prompt).toContain("OVERRIDES any default Pepper tone");
});

test("buildCharacterPrompt scales happy intensity by band", () => {
  const low = buildCharacterPrompt({
    ...createInitialEmotionState(),
    mood: "happy",
    intensity: 10,
  });
  const high = buildCharacterPrompt({
    ...createInitialEmotionState(),
    mood: "happy",
    intensity: 95,
  });

  expect(low).toContain("lightly upbeat");
  expect(high).toContain("maximum hype");
});
