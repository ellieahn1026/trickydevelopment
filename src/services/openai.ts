import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}
