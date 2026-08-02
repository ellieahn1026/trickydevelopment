import { z } from "zod";

import { ANALYZER_PROMPT } from "../prompts/analyzerPrompt.ts";
import { getOpenAIClient, getOpenAIModel } from "./openai.ts";

export const TriggerSchema = z.enum([
  "praise",
  "friendly",
  "criticism",
  "insult",
  "attack",
  "neutral",
]);

export type Trigger = z.infer<typeof TriggerSchema>;

export const EmotionAnalysisSchema = z.object({
  sentiment: z.number().min(-1).max(1),
  praise: z.number().min(0).max(1),
  friendliness: z.number().min(0).max(1),
  criticism: z.number().min(0).max(1),
  personalAttack: z.number().min(0).max(1),
  affection: z.number().min(0).max(1),
  apology: z.number().min(0).max(1),
  trigger: TriggerSchema,
});

export type EmotionAnalysis = z.infer<typeof EmotionAnalysisSchema>;

export const DEFAULT_EMOTION_ANALYSIS: EmotionAnalysis = {
  sentiment: 0,
  praise: 0,
  friendliness: 0,
  criticism: 0,
  personalAttack: 0,
  affection: 0,
  apology: 0,
  trigger: "neutral",
};

function parseAnalysisContent(content: string): EmotionAnalysis {
  let raw: unknown;

  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("Emotion analysis response was not valid JSON.");
  }

  const parsed = EmotionAnalysisSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(
      `Emotion analysis validation failed: ${parsed.error.issues[0]?.message ?? "Invalid shape."}`,
    );
  }

  return parsed.data;
}

export async function analyzeEmotion(message: string): Promise<EmotionAnalysis> {
  const openai = getOpenAIClient();

  const completion = await openai.chat.completions.create({
    model: getOpenAIModel(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ANALYZER_PROMPT },
      { role: "user", content: message },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Emotion analysis response was empty.");
  }

  return parseAnalysisContent(content);
}
