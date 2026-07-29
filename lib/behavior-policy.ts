import type { AgentAction, AgentState } from "./agent-state";

type WeightedAction = {
  action: AgentAction;
  weight: number;
};

function pickWeighted(options: WeightedAction[]): AgentAction {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = Math.random() * total;

  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) {
      return option.action;
    }
  }

  return options[options.length - 1]!.action;
}

function withLastActionBias(
  options: WeightedAction[],
  lastAction: AgentAction,
): WeightedAction[] {
  const boost: Partial<Record<AgentAction, Partial<Record<AgentAction, number>>>> =
    {
      silence: { withdraw: 4, end: 5, silence: 2 },
      withdraw: { end: 8, silence: 3, withdraw: 2 },
      short: { silence: 3, hesitate: 2, withdraw: 1, end: 3 },
      hesitate: { silence: 2, short: 2, withdraw: 1, end: 2 },
    };

  const deltas = boost[lastAction];
  if (!deltas) return options;

  return options.map((option) => ({
    ...option,
    weight: option.weight + (deltas[option.action] ?? 0),
  }));
}

export function chooseAction(state: AgentState): AgentAction {
  const { fatigue, willingness, distance, interest, turnCount, lastAction } =
    state;

  if (fatigue > 0.6 && willingness < 0.4) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "end", weight: 36 },
          { action: "withdraw", weight: 10 },
          { action: "silence", weight: 12 },
          { action: "short", weight: 16 },
          { action: "respond", weight: 20 },
        ],
        lastAction,
      ),
    );
  }

  if (
    lastAction === "silence" ||
    lastAction === "withdraw" ||
    (lastAction === "short" && turnCount >= 4)
  ) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 32 },
          { action: "hesitate", weight: 16 },
          { action: "short", weight: 14 },
          { action: "silence", weight: 10 },
          { action: "withdraw", weight: 8 },
          { action: "end", weight: 16 },
        ],
        lastAction,
      ),
    );
  }

  if (distance > 0.65 || willingness < 0.35) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 30 },
          { action: "hesitate", weight: 20 },
          { action: "short", weight: 18 },
          { action: "silence", weight: 12 },
          { action: "withdraw", weight: 6 },
          { action: "end", weight: 10 },
        ],
        lastAction,
      ),
    );
  }

  if (fatigue > 0.5 || turnCount >= 7) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 32 },
          { action: "short", weight: 22 },
          { action: "hesitate", weight: 16 },
          { action: "silence", weight: 10 },
          { action: "withdraw", weight: 6 },
          { action: "end", weight: 12 },
        ],
        lastAction,
      ),
    );
  }

  if (interest < 0.3) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 36 },
          { action: "short", weight: 22 },
          { action: "hesitate", weight: 14 },
          { action: "silence", weight: 10 },
          { action: "withdraw", weight: 6 },
          { action: "end", weight: 8 },
        ],
        lastAction,
      ),
    );
  }

  if (turnCount >= 4) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 52 },
          { action: "hesitate", weight: 14 },
          { action: "short", weight: 16 },
          { action: "silence", weight: 8 },
          { action: "end", weight: 6 },
        ],
        lastAction,
      ),
    );
  }

  return pickWeighted([
    { action: "respond", weight: 72 },
    { action: "hesitate", weight: 14 },
    { action: "short", weight: 14 },
  ]);
}

export function shouldGenerateReply(action: AgentAction): boolean {
  return action !== "silence" && action !== "withdraw" && action !== "end";
}

export function behaviorSummary(action: AgentAction): string {
  switch (action) {
    case "respond":
      return "Engage normally with a full reply.";
    case "short":
      return "Reply briefly and keep distance.";
    case "hesitate":
      return "Delay or soften before answering.";
    case "silence":
      return "Do not answer this turn.";
    case "withdraw":
      return "Pull back from the conversation.";
    case "end":
      return "Close the conversation.";
  }
}
