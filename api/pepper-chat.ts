import { formatOpenAIError } from "../lib/openai";
import { processChatRequest } from "../src/routes/chat";

const chatCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

function applyCors(res: {
  setHeader: (name: string, value: string) => void;
}): void {
  for (const [name, value] of Object.entries(chatCorsHeaders)) {
    res.setHeader(name, value);
  }
}

export default async function handler(req: any, res: any) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const result = await processChatRequest(req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    const message = formatOpenAIError(error);
    console.error("[POST /chat]", message);
    return res.status(500).json({ error: message });
  }
}
