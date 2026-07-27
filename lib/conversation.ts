import type { AgentAction, AgentState } from "./agent-state";
import {
  clampAgentState,
  createInitialAgentState,
  isAgentState,
  updateAgentState,
} from "./agent-state";
import { chooseAction } from "./behavior-policy";
import { evaluateMessage, type AgentEvaluation } from "./evaluator";
import { generatePotterChatReply } from "./openai";

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

  if (action === "end") {
    nextState = clampAgentState({
      ...nextState,
      conversationOpen: false,
    });
  }

  return {
    action,
    text: reply.text,
    state: nextState,
    evaluation,
  };
}
