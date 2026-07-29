export type ProvocationLevel = 0 | 1 | 2 | 3;

export type ResponseMode =
  | "tiny"
  | "short"
  | "normal"
  | "detailed";

export interface UserSignals {
  /** 0–1 */
  hesitation: number;
  /** 0–1 */
  information: number;
  incomplete: boolean;
  sensitive: boolean;
}

export interface AgentState {
  provocation: ProvocationLevel;

  hesitationStreak: number;
  vagueStreak: number;
  decisiveStreak: number;

  lastSignals?: UserSignals;
}

export const initialAgentState: AgentState = {
  provocation: 1,
  hesitationStreak: 0,
  vagueStreak: 0,
  decisiveStreak: 0,
};
