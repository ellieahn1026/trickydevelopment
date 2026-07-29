import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  detectHesitation,
  detectIncomplete,
  estimateInformation,
} from "./agent/analyze.ts";
import { buildInstructions } from "./agent/prompt.ts";
import {
  determineResponseMode,
  getMaxOutputTokens,
} from "./agent/responseMode.ts";
import { generateF1Reply, generateF1ReplyStream } from "./agent/respond.ts";
import {
  initialAgentState,
  type AgentState,
  type ResponseMode,
  type UserSignals,
} from "./agent/state.ts";
import { transition } from "./agent/transition.ts";

export type { AgentState, ResponseMode, UserSignals } from "./agent/state.ts";
export type { F1RespondInput, F1RespondResult } from "./agent/respond.ts";
export { initialAgentState, transition };

export type GenerateResponseResult = {
  text: string;
  mood: string;
  state: AgentState;
  previousState: AgentState;
  signals: UserSignals;
  responseMode: ResponseMode;
  responseId: string;
};

export type F1ChatRequest = {
  message: string;
  agentState?: AgentState;
  previousResponseId?: string;
};

export type F1TurnEvent = {
  type: "f1.turn";
  state: AgentState;
  signals: UserSignals;
  responseMode: ResponseMode;
};

export type F1CompleteEvent = {
  type: "f1.complete";
  state: AgentState;
  text: string;
  mood: string;
  responseId?: string;
};

function isAgentState(value: unknown): value is AgentState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgentState>;
  return (
    typeof candidate.provocation === "number" &&
    candidate.provocation >= 0 &&
    candidate.provocation <= 3 &&
    typeof candidate.hesitationStreak === "number" &&
    typeof candidate.vagueStreak === "number" &&
    typeof candidate.decisiveStreak === "number"
  );
}

export function resolveAgentState(value: unknown): AgentState {
  if (isAgentState(value)) {
    return value;
  }
  return { ...initialAgentState };
}

export function buildUserSignals(message: string): UserSignals {
  return {
    hesitation: detectHesitation(message),
    information: estimateInformation(message),
    incomplete: detectIncomplete(message),
    sensitive: false,
  };
}

function formatSseEvent(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function printDebug(result: GenerateResponseResult): void {
  const { signals, previousState, state, responseMode } = result;

  console.log("\n[DEBUG]\n");
  console.log(`hesitation: ${signals.hesitation.toFixed(2)}`);
  console.log(`information: ${signals.information.toFixed(2)}`);
  console.log(`incomplete: ${signals.incomplete}`);
  console.log(`sensitive: ${signals.sensitive}`);
  console.log("");
  console.log(`provocation: ${previousState.provocation} -> ${state.provocation}`);
  console.log("");
  console.log(`hesitationStreak: ${state.hesitationStreak}`);
  console.log(`vagueStreak: ${state.vagueStreak}`);
  console.log(`decisiveStreak: ${state.decisiveStreak}`);
  console.log("");
  console.log(`responseMode: ${responseMode}`);
  console.log("");
}

/**
 * F1 에이전트 턴 — 신호 분석 → 상태 전이 → instructions 생성 → OpenAI 응답.
 */
export async function generateResponse(
  message: string,
  currentState: AgentState,
  options: { previousResponseId?: string } = {},
): Promise<GenerateResponseResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("Message is required.");
  }

  const signals = buildUserSignals(trimmed);
  const nextState = transition(currentState, signals);
  const responseMode = determineResponseMode(signals);
  const instructions = buildInstructions(nextState, signals, responseMode);

  const reply = await generateF1Reply({
    message: trimmed,
    instructions,
    maxOutputTokens: getMaxOutputTokens(responseMode),
    previousResponseId: options.previousResponseId,
  });

  return {
    text: reply.text,
    mood: reply.mood,
    state: nextState,
    previousState: currentState,
    signals,
    responseMode,
    responseId: reply.responseId,
  };
}

/**
 * F1 채팅 턴 — SSE 스트림 (f1.html /api/chat).
 */
export async function handleF1ChatStream(
  request: F1ChatRequest,
): Promise<ReadableStream<Uint8Array>> {
  const trimmed = request.message.trim();
  if (!trimmed) {
    throw new Error("Message is required.");
  }

  const previousState = resolveAgentState(request.agentState);
  const signals = buildUserSignals(trimmed);
  const nextState = transition(previousState, signals);
  const responseMode = determineResponseMode(signals);
  const instructions = buildInstructions(nextState, signals, responseMode);

  const turnEvent: F1TurnEvent = {
    type: "f1.turn",
    state: nextState,
    signals,
    responseMode,
  };

  const upstream = await generateF1ReplyStream({
    message: trimmed,
    instructions,
    maxOutputTokens: getMaxOutputTokens(responseMode),
    previousResponseId: request.previousResponseId,
  });

  if (!upstream.body) {
    throw new Error("F1 chat response stream was empty.");
  }

  const reader = upstream.body.getReader();

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(formatSseEvent(turnEvent));

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (value) controller.enqueue(value);
          if (done) break;
        }

        controller.enqueue(
          formatSseEvent({
            type: "f1.complete",
            state: nextState,
            text: "",
            mood: "common",
          } satisfies F1CompleteEvent),
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function runConsoleChat(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn(
      "[env] OPENAI_API_KEY is missing. Copy .env.example to .env and add your key.",
    );
  }

  const rl = readline.createInterface({ input, output });
  let currentState: AgentState = { ...initialAgentState };
  let previousResponseId: string | undefined;

  console.log("F1 Agent Console Chat");
  console.log('Type "exit" or "quit" to leave.\n');

  try {
    while (true) {
      const message = (await rl.question("You: ")).trim();
      if (!message) continue;

      if (message === "exit" || message === "quit") {
        break;
      }

      try {
        const result = await generateResponse(message, currentState, {
          previousResponseId,
        });

        if (process.env.DEBUG_AGENT === "true") {
          printDebug(result);
        }

        console.log(`F1: ${result.text}\n`);
        currentState = result.state;
        previousResponseId = result.responseId;
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "Request failed.";
        console.error(`\n[error] ${messageText}\n`);
      }
    }
  } finally {
    rl.close();
  }
}

if (import.meta.main) {
  runConsoleChat().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
