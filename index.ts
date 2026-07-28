import index from "./index.html";
import potter from "./potter.html";
import rupin from "./rupin.html";
import pepper from "./pepper.html";
import f1 from "./f1.html";
import { isCharacterName } from "./lib/characters";
import {
  handlePotterChatStream,
  type ConversationHistoryEntry,
} from "./lib/conversation";
import { generateChatReplyStream } from "./lib/openai";

const port = Number(process.env.PORT) || 3000;

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.warn(
    "[env] OPENAI_API_KEY is missing. Copy .env.example to .env and add your key, then restart the server.",
  );
}

Bun.serve({
  port,
  routes: {
    "/": index,
    "/index.html": index,
    "/potter.html": potter,
    "/rupin.html": rupin,
    "/pepper.html": pepper,
    "/f1.html": f1,
    "/api/chat": {
      POST: async (req) => {
        try {
          const body = (await req.json()) as {
            character?: string;
            message?: string;
            previousResponseId?: string;
            agentState?: unknown;
            messages?: ConversationHistoryEntry[];
          };
          const character = body?.character;
          const message = body?.message?.trim();
          const previousResponseId =
            typeof body?.previousResponseId === "string"
              ? body.previousResponseId
              : undefined;

          if (!isCharacterName(character)) {
            return Response.json(
              { error: "Invalid character." },
              { status: 400 },
            );
          }

          if (!message) {
            return Response.json(
              { error: "Message is required." },
              { status: 400 },
            );
          }

          if (character === "Potter") {
            const stream = await handlePotterChatStream({
              message,
              messages: body.messages,
              agentState: body.agentState,
            });
            return new Response(stream, {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
              },
            });
          }

          const upstream = await generateChatReplyStream({
            character,
            message,
            previousResponseId,
          });

          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Chat request failed.";
          console.error("[api/chat]", message);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`hackedGPT → http://localhost:${port}`);
