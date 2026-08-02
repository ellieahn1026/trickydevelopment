import {
  createInitialEmotionState,
  type EmotionState,
} from "../models/emotion.ts";
import {
  applyRandomEmotionVariation,
  applySpontaneousAnger,
} from "../services/emotionEngine.ts";

export type MessageRole = "user" | "assistant" | "system";

export type SessionMessage = {
  role: MessageRole;
  content: string;
};

export type Session = {
  emotionState: EmotionState;
  messages: SessionMessage[];
  lastResponseId?: string;
};

const sessions = new Map<string, Session>();

function createSessionEmotionState(): EmotionState {
  const random = Math.random;
  let state = createInitialEmotionState({ random });
  state = applySpontaneousAnger(state, random);
  state = applyRandomEmotionVariation(state, random);
  return state;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function createSession(sessionId: string): Session {
  if (sessions.has(sessionId)) {
    throw new Error(`Session already exists: ${sessionId}`);
  }

  const session: Session = {
    emotionState: createSessionEmotionState(),
    messages: [],
  };

  sessions.set(sessionId, session);
  return session;
}

export function updateEmotion(sessionId: string, state: EmotionState): Session {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.emotionState = state;
  return session;
}

export function setLastResponseId(
  sessionId: string,
  responseId: string,
): Session {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.lastResponseId = responseId;
  return session;
}

export function addMessage(
  sessionId: string,
  role: MessageRole,
  content: string,
): Session {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.messages.push({ role, content });
  return session;
}
