import { Router } from "express";
import { z } from "zod";

import { formatOpenAIError } from "../../lib/openai.ts";
import { analyzeEmotion } from "../services/emotionAnalyzer.ts";
import { updateEmotion } from "../services/emotionEngine.ts";
import { generateResponse } from "../services/responseGenerator.ts";
import {
  addMessage,
  createSession,
  getSession,
  setLastResponseId,
  updateEmotion as saveEmotionState,
} from "../store/sessionStore.ts";

const chatRequestSchema = z.object({
  sessionId: z.string().trim().min(1, "sessionId is required."),
  message: z.string().trim().min(1, "Message is required."),
});

export type ChatResponseBody = {
  message: string;
  emotion: { mood: string; intensity: number };
};

export type ChatErrorBody = {
  error: string;
};

export async function processChatRequest(
  body: unknown,
): Promise<
  | { ok: true; status: 200; body: ChatResponseBody }
  | { ok: false; status: 400 | 500; body: ChatErrorBody }
> {
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        error: parsed.error.issues[0]?.message ?? "Invalid request body.",
      },
    };
  }

  const { sessionId, message } = parsed.data;

  try {
    if (!getSession(sessionId)) {
      createSession(sessionId);
    }

    addMessage(sessionId, "user", message);

    const signal = await analyzeEmotion(message);
    const session = getSession(sessionId)!;

    const emotion = updateEmotion(session.emotionState, signal, {
      random: () => Math.random(),
    });

    saveEmotionState(sessionId, emotion);

    const updatedSession = getSession(sessionId)!;
    const { text: reply, responseId } = await generateResponse(
      emotion,
      updatedSession.messages,
      updatedSession.lastResponseId,
    );

    setLastResponseId(sessionId, responseId);
    addMessage(sessionId, "assistant", reply);

    return {
      ok: true,
      status: 200,
      body: {
        message: reply,
        emotion: {
          mood: emotion.mood,
          intensity: emotion.intensity,
        },
      },
    };
  } catch (error) {
    const errorMessage = formatOpenAIError(error);

    console.error("[POST /chat]", errorMessage);
    return {
      ok: false,
      status: 500,
      body: { error: errorMessage },
    };
  }
}

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  const result = await processChatRequest(req.body);
  return res.status(result.status).json(result.body);
});
