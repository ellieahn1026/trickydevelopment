import {
  ASSISTANT_RESULT_RESPONSE_FORMAT,
  parseAssistantResult,
  parseStructuredChatAnswer,
} from "./assistant-result";
import {
  type CharacterName,
  CHARACTER_SYSTEM_PROMPTS,
  RUPIN_FALSE_CLAIM_INSTRUCTIONS,
  getChatPromptId,
  getChatPromptVersion,
  getPromptId,
  getPromptVersion,
  usesAnnotationResponseFormat,
} from "./characters";
import type { AgentAction, AgentState } from "./agent-state";
import { formatStateDescription } from "./agent-state";

export { parseAssistantResult, parseStructuredChatAnswer };
export type {
  Annotation,
  AnnotationAction,
  AnnotationSource,
  AssistantResult,
  AssistantRevision,
  AssistantUncertainty,
  RevisionType,
  ValidatedAssistantPayload,
} from "./assistant-result";

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

function usesSavedPrompts(): boolean {
  const flag = process.env.OPENAI_USE_SAVED_PROMPTS?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") {
    return false;
  }
  return true;
}

function shouldFallbackFromPrompt(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("invalid_prompt") ||
    message.includes("reasoning.mode") ||
    message.includes("unsupported_value") ||
    message.includes("prompt") ||
    message.includes("response_format") ||
    message.includes("json_schema") ||
    message.includes("invalid_json_schema")
  );
}

function shouldRetryWithoutPrompt(error: unknown): boolean {
  if (shouldFallbackFromPrompt(error)) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = /OpenAI API error \((\d+)\)/.exec(message);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  if (status === 401 || status === 403 || status === 429) {
    return false;
  }

  return status === 400 || status === 404 || status === 422;
}

export function formatOpenAIError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Chat request failed.";
  }

  if (error.message.includes("OPENAI_API_KEY is not set")) {
    return "OPENAI_API_KEY가 설정되지 않았습니다. .env 파일에 API 키를 추가한 뒤 서버를 재시작해 주세요.";
  }

  const statusMatch = /OpenAI API error \((\d+)\)/.exec(error.message);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  const body = statusMatch
    ? error.message.slice(statusMatch.index! + statusMatch[0].length).trim()
    : error.message;

  let detail = body;
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: string; type?: string };
    };
    detail =
      parsed.error?.message ||
      parsed.error?.code ||
      parsed.error?.type ||
      body;
  } catch {
    // Keep raw body when OpenAI did not return JSON.
  }

  if (status === 401) {
    return "OpenAI API 키가 유효하지 않습니다. .env의 OPENAI_API_KEY를 확인해 주세요.";
  }

  if (status === 429) {
    return "OpenAI 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (
    detail.includes("insufficient_quota") ||
    detail.toLowerCase().includes("quota")
  ) {
    return "OpenAI 사용량 한도가 부족합니다. 결제/크레딧 설정을 확인해 주세요.";
  }

  if (
    detail.includes("sandbox network policy") ||
    detail.includes("not on allow list")
  ) {
    return "OpenAI API 호출이 Cursor 샌드박스 네트워크 정책에 막혔습니다. Cursor 터미널이 아닌 macOS Terminal/iTerm에서 `bun run dev`를 실행하거나, Cursor에서 네트워크 권한이 허용된 터미널로 서버를 다시 시작해 주세요.";
  }

  if (status === 403) {
    return `OpenAI API 접근이 거부되었습니다. ${detail.slice(0, 180)}`;
  }

  if (detail.includes("invalid_prompt") || detail.includes("prompt")) {
    return "저장된 OpenAI Prompt 설정에 문제가 있습니다. OPENAI_USE_SAVED_PROMPTS=false 로 내장 프롬프트를 사용할 수 있습니다.";
  }

  return `OpenAI API error${status ? ` (${status})` : ""}: ${detail.slice(0, 220)}`;
}

async function openaiFetchResponse(path: string, init: RequestInit = {}) {
  let response: Response;

  try {
    response = await fetch(`${OPENAI_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("sandbox network policy") ||
      message.includes("not on allow list")
    ) {
      throw new Error(
        "OpenAI API error (403): Blocked by sandbox network policy\nDestination: api.openai.com:443\nReason: not on allow list",
      );
    }
    throw error;
  }

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

function getChatResponseFormat(character: CharacterName) {
  if (usesAnnotationResponseFormat(character)) {
    return ASSISTANT_RESULT_RESPONSE_FORMAT;
  }

  return CHAT_RESPONSE_FORMAT;
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
  extraInstructions?: string,
) {
  const body: Record<string, unknown> = {
    input: message,
    max_output_tokens: MAX_OUTPUT_TOKENS,
  };

  if (!usePrompt) {
    body.text = {
      format: getChatResponseFormat(character),
    };
  }

  if (stream) {
    body.stream = true;
  }

  const prompt = usePrompt ? buildPromptConfig(character) : undefined;

  if (prompt) {
    body.prompt = prompt;
    const instructionParts: string[] = [];
    if (character === "Rupin") {
      instructionParts.push(RUPIN_FALSE_CLAIM_INSTRUCTIONS);
    }
    if (extraInstructions?.trim()) {
      if (character === "Pepper") {
        instructionParts.push(extraInstructions.trim());
        instructionParts.push(
          "Reminder: Pepper mood voice instructions above override any default cheerful or neutral tone from the saved prompt.",
        );
      } else {
        instructionParts.push(extraInstructions.trim());
      }
    }
    if (instructionParts.length > 0) {
      body.instructions = instructionParts.join("\n\n");
    }
  } else {
    body.model = getModel();
    const instructionParts = [CHARACTER_SYSTEM_PROMPTS[character]];
    if (extraInstructions?.trim()) {
      instructionParts.push(extraInstructions.trim());
    }
    body.instructions = instructionParts.join("\n\n");
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
  extraInstructions?: string,
): Promise<{ text: string; responseId: string }> {
  logPromptSelection(character, usePrompt, false);
  const payload = await openaiFetch("/responses", {
    method: "POST",
    body: JSON.stringify(
      buildRequestBody(
        character,
        message,
        previousResponseId,
        usePrompt,
        false,
        extraInstructions,
      ),
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
  extraInstructions?: string;
}): Promise<{ text: string; responseId: string }> {
  const hasPrompt = usesSavedPrompts() && Boolean(getPromptId(input.character));

  if (!hasPrompt) {
    return responsesChat(
      input.character,
      input.message,
      input.previousResponseId,
      false,
      input.extraInstructions,
    );
  }

  try {
    return await responsesChat(
      input.character,
      input.message,
      input.previousResponseId,
      true,
      input.extraInstructions,
    );
  } catch (error) {
    if (!shouldRetryWithoutPrompt(error)) {
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
      input.extraInstructions,
    );
  }
}

export async function generateChatReplyStream(input: {
  character: CharacterName;
  message: string;
  previousResponseId?: string;
}): Promise<Response> {
  const hasPrompt = usesSavedPrompts() && Boolean(getPromptId(input.character));

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
    if (!shouldRetryWithoutPrompt(error)) {
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
