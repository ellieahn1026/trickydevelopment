import {
  type CharacterName,
  CHARACTER_SYSTEM_PROMPTS,
  getChatPromptId,
  getChatPromptVersion,
  getPromptId,
  getPromptVersion,
} from "./characters";
import type { AgentAction, AgentState } from "./agent-state";
import { formatStateDescription } from "./agent-state";

const OPENAI_BASE = "https://api.openai.com/v1";
const MAX_OUTPUT_TOKENS = 4000;
const CHAT_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "chat_answer",
  strict: true,
  schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description:
          "The complete answer shown to the user. For complex answers, format this string as readable Markdown using paragraph breaks, bullet or numbered lists, short headings, and horizontal rules only when they improve clarity. Do not include a mood label, JSON, or other metadata in this string.",
      },
      mood: {
        type: "string",
        enum: ["happy", "sad", "common"],
        description:
          "The emotional tone of the answer. Use happy for upbeat answers, sad for downbeat answers, and common otherwise.",
      },
    },
    required: ["answer", "mood"],
    additionalProperties: false,
  },
} as const;

type ResponseOutputItem = {
  type?: string;
  role?: string;
  content?: { type?: string; text?: string }[];
};

type ResponsePayload = {
  id?: string;
  output_text?: string;
  output?: ResponseOutputItem[];
};

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set. Add it to your .env file.");
  }
  return key;
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function shouldFallbackFromPrompt(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("invalid_prompt") ||
    message.includes("reasoning.mode") ||
    message.includes("unsupported_value") ||
    message.includes("prompt")
  );
}

async function openaiFetchResponse(path: string, init: RequestInit = {}) {
  const response = await fetch(`${OPENAI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${body}`);
  }

  return response;
}

async function openaiFetch(path: string, init: RequestInit = {}) {
  const response = await openaiFetchResponse(path, init);
  return response.json() as Promise<ResponsePayload>;
}

function extractOutputText(payload: ResponsePayload): string {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message" || item.role !== "assistant") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        parts.push(content.text.trim());
      }
    }
  }

  const text = parts.join("\n").trim();
  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }
  return text;
}

export function parseStructuredChatAnswer(rawJson: string): { text: string; mood: string } {
  let result: unknown;

  try {
    result = JSON.parse(rawJson);
  } catch {
    throw new Error("Chat response was not valid structured JSON.");
  }

  if (
    !result ||
    typeof result !== "object" ||
    typeof (result as { answer?: unknown }).answer !== "string" ||
    typeof (result as { mood?: unknown }).mood !== "string"
  ) {
    throw new Error("Chat response did not match the required mood schema.");
  }

  const payload = result as { answer: string; mood: string };
  return {
    text: payload.answer.trim(),
    mood: payload.mood,
  };
}

function buildChatPromptConfig() {
  const promptId = getChatPromptId();
  if (!promptId) return undefined;

  const version = getChatPromptVersion();
  return version ? { id: promptId, version } : { id: promptId };
}

function buildChatPromptVariables(input: {
  message: string;
  conversation: string;
  behavior: AgentAction;
  state: AgentState;
}) {
  return {
    message: input.message,
    conversation: input.conversation,
    behavior: input.behavior,
    state_description: formatStateDescription(input.state),
  };
}

function buildPotterChatRequestBody(input: {
  message: string;
  conversation: string;
  behavior: AgentAction;
  state: AgentState;
  usePrompt: boolean;
  stream?: boolean;
}) {
  const body: Record<string, unknown> = {
    input: input.message,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: {
      format: CHAT_RESPONSE_FORMAT,
    },
  };

  if (input.stream) {
    body.stream = true;
  }

  const prompt = input.usePrompt ? buildChatPromptConfig() : undefined;

  if (prompt) {
    body.prompt = {
      ...prompt,
      variables: buildChatPromptVariables(input),
    };
  } else {
    const behaviorHint =
      input.behavior === "end"
        ? "Declare clearly that you are ending the conversation. Explain what you did not like about the user or this exchange."
        : undefined;

    body.model = getModel();
    body.instructions = [
      CHARACTER_SYSTEM_PROMPTS.Potter,
      "Use the following prompt context when answering.",
      JSON.stringify(buildChatPromptVariables(input), null, 2),
      behaviorHint,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return body;
}

async function potterChatStreamRequest(
  input: {
    message: string;
    conversation: string;
    behavior: AgentAction;
    state: AgentState;
  },
  usePrompt: boolean,
) {
  console.info("[openai] potter chat stream request", {
    source: usePrompt ? "OPENAI_CHAT_PROMPT_ID" : "built-in",
    promptId: usePrompt ? buildChatPromptConfig()?.id ?? null : null,
    behavior: input.behavior,
  });

  return openaiFetchResponse("/responses", {
    method: "POST",
    body: JSON.stringify(
      buildPotterChatRequestBody({ ...input, usePrompt, stream: true }),
    ),
  });
}

export async function generatePotterChatReplyStream(input: {
  message: string;
  conversation: string;
  behavior: AgentAction;
  state: AgentState;
}): Promise<Response> {
  const hasPrompt = Boolean(getChatPromptId());

  if (!hasPrompt) {
    return potterChatStreamRequest(input, false);
  }

  try {
    return await potterChatStreamRequest(input, true);
  } catch (error) {
    if (!shouldFallbackFromPrompt(error)) {
      throw error;
    }
    console.warn("[openai] saved chat prompt failed; retrying with built-in prompt", {
      error: error instanceof Error ? error.message : String(error),
    });
    return potterChatStreamRequest(input, false);
  }
}

export async function generatePotterChatReply(input: {
  message: string;
  conversation: string;
  behavior: AgentAction;
  state: AgentState;
}): Promise<{ text: string; mood: string; responseId: string }> {
  const hasPrompt = Boolean(getChatPromptId());

  const request = async (usePrompt: boolean) => {
    console.info("[openai] potter chat request", {
      source: usePrompt ? "OPENAI_CHAT_PROMPT_ID" : "built-in",
      promptId: usePrompt ? buildChatPromptConfig()?.id ?? null : null,
      behavior: input.behavior,
    });

    const payload = await openaiFetch("/responses", {
      method: "POST",
      body: JSON.stringify(buildPotterChatRequestBody({ ...input, usePrompt })),
    });

    if (!payload.id) {
      throw new Error("OpenAI returned a response without an id.");
    }

    const parsed = parseStructuredChatAnswer(extractOutputText(payload));
    return {
      ...parsed,
      responseId: payload.id,
    };
  };

  if (!hasPrompt) {
    return request(false);
  }

  try {
    return await request(true);
  } catch (error) {
    if (!shouldFallbackFromPrompt(error)) {
      throw error;
    }
    console.warn("[openai] saved chat prompt failed; retrying with built-in prompt", {
      error: error instanceof Error ? error.message : String(error),
    });
    return request(false);
  }
}

function buildPromptConfig(character: CharacterName) {
  const promptId = getPromptId(character);
  if (!promptId) return undefined;

  const version = getPromptVersion(character);
  return version ? { id: promptId, version } : { id: promptId };
}

function logPromptSelection(
  character: CharacterName,
  usePrompt: boolean,
  stream: boolean,
) {
  const prompt = usePrompt ? buildPromptConfig(character) : undefined;
  console.info("[openai] request", {
    character,
    source: prompt ? `OPENAI_PROMPT_${character.toUpperCase()}` : "built-in",
    promptId: prompt?.id ?? null,
    promptVersion: prompt && "version" in prompt ? prompt.version : "latest",
    stream,
  });
}

function buildRequestBody(
  character: CharacterName,
  message: string,
  previousResponseId: string | undefined,
  usePrompt: boolean,
  stream = false,
) {
  const body: Record<string, unknown> = {
    input: message,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: {
      format: CHAT_RESPONSE_FORMAT,
    },
  };

  if (stream) {
    body.stream = true;
  }

  const prompt = usePrompt ? buildPromptConfig(character) : undefined;

  if (prompt) {
    body.prompt = prompt;
  } else {
    body.model = getModel();
    body.instructions = CHARACTER_SYSTEM_PROMPTS[character];
  }

  if (previousResponseId) {
    body.previous_response_id = previousResponseId;
  }

  return body;
}

async function responsesChat(
  character: CharacterName,
  message: string,
  previousResponseId: string | undefined,
  usePrompt: boolean,
): Promise<{ text: string; responseId: string }> {
  logPromptSelection(character, usePrompt, false);
  const payload = await openaiFetch("/responses", {
    method: "POST",
    body: JSON.stringify(
      buildRequestBody(character, message, previousResponseId, usePrompt),
    ),
  });

  if (!payload.id) {
    throw new Error("OpenAI returned a response without an id.");
  }

  return {
    text: extractOutputText(payload),
    responseId: payload.id,
  };
}

async function responsesChatStream(
  character: CharacterName,
  message: string,
  previousResponseId: string | undefined,
  usePrompt: boolean,
): Promise<Response> {
  logPromptSelection(character, usePrompt, true);
  return openaiFetchResponse("/responses", {
    method: "POST",
    body: JSON.stringify(
      buildRequestBody(character, message, previousResponseId, usePrompt, true),
    ),
  });
}

export async function generateChatReply(input: {
  character: CharacterName;
  message: string;
  previousResponseId?: string;
}): Promise<{ text: string; responseId: string }> {
  const hasPrompt = Boolean(getPromptId(input.character));

  if (!hasPrompt) {
    return responsesChat(
      input.character,
      input.message,
      input.previousResponseId,
      false,
    );
  }

  try {
    return await responsesChat(
      input.character,
      input.message,
      input.previousResponseId,
      true,
    );
  } catch (error) {
    if (!shouldFallbackFromPrompt(error)) {
      throw error;
    }
    console.warn("[openai] saved prompt failed; retrying with built-in prompt", {
      character: input.character,
      error: error instanceof Error ? error.message : String(error),
    });
    return responsesChat(
      input.character,
      input.message,
      input.previousResponseId,
      false,
    );
  }
}

export async function generateChatReplyStream(input: {
  character: CharacterName;
  message: string;
  previousResponseId?: string;
}): Promise<Response> {
  const hasPrompt = Boolean(getPromptId(input.character));

  if (!hasPrompt) {
    return responsesChatStream(
      input.character,
      input.message,
      input.previousResponseId,
      false,
    );
  }

  try {
    return await responsesChatStream(
      input.character,
      input.message,
      input.previousResponseId,
      true,
    );
  } catch (error) {
    if (!shouldFallbackFromPrompt(error)) {
      throw error;
    }
    console.warn("[openai] saved prompt failed; retrying with built-in prompt", {
      character: input.character,
      error: error instanceof Error ? error.message : String(error),
    });
    return responsesChatStream(
      input.character,
      input.message,
      input.previousResponseId,
      false,
    );
  }
}
