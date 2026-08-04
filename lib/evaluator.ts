import type { AgentState, AgentStateDeltas } from "./agent-state";
import { clampAgentState, createInitialAgentState } from "./agent-state";

const OPENAI_BASE = "https://api.openai.com/v1";
const MAX_OUTPUT_TOKENS = 1000;

const EVALUATOR_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "agent_state_evaluation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      willingnessChange: {
        type: "number",
        description:
          "Change in willingness to engage (-1 to 1). Negative when user is pushy or boring; positive when user is respectful or interesting.",
      },
      fatigueChange: {
        type: "number",
        description:
          "Change in conversational fatigue (-1 to 1). Positive when the exchange feels draining or repetitive.",
      },
      interestChange: {
        type: "number",
        description:
          "Change in interest in the topic or user (-1 to 1). Positive when the message is engaging.",
      },
      distanceChange: {
        type: "number",
        description:
          "Change in emotional distance (-1 to 1). Positive when user feels intrusive or the agent wants space.",
      },
      conversationOpen: {
        type: "boolean",
        description:
          "Whether the agent is still willing to continue the conversation after this turn.",
      },
    },
    required: [
      "willingnessChange",
      "fatigueChange",
      "interestChange",
      "distanceChange",
      "conversationOpen",
    ],
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

export type AgentEvaluation = {
  willingnessChange: number;
  fatigueChange: number;
  interestChange: number;
  distanceChange: number;
  conversationOpen: boolean;
};

export type EvaluateMessageInput = {
  message: string;
  conversation: string;
  state: AgentState;
  character?: string;
};

export type EvaluateMessageResult = AgentEvaluation & {
  responseId?: string;
};

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  return key;
}

function getEvaluatorPromptId(): string | undefined {
  return process.env.OPENAI_EVALUATOR_PROMPT_ID?.trim() || undefined;
}

function getEvaluatorPromptVersion(): string | undefined {
  return process.env.OPENAI_EVALUATOR_PROMPT_VERSION?.trim() || undefined;
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function buildEvaluatorInput(input: EvaluateMessageInput): string {
  return JSON.stringify(
    {
      character: input.character ?? "Potter",
      message: input.message,
      conversation: input.conversation,
      currentState: input.state,
    },
    null,
    0,
  );
}

function buildEvaluatorInstructions(): string {
  return [
    "You evaluate a character chat turn and return numeric changes for internal conversational state.",
    "All change values must stay between -1 and 1.",
    "Set conversationOpen to false only when the character would clearly stop engaging.",
    "Respond with JSON matching the required schema only.",
  ].join(" ");
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
    throw new Error("Evaluator returned an empty response.");
  }
  return text;
}

function parseEvaluation(raw: string): AgentEvaluation {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Evaluator response was not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Evaluator response did not match the required schema.");
  }

  const result = parsed as Partial<AgentEvaluation> & Partial<AgentStateDeltas>;
  const willingnessChange =
    result.willingnessChange ?? result.willingnessDelta;
  const fatigueChange = result.fatigueChange ?? result.fatigueDelta;
  const interestChange = result.interestChange ?? result.interestDelta;
  const distanceChange = result.distanceChange ?? result.distanceDelta;

  if (
    typeof willingnessChange !== "number" ||
    typeof fatigueChange !== "number" ||
    typeof interestChange !== "number" ||
    typeof distanceChange !== "number" ||
    typeof result.conversationOpen !== "boolean"
  ) {
    throw new Error("Evaluator response did not match the required schema.");
  }

  return {
    willingnessChange,
    fatigueChange,
    interestChange,
    distanceChange,
    conversationOpen: result.conversationOpen,
  };
}

function heuristicEvaluateMessage(input: EvaluateMessageInput): AgentEvaluation {
  const message = input.message.trim();
  const lengthFactor = Math.min(1, message.length / 240);
  const questionCount = (message.match(/\?/g) ?? []).length;
  const exclamationCount = (message.match(/!/g) ?? []).length;

  const pushy =
    exclamationCount >= 2 ||
    /\b(now|hurry|answer|tell me|why won't you)\b/i.test(message);
  const warm = /\b(thanks|thank you|please|sorry|hello|hi)\b/i.test(message);

  let willingnessChange = lengthFactor * 0.008 - 0.02;
  let fatigueChange = lengthFactor * 0.07 + input.state.turnCount * 0.012 + 0.03;
  let interestChange = questionCount > 0 ? 0.01 : -0.03;
  let distanceChange = 0.04;

  if (pushy) {
    willingnessChange -= 0.24;
    fatigueChange += 0.16;
    distanceChange += 0.18;
  }

  if (warm) {
    willingnessChange += 0.03;
    interestChange += 0.02;
    distanceChange -= 0.03;
  }

  if (message.length < 8) {
    interestChange -= 0.1;
    fatigueChange += 0.07;
    willingnessChange -= 0.06;
    distanceChange += 0.05;
  }

  if (message.length < 16) {
    interestChange -= 0.04;
    fatigueChange += 0.03;
    distanceChange += 0.03;
  }

  const nextWillingness = input.state.willingness + willingnessChange;
  const nextFatigue = input.state.fatigue + fatigueChange + 0.04;

  return {
    willingnessChange,
    fatigueChange,
    interestChange,
    distanceChange,
    conversationOpen: nextWillingness > 0.12 && nextFatigue < 0.88,
  };
}

async function callEvaluatorPrompt(
  input: EvaluateMessageInput,
): Promise<EvaluateMessageResult> {
  const promptId = getEvaluatorPromptId();
  const version = getEvaluatorPromptVersion();
  const prompt = promptId
    ? version
      ? { id: promptId, version }
      : { id: promptId }
    : undefined;

  const body: Record<string, unknown> = {
    input: buildEvaluatorInput(input),
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: {
      format: EVALUATOR_RESPONSE_FORMAT,
    },
  };

  if (prompt) {
    body.prompt = prompt;
  } else {
    body.model = getModel();
    body.instructions = buildEvaluatorInstructions();
  }

  const response = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI evaluator error (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as ResponsePayload;
  return {
    ...parseEvaluation(extractOutputText(payload)),
    responseId: payload.id,
  };
}

export async function evaluateMessage(
  input: EvaluateMessageInput,
): Promise<EvaluateMessageResult> {
  const state = clampAgentState(input.state ?? createInitialAgentState());

  try {
    return await callEvaluatorPrompt({ ...input, state });
  } catch (error) {
    console.warn("[evaluator] falling back to heuristic evaluation", {
      error: error instanceof Error ? error.message : String(error),
    });
    return heuristicEvaluateMessage({ ...input, state });
  }
}

/** @deprecated Use evaluateMessage instead. */
export async function evaluateTurn(input: {
  message: string;
  state: AgentState;
  character?: string;
  conversation?: string;
}) {
  const evaluation = await evaluateMessage({
    message: input.message,
    conversation: input.conversation ?? "",
    state: input.state,
    character: input.character,
  });

  return {
    deltas: {
      willingnessDelta: evaluation.willingnessChange,
      fatigueDelta: evaluation.fatigueChange,
      interestDelta: evaluation.interestChange,
      distanceDelta: evaluation.distanceChange,
      conversationOpen: evaluation.conversationOpen,
    },
    responseId: evaluation.responseId,
  };
}
