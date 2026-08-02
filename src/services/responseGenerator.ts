import {
  generateChatReply,
  parseStructuredChatAnswer,
} from "../../lib/openai.ts";
import type { EmotionState } from "../models/emotion.ts";
import { buildCharacterPrompt } from "../prompts/characterPrompt.ts";
import type { SessionMessage } from "../store/sessionStore.ts";

function getLatestUserMessage(messages: SessionMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (entry?.role === "user" && entry.content.trim()) {
      return entry.content.trim();
    }
  }

  throw new Error("No user message to respond to.");
}

function extractAnswerText(rawText: string): string {
  try {
    return parseStructuredChatAnswer(rawText).text;
  } catch {
    return rawText.trim();
  }
}

export async function generateResponse(
  emotion: EmotionState,
  messages: SessionMessage[],
  previousResponseId?: string,
): Promise<{ text: string; responseId: string }> {
  const message = getLatestUserMessage(messages);

  const result = await generateChatReply({
    character: "Pepper",
    message,
    previousResponseId,
    extraInstructions: buildCharacterPrompt(emotion),
  });

  return {
    text: extractAnswerText(result.text),
    responseId: result.responseId,
  };
}
