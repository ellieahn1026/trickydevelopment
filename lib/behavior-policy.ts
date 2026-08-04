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
      silence: { withdraw: 6, end: 8, silence: 3 },
      withdraw: { end: 12, silence: 5, withdraw: 3 },
      short: { silence: 5, hesitate: 2, withdraw: 3, end: 5 },
      hesitate: { silence: 4, short: 2, withdraw: 3, end: 4 },
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

  if (fatigue > 0.42 && willingness < 0.52) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "end", weight: 48 },
          { action: "withdraw", weight: 16 },
          { action: "silence", weight: 18 },
          { action: "short", weight: 12 },
          { action: "respond", weight: 10 },
        ],
        lastAction,
      ),
    );
  }

  if (
    lastAction === "silence" ||
    lastAction === "withdraw" ||
    (lastAction === "short" && turnCount >= 3)
  ) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 22 },
          { action: "hesitate", weight: 14 },
          { action: "short", weight: 12 },
          { action: "silence", weight: 16 },
          { action: "withdraw", weight: 14 },
          { action: "end", weight: 24 },
        ],
        lastAction,
      ),
    );
  }

  if (distance > 0.48 || willingness < 0.48) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 20 },
          { action: "hesitate", weight: 16 },
          { action: "short", weight: 14 },
          { action: "silence", weight: 18 },
          { action: "withdraw", weight: 14 },
          { action: "end", weight: 20 },
        ],
        lastAction,
      ),
    );
  }

  if (fatigue > 0.38 || turnCount >= 4) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 22 },
          { action: "short", weight: 16 },
          { action: "hesitate", weight: 14 },
          { action: "silence", weight: 16 },
          { action: "withdraw", weight: 12 },
          { action: "end", weight: 22 },
        ],
        lastAction,
      ),
    );
  }

  if (interest < 0.42) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 24 },
          { action: "short", weight: 18 },
          { action: "hesitate", weight: 14 },
          { action: "silence", weight: 16 },
          { action: "withdraw", weight: 12 },
          { action: "end", weight: 18 },
        ],
        lastAction,
      ),
    );
  }

  if (turnCount >= 2) {
    return pickWeighted(
      withLastActionBias(
        [
          { action: "respond", weight: 36 },
          { action: "hesitate", weight: 14 },
          { action: "short", weight: 14 },
          { action: "silence", weight: 12 },
          { action: "withdraw", weight: 10 },
          { action: "end", weight: 16 },
        ],
        lastAction,
      ),
    );
  }

  return pickWeighted([
    { action: "respond", weight: 46 },
    { action: "hesitate", weight: 14 },
    { action: "short", weight: 14 },
    { action: "silence", weight: 10 },
    { action: "withdraw", weight: 8 },
    { action: "end", weight: 10 },
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
