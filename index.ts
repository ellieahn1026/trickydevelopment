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
import { formatOpenAIError, generateChatReplyStream } from "./lib/openai";
import { handleF1ChatStream, resolveAgentState } from "./src/index";
import { processChatRequest } from "./src/routes/chat";

const preferredPort = Number(process.env.PORT) || 3000;
const maxPortAttempts = 10;

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.warn(
    "[env] OPENAI_API_KEY is missing. Copy .env.example to .env and add your key, then restart the server.",
  );
}

const chatCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

const routes = {
    "/": index,
    "/index.html": index,
    "/potter.html": potter,
    "/rupin.html": rupin,
    "/pepper.html": pepper,
    "/f1.html": f1,
    "/health": {
      GET: () =>
        Response.json({
          ok: true,
          port,
        }),
    },
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

          if (character === "F1") {
            const stream = await handleF1ChatStream({
              message,
              agentState: resolveAgentState(body.agentState),
              previousResponseId,
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
          const message = formatOpenAIError(error);
          console.error("[api/chat]", message);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
    "/chat": {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: chatCorsHeaders,
        }),
      POST: async (req) => {
        try {
          const body = await req.json();
          const result = await processChatRequest(body);
          return Response.json(result.body, {
            status: result.status,
            headers: chatCorsHeaders,
          });
        } catch (error) {
          const message = formatOpenAIError(error);
          console.error("[POST /chat]", message);
          return Response.json(
            { error: message },
            { status: 500, headers: chatCorsHeaders },
          );
        }
      },
    },
} as const;

function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "EADDRINUSE"
  );
}

let port = preferredPort;

for (let attempt = 0; attempt < maxPortAttempts; attempt += 1) {
  port = preferredPort + attempt;

  try {
    Bun.serve({
      port,
      hostname: "0.0.0.0",
      routes,
      development: {
        hmr: true,
        console: true,
      },
    });
    break;
  } catch (error) {
    if (!isAddressInUse(error) || attempt === maxPortAttempts - 1) {
      throw error;
    }

    console.warn(
      `[server] Port ${port} is in use; trying ${port + 1}...`,
    );
  }
}

console.log(`hackedGPT → http://localhost:${port}`);
console.log(`Pepper chat → http://localhost:${port}/pepper.html`);
if (port !== preferredPort) {
  console.warn(
    `[server] Port ${preferredPort} was busy. Open http://localhost:${port} (not ${preferredPort}).`,
  );
}

void (async () => {
  if (!process.env.OPENAI_API_KEY?.trim()) return;

  try {
    const probe = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}` },
      signal: AbortSignal.timeout(5000),
    });
    const body = await probe.text();

    if (
      probe.status === 403 &&
      (body.includes("sandbox network policy") ||
        body.includes("not on allow list"))
    ) {
      console.error(
        "[env] OpenAI is blocked by Cursor sandbox network policy. Run `bun run dev` in macOS Terminal/iTerm, or restart Cursor terminal with network access.",
      );
    }
  } catch {
    // Ignore startup probe failures; chat requests will surface errors.
  }
})();
