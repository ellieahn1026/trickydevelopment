import type { AgentState } from "./state.ts";

const HESITATION_PATTERNS: RegExp[] = [
  /음+\.{2,}|^음+\.?$/,
  /어+\.{2,}|^어+\.?$/,
  /글쎄/,
  /모르겠(?:어|는데)/,
  /생각해볼게/,
  /고민해볼게/,
  /(?:^|\s)잠깐(?:[\s,.!?]|$)/,
  /어떡하지/,
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function countHesitationPhrases(text: string): number {
  let count = 0;
  for (const pattern of HESITATION_PATTERNS) {
    if (pattern.test(text)) count += 1;
  }
  return count;
}

function hasEllipsis(text: string): boolean {
  return /\.{2,}|…/.test(text);
}

/** 구체적 사실·의견이 담긴 메시지면 머뭇거림 점수를 낮춘다. */
function hasConcreteContent(text: string): boolean {
  if (/\d/.test(text) && /[,，]|만원|개발|용/.test(text)) return true;

  const commaTail = text.split(/[,，]/).slice(1).join(",").trim();
  if (commaTail.length >= 12 && /(?:좋겠|해야|쓰는|으로|보다|하면)/.test(commaTail)) {
    return true;
  }
  if (commaTail.length >= 15) return true;

  if (/\b[A-Za-z][A-Za-z0-9+.]{2,}\b/.test(text) && text.length > 20) {
    return true;
  }

  return false;
}

/**
 * 사용자 메시지의 머뭇거림 정도 (0–1).
 * 키워드 단독 매칭이 아니라 길이·말줄임·구체성을 함께 본다.
 */
export function detectHesitation(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  let score = 0;

  const phraseCount = countHesitationPhrases(trimmed);
  if (phraseCount >= 2) score += 0.5;
  else if (phraseCount === 1) score += 0.38;

  if (hasEllipsis(trimmed)) score += 0.22;

  if (trimmed.length <= 12) {
    score += phraseCount > 0 ? 0.12 : 0.08;
  }

  if (hasConcreteContent(trimmed)) {
    score -= 0.35;
    if (phraseCount === 1 && /^글쎄\s*[,，]/.test(trimmed)) {
      score -= 0.15;
    }
  }

  if (trimmed.length > 25 && phraseCount <= 1 && hasConcreteContent(trimmed)) {
    score -= 0.1;
  }

  return clamp01(score);
}

const INFORMATION_SIGNALS: { weight: number; test: (text: string) => boolean }[] = [
  { weight: 0.1, test: (t) => /\d/.test(t) },
  {
    weight: 0.14,
    test: (t) => /\d+\s*만\s*원|\d+\s*원|\d{1,3}(?:,\d{3})+\s*원?/.test(t),
  },
  { weight: 0.12, test: (t) => /예산/.test(t) },
  { weight: 0.08, test: (t) => /목적|위해|하려(?:고|는)?/.test(t) },
  {
    weight: 0.08,
    test: (t) => /기간|\d+\s*(?:개월|년|주|일)|까지|부터/.test(t),
  },
  { weight: 0.08, test: (t) => /장소|에서|근처|지역|위치/.test(t) },
  { weight: 0.1, test: (t) => /(?:개발|업무|게임|학습)?용(?:도)?|용도/.test(t) },
  {
    weight: 0.12,
    test: (t) =>
      /(?:스택|framework|Framework)/.test(t) ||
      /\b(?:React|Node|Vue|Python|Java|PostgreSQL|MySQL|Docker|AWS|TypeScript|JavaScript)\b/i.test(
        t,
      ) ||
      /[A-Za-z]+\/[A-Za-z]+/.test(t),
  },
  { weight: 0.08, test: (t) => /환경|로컬|클라우드|배포|서버/.test(t) },
  { weight: 0.1, test: (t) => /조건|안\s*함|제외|포함|만\s/.test(t) },
  { weight: 0.1, test: (t) => /선호|희망|좋(?:겠|아)/.test(t) },
  { weight: 0.08, test: (t) => /원(?:해|함|하|는)/.test(t) },
  { weight: 0.08, test: (t) => /필요(?:해|한|함)?/.test(t) },
];

function substantiveClauses(text: string, separator: RegExp): string[] {
  return text
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !/^(?:추천|알려|해줘|해주)/.test(part));
}

function isBareRequest(text: string): boolean {
  return /^(?:추천(?:해)?(?:줘|주세요)?|알려(?:줘|주세요)?|해(?:줘|주세요)|부탁)[!.?\s]*$/i.test(
    text,
  );
}

function isVagueTopicRequest(text: string): boolean {
  return (
    /^[\s\S]{2,24}(?:추천|알려|해줘|해주세요)[!.?\s]*$/.test(text) &&
    !/[,，\d]/.test(text) &&
    !/(?:예산|용|선호|필요|원해|개발)/.test(text)
  );
}

/**
 * 사용자 메시지의 정보 충분도 (0–1).
 * 글자 수가 아니라 구체적 조건·수치·나열 신호를 조합한다.
 */
export function estimateInformation(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  if (isBareRequest(trimmed)) return clamp01(0.06);

  let score = 0;

  for (const signal of INFORMATION_SIGNALS) {
    if (signal.test(trimmed)) score += signal.weight;
  }

  const commaClauses = substantiveClauses(trimmed, /[,，]/);
  if (commaClauses.length >= 2) score += 0.12;
  if (commaClauses.length >= 3) score += 0.08;

  const lineClauses = substantiveClauses(trimmed, /\n+/);
  if (lineClauses.length >= 2) score += 0.1;

  // 길이만으로는 올리지 않고, 다른 신호가 있을 때만 소폭 가산
  if (score >= 0.18 && trimmed.length >= 20 && trimmed.length <= 220) {
    score += 0.05;
  }

  if (isVagueTopicRequest(trimmed)) {
    score = Math.max(score, 0.14);
    score = Math.min(score, 0.22);
  }

  return clamp01(score);
}

/** 문장 끝에서 내용이 이어질 가능성이 높은 연결·절 미완성 표현 */
const INCOMPLETE_TRAILING_ENDINGS = [
  "왜냐하면",
  "그러니까",
  "하려고",
  "그래서",
  "그리고",
  "인데",
  "근데",
  "하면",
  "일단",
] as const;

/**
 * 문장이 명백하게 중간에서 끝났는지 판단한다.
 * 마침표 부재만으로는 true가 되지 않는다.
 */
export function detectIncomplete(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (/[가-힣]+려고$/.test(trimmed)) return true;

  if (/(?:는데|은데|인데)$/.test(trimmed)) return true;

  for (const ending of INCOMPLETE_TRAILING_ENDINGS) {
    if (trimmed.endsWith(ending)) return true;
  }

  return false;
}

export type MessageIntent =
  | "greeting"
  | "question"
  | "follow_up"
  | "acknowledgment"
  | "command"
  | "other";

export type MessageSentiment = "positive" | "neutral" | "negative";

/** analyzeMessage 결과 */
export type MessageAnalysis = {
  intent: MessageIntent;
  sentiment: MessageSentiment;
  /** 메시지 긴급도 (0–1) */
  urgency: number;
  /** 예상 답변 복잡도 (0–1) */
  complexity: number;
  /** 분석 요약 (프롬프트·로그용) */
  summary: string;
};

export type AnalyzeMessageInput = {
  message: string;
  conversation: string;
  state: AgentState;
};

/**
 * 사용자 메시지를 분석한다.
 * TODO: OpenAI structured output 또는 휴리스틱으로 교체.
 */
export async function analyzeMessage(
  input: AnalyzeMessageInput,
): Promise<MessageAnalysis> {
  const text = input.message.trim();
  const isQuestion = text.includes("?");
  const isGreeting = /^(hi|hello|hey)\b/i.test(text);

  return {
    intent: isGreeting ? "greeting" : isQuestion ? "question" : "other",
    sentiment: "neutral",
    urgency: 0.3,
    complexity: Math.min(1, text.length / 400),
    summary: text.slice(0, 120) || "(empty message)",
  };
}
