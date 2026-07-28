import type { AgentAction, AgentState } from "./agent-state";
import {
  clampAgentState,
  createInitialAgentState,
  isAgentState,
  updateAgentState,
} from "./agent-state";
import { chooseAction } from "./behavior-policy";
import { evaluateMessage, type AgentEvaluation } from "./evaluator";
import { generatePotterChatReply, generatePotterChatReplyStream, parseStructuredChatAnswer } from "./openai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type BehaviorHistoryEntry = {
  kind: "behavior";
  action: Extract<AgentAction, "silence" | "hesitate" | "withdraw" | "end" | "short">;
  note?: string;
};

export type ConversationHistoryEntry = ChatMessage | BehaviorHistoryEntry;

export const RECENT_CONVERSATION_LIMIT = 12;

const CHAT_ROLE_LABELS: Record<ChatMessage["role"], string> = {
  user: "USER",
  assistant: "AGENT",
};

const BEHAVIOR_LABELS: Record<BehaviorHistoryEntry["action"], string> = {
  silence: "SILENCE",
  hesitate: "HESITATE",
  withdraw: "WITHDRAW",
  end: "END",
  short: "SHORT",
};

export function isChatMessage(entry: unknown): entry is ChatMessage {
  if (!entry || typeof entry !== "object") return false;

  const candidate = entry as Partial<ChatMessage>;
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
}

export function isBehaviorHistoryEntry(
  entry: unknown,
): entry is BehaviorHistoryEntry {
  if (!entry || typeof entry !== "object") return false;

  const candidate = entry as Partial<BehaviorHistoryEntry>;
  return (
    candidate.kind === "behavior" &&
    typeof candidate.action === "string" &&
    candidate.action in BEHAVIOR_LABELS
  );
}

function isConversationHistoryEntry(
  entry: unknown,
): entry is ConversationHistoryEntry {
  return isChatMessage(entry) || isBehaviorHistoryEntry(entry);
}

function sanitizeConversationHistory(
  messages: ConversationHistoryEntry[] | undefined,
): ConversationHistoryEntry[] {
  return (messages ?? []).filter(isConversationHistoryEntry);
}

function formatHistoryEntry(entry: ConversationHistoryEntry): string | null {
  if (isChatMessage(entry)) {
    const content = entry.content.trim();
    if (!content) return null;
    return `${CHAT_ROLE_LABELS[entry.role]}: ${content}`;
  }

  const label = BEHAVIOR_LABELS[entry.action];
  const note = entry.note?.trim();
  return note ? `${label}: ${note}` : label;
}

export function formatConversation(
  messages: ConversationHistoryEntry[] | undefined,
  limit = RECENT_CONVERSATION_LIMIT,
): string {
  return sanitizeConversationHistory(messages)
    .slice(-limit)
    .map(formatHistoryEntry)
    .filter((line): line is string => line !== null)
    .join("\n");
}

export type PotterChatRequest = {
  message: string;
  messages?: ConversationHistoryEntry[];
  agentState?: AgentState;
};

export type PotterSilenceResponse = {
  action: "silence";
  state: AgentState;
  evaluation: AgentEvaluation;
};

export type PotterChatResponse = {
  action: Exclude<AgentAction, "silence">;
  text: string;
  state: AgentState;
  evaluation: AgentEvaluation;
};

export type PotterChatResult = PotterSilenceResponse | PotterChatResponse;

function formatSseEvent(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function parseSseBlock(block: string): { type?: string; delta?: string; response?: { id?: string } } | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data || data === "[DONE]") return null;

  try {
    return JSON.parse(data) as { type?: string; delta?: string; response?: { id?: string } };
  } catch {
    return null;
  }
}

async function preparePotterTurn(input: PotterChatRequest) {
  const previousState = resolveAgentState(input.agentState);
  const conversation = formatConversation(
    buildConversationHistory(input.messages, input.message),
  );

  const evaluation = await evaluateMessage({
    message: input.message,
    conversation,
    state: previousState,
    character: "Potter",
  });

  let nextState = updateAgentState(previousState, {
    willingnessChange: evaluation.willingnessChange,
    fatigueChange: evaluation.fatigueChange,
    interestChange: evaluation.interestChange,
    distanceChange: evaluation.distanceChange,
  });

  const action = chooseAction(nextState);
  nextState = clampAgentState({
    ...nextState,
    lastAction: action,
  });

  console.info("[conversation] potter turn processed", {
    action,
    turnCount: nextState.turnCount,
    willingness: nextState.willingness,
    fatigue: nextState.fatigue,
    interest: nextState.interest,
    distance: nextState.distance,
    conversationOpen: nextState.conversationOpen,
  });

  return { conversation, action, nextState, evaluation };
}

export async function handlePotterChatStream(
  input: PotterChatRequest,
): Promise<ReadableStream<Uint8Array>> {
  const { conversation, action, nextState, evaluation } =
    await preparePotterTurn(input);

  const turnEvent = {
    type: "potter.turn",
    action,
    state: nextState,
    evaluation,
  };

  if (action === "silence") {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(formatSseEvent(turnEvent));
        controller.enqueue(
          formatSseEvent({
            type: "potter.complete",
            action,
            state: nextState,
            evaluation,
            text: "",
          }),
        );
        controller.close();
      },
    });
  }

  const upstream = await generatePotterChatReplyStream({
    message: input.message,
    conversation,
    behavior: action,
    state: nextState,
  });

  if (!upstream.body) {
    throw new Error("Potter chat response stream was empty.");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(formatSseEvent(turnEvent));

      let buffer = "";
      let rawJson = "";
      let responseId = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (value) {
            controller.enqueue(value);
            buffer += decoder.decode(value, { stream: !done });

            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() ?? "";

            for (const block of blocks) {
              const payload = parseSseBlock(block);
              if (payload?.type === "response.output_text.delta" && payload.delta) {
                rawJson += payload.delta;
              }
              if (payload?.type === "response.completed") {
                responseId = payload.response?.id ?? responseId;
              }
            }
          }

          if (done) break;
        }

        if (buffer.trim()) {
          const payload = parseSseBlock(buffer);
          if (payload?.type === "response.output_text.delta" && payload.delta) {
            rawJson += payload.delta;
          }
          if (payload?.type === "response.completed") {
            responseId = payload.response?.id ?? responseId;
          }
        }

        let text = "";
        if (rawJson.trim()) {
          try {
            text = parseStructuredChatAnswer(rawJson).text;
          } catch {
            text = "";
          }
        }

        let finalState = nextState;
        if (action === "end") {
          finalState = clampAgentState({
            ...nextState,
            conversationOpen: false,
          });
        }

        controller.enqueue(
          formatSseEvent({
            type: "potter.complete",
            action,
            state: finalState,
            evaluation,
            text,
            responseId,
          }),
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export function resolveAgentState(value: unknown): AgentState {
  if (isAgentState(value)) {
    return value;
  }
  return createInitialAgentState();
}

function buildConversationHistory(
  messages: ConversationHistoryEntry[] | undefined,
  message: string,
): ConversationHistoryEntry[] {
  const history = sanitizeConversationHistory(messages);
  const last = history.at(-1);

  if (
    last &&
    isChatMessage(last) &&
    last.role === "user" &&
    last.content.trim() === message.trim()
  ) {
    return history;
  }

  return [...history, { role: "user", content: message }];
}

export async function handlePotterChat(
  input: PotterChatRequest,
): Promise<PotterChatResult> {
  const { conversation, action, nextState, evaluation } =
    await preparePotterTurn(input);

  if (action === "silence") {
    return {
      action,
      state: nextState,
      evaluation,
    };
  }

  const reply = await generatePotterChatReply({
    message: input.message,
    conversation,
    behavior: action,
    state: nextState,
  });

  let finalState = nextState;
  if (action === "end") {
    finalState = clampAgentState({
      ...nextState,
      conversationOpen: false,
    });
  }

  return {
    action,
    text: reply.text,
    state: finalState,
    evaluation,
  };
}
