import type { ResponseMode, UserSignals } from "./state.ts";

/** 모드별 max_output_tokens 상한 (프롬프트가 길이를 주로 제어하고, 이 값은 ceiling 역할만 한다) */
export const RESPONSE_MODE_MAX_OUTPUT_TOKENS: Record<ResponseMode, number> = {
  tiny: 120,
  short: 300,
  normal: 700,
  detailed: 1400,
};

/**
 * UserSignals.information 수준에 따라 응답 모드를 결정한다.
 */
export function determineResponseMode(signals: UserSignals): ResponseMode {
  const { information } = signals;

  if (information < 0.25) return "tiny";
  if (information < 0.5) return "short";
  if (information < 0.8) return "normal";
  return "detailed";
}

/**
 * ResponseMode에 대응하는 max_output_tokens 상한을 반환한다.
 */
export function getMaxOutputTokens(mode: ResponseMode): number {
  return RESPONSE_MODE_MAX_OUTPUT_TOKENS[mode];
}
