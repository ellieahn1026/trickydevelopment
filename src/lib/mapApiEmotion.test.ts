import { test, expect } from "bun:test";

import { mapApiEmotion } from "./mapApiEmotion.ts";

test("mapApiEmotion maps backend moods to UI moods", () => {
  expect(mapApiEmotion({ mood: "happy", intensity: 40 })).toEqual({
    mood: "happy",
    intensity: 40,
  });
  expect(mapApiEmotion({ mood: "angry", intensity: 90 })).toEqual({
    mood: "angry",
    intensity: 90,
  });
  expect(mapApiEmotion({ mood: "neutral", intensity: 25 })).toEqual({
    mood: "groggy",
    intensity: 25,
  });
  expect(mapApiEmotion({ mood: "sad", intensity: 55 })).toEqual({
    mood: "groggy",
    intensity: 55,
  });
});
