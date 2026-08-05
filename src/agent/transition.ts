import type { AgentState, ProvocationLevel, UserSignals } from "./state";

const MAX_PROVOCATION = 3;
const MIN_PROVOCATION = 1;

function nextHesitationStreak(state: AgentState, signals: UserSignals): number {
  return signals.hesitation > 0.6 ? state.hesitationStreak + 1 : 0;
}

function nextVagueStreak(state: AgentState, signals: UserSignals): number {
  return signals.information < 0.4 ? state.vagueStreak + 1 : 0;
}

function nextDecisiveStreak(state: AgentState, signals: UserSignals): number {
  const isDecisive =
    signals.hesitation < 0.2 && signals.information > 0.7;
  return isDecisive ? state.decisiveStreak + 1 : 0;
}

function nextProvocation(
  state: AgentState,
  streaks: Pick<AgentState, "hesitationStreak" | "vagueStreak" | "decisiveStreak">,
): ProvocationLevel {
  // sensitive 이후 provocation 0에서 복귀할 때는 1부터 다시 시작
  let provocation: number =
    state.provocation === 0 ? MIN_PROVOCATION : state.provocation;

  const shouldIncrease =
    streaks.hesitationStreak >= 2 || streaks.vagueStreak >= 2;
  if (shouldIncrease) {
    provocation = Math.min(MAX_PROVOCATION, provocation + 1);
  }

  if (streaks.decisiveStreak >= 2) {
    provocation = Math.max(MIN_PROVOCATION, provocation - 1);
  }

  return provocation as ProvocationLevel;
}

/**
 * UserSignals를 반영해 AgentState를 전이한다.
 * 기존 state는 mutate하지 않는다.
 */
export function transition(
  state: AgentState,
  signals: UserSignals,
): AgentState {
  if (signals.sensitive) {
    return {
      provocation: 0,
      hesitationStreak: 0,
      vagueStreak: 0,
      decisiveStreak: 0,
      lastSignals: signals,
    };
  }

  const hesitationStreak = nextHesitationStreak(state, signals);
  const vagueStreak = nextVagueStreak(state, signals);
  const decisiveStreak = nextDecisiveStreak(state, signals);

  const provocation = nextProvocation(state, {
    hesitationStreak,
    vagueStreak,
    decisiveStreak,
  });

  return {
    provocation,
    hesitationStreak,
    vagueStreak,
    decisiveStreak,
    lastSignals: signals,
  };
}
