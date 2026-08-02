import { useEffect, useRef, useState, type FormEvent } from "react";

import { postChat } from "../api/chat.ts";
import { mapApiEmotion } from "../lib/mapApiEmotion.ts";
import { buildInitialUiEmotionState } from "../lib/scheduledInitialEmotion.ts";
import { toSingleLine } from "../lib/wavePathText.ts";
import type { EmotionState } from "../types/emotion.ts";
import { EmotionBackground } from "./EmotionBackground.tsx";

type ChatTurn = {
  id: string;
  question: string;
  answer: string | null;
  emotion: EmotionState | null;
};

function createMessageId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createSessionId(): string {
  const existing = sessionStorage.getItem("pepper-session-id");
  if (existing) {
    return existing;
  }

  const sessionId = crypto.randomUUID();
  sessionStorage.setItem("pepper-session-id", sessionId);
  return sessionId;
}

export function Chat() {
  const [emotion, setEmotion] = useState<EmotionState>(() =>
    buildInitialUiEmotionState({ random: Math.random }),
  );
  const [sessionId] = useState(createSessionId);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [visibleTurnId, setVisibleTurnId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const turnElementsRef = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (turns.length === 0) {
      return;
    }

    document.body.classList.add("chat-started", "composer-locked");
  }, [turns.length]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || turns.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;

        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            (!best || entry.intersectionRatio > best.intersectionRatio)
          ) {
            best = entry;
          }
        }

        if (!(best?.target instanceof HTMLElement)) {
          return;
        }

        const turnId = best.target.dataset.turnId;
        if (turnId) {
          setVisibleTurnId(turnId);
        }
      },
      {
        root: thread,
        threshold: [0.45, 0.6, 0.75, 0.9],
      },
    );

    for (const element of turnElementsRef.current.values()) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [turns]);

  function registerTurnElement(turnId: string, element: HTMLElement | null) {
    if (element) {
      turnElementsRef.current.set(turnId, element);
      return;
    }

    turnElementsRef.current.delete(turnId);
  }

  function scrollToTurn(turnId: string) {
    const element = turnElementsRef.current.get(turnId);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();
    if (!message || isLoading) {
      return;
    }

    setInput("");
    setError(null);

    const turnId = createMessageId("turn");
    setTurns((current) => [
      ...current,
      { id: turnId, question: message, answer: null, emotion: null },
    ]);
    setVisibleTurnId(turnId);
    setIsLoading(true);

    requestAnimationFrame(() => {
      scrollToTurn(turnId);
    });

    try {
      const response = await postChat({ sessionId, message });
      const mappedEmotion = response.emotion
        ? mapApiEmotion(response.emotion)
        : null;

      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                answer: response.message,
                emotion: mappedEmotion,
              }
            : turn,
        ),
      );

      if (mappedEmotion) {
        setEmotion(mappedEmotion);
      }
    } catch (submitError) {
      const messageText =
        submitError instanceof Error
          ? submitError.message
          : "Chat request failed.";
      setError(messageText);
    } finally {
      setIsLoading(false);
    }
  }

  const latestTurn = turns[turns.length - 1] ?? null;
  const visibleTurn =
    turns.find((turn) => turn.id === visibleTurnId) ?? latestTurn;
  const isViewingLatest = visibleTurn?.id === latestTurn?.id;

  const waveAnswerText =
    isViewingLatest && isLoading
      ? "Thinking..."
      : isViewingLatest && error
        ? null
        : visibleTurn?.answer
          ? toSingleLine(visibleTurn.answer)
          : null;

  const displayEmotion = visibleTurn?.emotion ?? emotion;

  return (
    <EmotionBackground
      emotion={displayEmotion}
      answerText={waveAnswerText}
      answerScrollKey={visibleTurn?.id ?? null}
    >
      <main className="chat-panel">
        <div
          ref={threadRef}
          className="chat-panel__thread pepper-thread-snap"
          id="chat-thread"
          aria-live="polite"
        >
          {turns.map((turn) => (
            <section
              key={turn.id}
              ref={(element) => registerTurnElement(turn.id, element)}
              className="pepper-turn-snap"
              data-turn-id={turn.id}
              aria-label="Question and answer"
            >
              <div className="pepper-turn-snap__question-anchor">
                <div className="chat-question">{turn.question}</div>
              </div>
              {turn.answer ? (
                <div className="chat-answer chat-answer--wave-canvas">
                  {turn.answer}
                </div>
              ) : null}
            </section>
          ))}
          {isViewingLatest && error ? (
            <div className="chat-answer chat-answer--error pepper-turn-snap__error">
              {error}
            </div>
          ) : null}
        </div>

        <div className="chat-panel__composer" id="chat-composer">
          <p className="prompt__headline" id="chat-headline">
            What do you want to talk about?
          </p>
          <form className="prompt__form" id="chat-form" onSubmit={handleSubmit}>
            <div className="prompt__field">
              <input
                type="text"
                id="chat-input"
                name="message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask to PepperGPT"
                autoComplete="off"
                aria-label="Ask to PepperGPT"
                disabled={isLoading}
              />
              <button
                type="submit"
                className="prompt__send"
                disabled={isLoading || !input.trim()}
              >
                {isLoading ? "..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </EmotionBackground>
  );
}
