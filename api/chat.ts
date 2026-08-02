import { isCharacterName } from "../lib/characters";
import {
  handlePotterChatStream,
  type ConversationHistoryEntry,
} from "../lib/conversation";
import { formatOpenAIError, generateChatReplyStream } from "../lib/openai";
import { handleF1ChatStream, resolveAgentState } from "../src/index.ts";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = req.body ?? {};
    const character = body.character;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const previousResponseId =
      typeof body.previousResponseId === "string"
        ? body.previousResponseId
        : undefined;
    const messages = Array.isArray(body.messages)
      ? (body.messages as ConversationHistoryEntry[])
      : undefined;

    if (!character || !isCharacterName(character)) {
      return res.status(400).json({ error: "Invalid character." });
    }

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (character === "Potter") {
      const stream = await handlePotterChatStream({
        message,
        messages,
        agentState: body.agentState,
      });

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      for await (const chunk of stream) {
        res.write(Buffer.from(chunk));
      }

      return res.end();
    }

    if (character === "F1") {
      const stream = await handleF1ChatStream({
        message,
        agentState: resolveAgentState(body.agentState),
        previousResponseId,
      });

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      for await (const chunk of stream) {
        res.write(Buffer.from(chunk));
      }

      return res.end();
    }

    const upstream = await generateChatReplyStream({
      character,
      message,
      previousResponseId,
    });

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    if (!upstream.body) {
      return res.end();
    }

    for await (const chunk of upstream.body) {
      res.write(Buffer.from(chunk));
    }

    return res.end();
  } catch (error) {
    const message = formatOpenAIError(error);
    console.error("[api/chat]", message);

    if (res.headersSent) {
      return res.end();
    }

    return res.status(500).json({ error: message });
  }
}
