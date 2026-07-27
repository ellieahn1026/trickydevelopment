export type AgentAction =
  | "respond"
  | "short"
  | "hesitate"
  | "silence"
  | "withdraw"
  | "end";

export type AgentState = {
  willingness: number;
  fatigue: number;
  interest: number;
  distance: number;
  conversationOpen: boolean;
  turnCount: number;
  lastAction: AgentAction;
};

export type AgentStateDeltas = {
  willingnessDelta: number;
  fatigueDelta: number;
  interestDelta: number;
  distanceDelta: number;
  conversationOpen: boolean;
};

export type AgentStateChanges = {
  willingnessChange: number;
  fatigueChange: number;
  interestChange: number;
  distanceChange: number;
};

export const PER_TURN_FATIGUE = 0.01;

export const INITIAL_AGENT_STATE: AgentState = {
  willingness: 0.7,
  fatigue: 0.2,
  interest: 0.55,
  distance: 0.25,
  conversationOpen: true,
  turnCount: 0,
  lastAction: "respond",
};

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function clampAgentState(state: AgentState): AgentState {
  return {
    willingness: clamp01(state.willingness),
    fatigue: clamp01(state.fatigue),
    interest: clamp01(state.interest),
    distance: clamp01(state.distance),
    conversationOpen: state.conversationOpen,
    turnCount: Math.max(0, Math.floor(state.turnCount)),
    lastAction: state.lastAction,
  };
}

export function createInitialAgentState(): AgentState {
  return clampAgentState({ ...INITIAL_AGENT_STATE });
}

export function isAgentState(value: unknown): value is AgentState {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AgentState>;
  const actions: AgentAction[] = [
    "respond",
    "short",
    "hesitate",
    "silence",
    "withdraw",
    "end",
  ];

  return (
    typeof candidate.willingness === "number" &&
    typeof candidate.fatigue === "number" &&
    typeof candidate.interest === "number" &&
    typeof candidate.distance === "number" &&
    typeof candidate.conversationOpen === "boolean" &&
    typeof candidate.turnCount === "number" &&
    typeof candidate.lastAction === "string" &&
    actions.includes(candidate.lastAction)
  );
}

export function formatStateDescription(state: AgentState): string {
  return [
    `willingness: ${state.willingness}`,
    `fatigue: ${state.fatigue}`,
    `interest: ${state.interest}`,
    `distance: ${state.distance}`,
  ].join("\n");
}

export function applyStateDeltas(
  state: AgentState,
  deltas: AgentStateDeltas,
): AgentState {
  return updateAgentState(state, {
    willingnessChange: deltas.willingnessDelta,
    fatigueChange: deltas.fatigueDelta,
    interestChange: deltas.interestDelta,
    distanceChange: deltas.distanceDelta,
  });
}

export function updateAgentState(
  state: AgentState,
  changes: AgentStateChanges,
): AgentState {
  return clampAgentState({
    ...state,
    willingness: state.willingness + changes.willingnessChange,
    interest: state.interest + changes.interestChange,
    distance: state.distance + changes.distanceChange,
    fatigue: state.fatigue + changes.fatigueChange + PER_TURN_FATIGUE,
    turnCount: state.turnCount + 1,
  });
}

export function withAction(state: AgentState, action: AgentAction): AgentState {
  return clampAgentState({
    ...state,
    lastAction: action,
    conversationOpen: action === "end" ? false : state.conversationOpen,
  });
}
