import { test, expect } from "bun:test";
import {
  createAssistantMessageId,
  parseAssistantResult,
  validateAnnotation,
  validateAssistantPayload,
  validateRevision,
  validateUncertainty,
} from "./assistant-result";

test("parseAssistantResult supports legacy mood schema", () => {
  const parsed = parseAssistantResult(
    JSON.stringify({ answer: "Hello there.", mood: "happy" }),
  );

  expect(parsed.answer).toBe("Hello there.");
  expect(parsed.mood).toBe("happy");
  expect(parsed.annotations).toEqual([]);
  expect(parsed.uncertainty).toBeNull();
  expect(parsed.revision).toBeNull();
});

test("parseAssistantResult falls back to plain answer text", () => {
  const parsed = parseAssistantResult("Plain answer without JSON");

  expect(parsed.answer).toBe("Plain answer without JSON");
  expect(parsed.annotations).toEqual([]);
  expect(parsed.uncertainty).toBeNull();
  expect(parsed.revision).toBeNull();
});

test("parseAssistantResult parses annotations array", () => {
  const parsed = parseAssistantResult(
    JSON.stringify({
      answer: "The best option is clearly A.",
      annotations: [
        {
          id: "ann-1",
          source: "uncertainty",
          action: "replace",
          from: "clearly A",
          replacement: "maybe B",
          reason: "Not fully sure",
        },
      ],
    }),
  );

  expect(parsed.annotations).toHaveLength(1);
  expect(parsed.annotations[0]).toEqual({
    id: "ann-1",
    source: "uncertainty",
    action: "replace",
    from: "clearly A",
    replacement: "maybe B",
    reason: "Not fully sure",
  });
});

test("parseAssistantResult skips malformed annotations but keeps answer", () => {
  const parsed = parseAssistantResult(
    JSON.stringify({
      answer: "Still readable.",
      annotations: [
        {
          id: "",
          source: "uncertainty",
          action: "replace",
          from: "Still",
          replacement: "Maybe",
          reason: "unsure",
        },
        "not-an-object",
        {
          id: "ann-valid",
          source: "revision",
          action: "hide",
          from: "readable",
          reason: "reconsidering",
        },
      ],
    }),
  );

  expect(parsed.answer).toBe("Still readable.");
  expect(parsed.annotations).toHaveLength(1);
  expect(parsed.annotations[0]?.id).toBe("ann-valid");
});

test("parseAssistantResult converts legacy uncertainty/revision to annotations", () => {
  const parsed = parseAssistantResult(
    JSON.stringify({
      answer: "Paris is always sunny.",
      uncertainty: {
        from: "always sunny",
        to: "often cloudy",
        reason: "Weather varies",
      },
      revision: {
        message_id: "resp_123",
        from: "Paris",
        to: null,
        type: "refinement",
        reason: "Too broad",
        ignore: true,
      },
    }),
  );

  expect(parsed.annotations).toEqual([
    {
      id: "legacy-uncertainty",
      source: "uncertainty",
      action: "replace",
      from: "always sunny",
      replacement: "often cloudy",
      reason: "Weather varies",
    },
    {
      id: "legacy-revision",
      source: "revision",
      action: "redact",
      from: "Paris",
      reason: "Too broad",
    },
  ]);
});

test("validateAnnotation rejects replace without replacement", () => {
  const result = validateAnnotation("Alpha beta gamma", {
    id: "ann-1",
    source: "uncertainty",
    action: "replace",
    from: "Alpha",
    reason: "unsure",
  });

  expect(result.valid).toBe(false);
  expect(result.reason).toContain("replacement");
});

test("validateAnnotation rejects empty from", () => {
  const result = validateAnnotation("Alpha beta gamma", {
    id: "ann-1",
    source: "uncertainty",
    action: "redact",
    from: "   ",
    reason: "unsure",
  });

  expect(result.valid).toBe(false);
  expect(result.reason).toContain("from is empty");
});

test("validateAnnotation accepts revision when from exists in prior assistant text", () => {
  const result = validateAnnotation(
    "A new answer without the old phrase.",
    {
      id: "rev-1",
      source: "revision",
      action: "replace",
      from: "always sunny",
      replacement: "often cloudy",
      reason: "Weather varies",
    },
    { priorAssistantTexts: ["Paris is always sunny."] },
  );

  expect(result.valid).toBe(true);
});

test("validateAnnotation rejects revision when from is missing from prior messages", () => {
  const result = validateAnnotation(
    "A new answer.",
    {
      id: "rev-1",
      source: "revision",
      action: "hide",
      from: "missing phrase",
      reason: "Too unreliable",
    },
    { priorAssistantTexts: ["Paris is often cloudy."] },
  );

  expect(result.valid).toBe(false);
});

test("validateUncertainty rejects missing from substring", () => {
  const result = validateUncertainty("Alpha beta gamma", {
    from: "delta",
    to: "epsilon",
    reason: "Not sure",
  });

  expect(result.valid).toBe(false);
});

test("validateRevision resolves prior assistant message by id", () => {
  const lookup = (messageId: string) =>
    messageId === "resp_123"
      ? { id: "resp_123", text: "Paris is always sunny." }
      : undefined;

  const valid = validateRevision(
    {
      message_id: "resp_123",
      from: "always sunny",
      to: "often cloudy",
      type: "refinement",
      reason: "Weather varies",
      ignore: false,
    },
    lookup,
  );

  expect(valid.valid).toBe(true);
  expect(valid.resolvedMessageId).toBe("resp_123");
});

test("validateAssistantPayload strips invalid metadata but keeps answer", () => {
  const validated = validateAssistantPayload(
    {
      answer: "The best option is clearly A.",
      annotations: [
        {
          id: "ann-invalid",
          source: "uncertainty",
          action: "replace",
          from: "missing phrase",
          replacement: "maybe B",
          reason: "unsure",
        },
        {
          id: "ann-valid",
          source: "uncertainty",
          action: "redact",
          from: "clearly A",
          reason: "second thoughts",
        },
      ],
      mood: "common",
      uncertainty: {
        from: "missing phrase",
        to: "maybe B",
        reason: "unsure",
      },
      revision: {
        message_id: "missing",
        from: "old",
        to: null,
        type: "uncertain",
        reason: "unsure",
        ignore: true,
      },
    },
    () => undefined,
  );

  expect(validated.answer).toBe("The best option is clearly A.");
  expect(validated.annotations).toHaveLength(1);
  expect(validated.annotations[0]?.id).toBe("ann-valid");
  expect(validated.uncertainty).toBeNull();
  expect(validated.revision).toBeNull();
  expect(validated.validation.uncertainty?.valid).toBe(false);
  expect(validated.validation.revision?.valid).toBe(false);
  expect(validated.validation.annotations).toHaveLength(2);
  expect(validated.validation.annotations[0]?.valid).toBe(false);
  expect(validated.validation.annotations[1]?.valid).toBe(true);
});

test("createAssistantMessageId prefers OpenAI response id", () => {
  expect(createAssistantMessageId("resp_abc")).toBe("resp_abc");
  expect(createAssistantMessageId("  resp_xyz  ")).toBe("resp_xyz");
  expect(createAssistantMessageId("").startsWith("msg_")).toBe(true);
});
