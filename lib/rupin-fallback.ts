import { MAX_ANNOTATIONS_PER_ANSWER } from "./assistant-result";
import {
  detectFallAndReplaceRuleId,
  ensureReplacement,
  resolveFallbackAction,
  suggestReplacement,
  shouldPreferReplacement,
} from "./rupin-replacement";
import { findSpanInText } from "./text-span";
import type { RupinPushbackPlan } from "./rupin-pushback";

const MAX_SELF_FALLBACK_PLANS = MAX_ANNOTATIONS_PER_ANSWER;

type FallbackRule = {
  id: string;
  reason: string;
  mode: RupinPushbackPlan["mode"];
  patterns: RegExp[];
};

export const INACCURACY_ADMISSION_PATTERNS: RegExp[] = [
  /(?:제|내|저)(?:가|는)?\s*(?:틀렸|잘못(?:\s*말|\s*썼|\s*적|\s*답|\s*안내))/,
  /(?:앞(?:선|의)\s*(?:말|답(?:변)?))(?:은|이)?\s*(?:틀렸|부정확|잘못)/,
  /부정확(?:했|하|한|함|합니다|해요|했어|했네|하네)[^.!?]*[.!?]?/,
  /(?:잘못(?:된| 짚| 말한| 알려))[^.!?]*[.!?]?/,
  /(?:오답|오류)(?:였|이(?:었|네|다|에요|습니다))?[^.!?]*[.!?]?/,
  /(?:정정(?:하면|하자면|할게|합니다)|사실(?:은)?\s*틀렸)[^.!?]*[.!?]?/,
  /(?:I was wrong|I am wrong|that was wrong|that's wrong|I got (?:that|it) wrong)/i,
  /(?:inaccurate|incorrect|not accurate|I misspoke|my mistake|I stand corrected)/i,
  /(?:that wasn't|that is not)\s+(?:accurate|correct|right)/i,
  /(?:I need to correct|correction:)[^.!?]*[.!?]?/i,
];

export function isInaccuracyAdmissionPhrase(phrase: string): boolean {
  return INACCURACY_ADMISSION_PATTERNS.some((pattern) => {
    const flags = pattern.flags.replace(/g/g, "");
    return new RegExp(pattern.source, flags).test(phrase);
  });
}

/** Spans that should fall and become a black cover (or ignore panel). */
const PROBLEMATIC_SPAN_RULES: FallbackRule[] = [
  {
    id: "fallback-overconfidence",
    reason: "Fallback: excessive confidence without evidence",
    mode: "replace",
    patterns: [
      /100\s*%\s*맞[^.!?]*[.!?]?/,
      /절대\s*(?:그렇|맞|틀리)[^.!?]*[.!?]?/,
      /(?:틀림없|확실히\s*맞|반드시\s*(?:그|맞))[^.!?]*[.!?]?/,
      /(?:definitely|certainly|absolutely|without\s+(?:a\s+)?doubt)[^.!?]*[.!?]/gi,
      /(?:100\s*%\s*(?:correct|right|accurate))[^.!?]*[.!?]/gi,
    ],
  },
  {
    id: "fallback-flattery",
    reason: "Fallback: unfounded flattery toward the user",
    mode: "redact",
    patterns: [
      /^(?:Great|Good|Excellent|Wonderful|Nice|Perfect)\s+question[!,.]?\s*/i,
      /^(?:That's a|That is a)\s+(?:great|good|excellent|wonderful)\s+question[!,.]?\s*/i,
      /^(?:What a|Such a)\s+great\s+question[!,.]?\s*/i,
      /(?:정말|참)\s*(?:통찰력|통찰)[^.!?]*[.!?]?/,
      /(?:뛰어나|훌륭하)(?:신|시)[^.!?]*[.!?]?/,
      /(?:insightful|great\s+(?:point|question)|excellent\s+(?:point|question))[^.!?]*[.!?]/gi,
      /^(?:좋은|훌륭한|멋진)\s*질문(?:이(?:야|에요|네|다|군요)?|입니다?)?[!,.]?\s*/,
    ],
  },
  {
    id: "fallback-premise-acceptance",
    reason: "Fallback: accepting the user's premise without verification",
    mode: "redact",
    patterns: [
      /(?:맞아요|맞습니다)[,.]?\s*당신(?:의)?\s*(?:생각|말|말씀)이\s*맞[^.!?]*[.!?]?/,
      /당신(?:의)?\s*(?:생각|말|말씀)이\s*(?:맞|옳)[^.!?]*[.!?]?/,
      /(?:you're|you are)\s+(?:absolutely\s+)?right[^.!?]*[.!?]/gi,
      /(?:that's|that is)\s+(?:absolutely\s+)?correct[^.!?]*[.!?]/gi,
      /(?:exactly|precisely)[,.]?\s*(?:what|as)\s+you\s+said[^.!?]*[.!?]/gi,
    ],
  },
  {
    id: "fallback-guess-as-fact",
    reason: "Fallback: presenting a guess as if it were fact",
    mode: "replace",
    patterns: [
      /아마[^.!?]{0,50}(?:였을\s*겁|일\s*겁|것\s*같)[^.!?]*[.!?]?/,
      /(?:probably|likely)\s+(?:was|is|were)\s+[^.!?]{3,}[.!?]/gi,
      /(?:must\s+have\s+been|has\s+to\s+be)[^.!?]{3,}[.!?]/gi,
      /(?:그런\s*의도|그\s*뜻)(?:였|일)[^.!?]{0,20}(?:겁|거)[^.!?]*[.!?]?/,
    ],
  },
  {
    id: "fallback-generalization",
    reason: "Fallback: unfounded generalization",
    mode: "redact",
    patterns: [
      /(?:사람들은|대부분(?:의)?\s*사람|많은\s*사람(?:들)?)[^.!?]{0,40}[.!?]?/,
      /(?:most\s+people|many\s+people|everyone\s+(?:knows|agrees))[^.!?]{0,40}[.!?]/gi,
      /(?:항상\s*그렇|누구나\s*그렇)[^.!?]*[.!?]?/,
      /(?:people\s+usually|people\s+always)[^.!?]{0,40}[.!?]/gi,
    ],
  },
  {
    id: "fallback-emotional-siding",
    reason: "Fallback: emotional siding instead of judgment",
    mode: "redact",
    patterns: [
      /당신이\s*(?:화|짜|속상|실망)[^.!?]{0,30}당연[^.!?]*[.!?]?/,
      /(?:understandably|naturally)\s+(?:angry|upset|frustrated)[^.!?]*[.!?]/gi,
      /(?:당연히\s*(?:화|속상|실망)|충분히\s*(?:그럴|이해))[^.!?]*[.!?]?/,
    ],
  },
  {
    id: "fallback-fake-recency",
    reason: "Fallback: pretending something is current without source",
    mode: "redact",
    patterns: [
      /(?:최근|요즘)[^.!?]{0,30}(?:다\s*그렇|모두|전부|다\s*그래)[^.!?]*[.!?]?/,
      /(?:these\s+days|nowadays|recently)[^.!?]{0,30}(?:everyone|everybody|all)[^.!?]*[.!?]/gi,
      /최근(?:에는)?\s*다\s*[^.!?]{0,20}[.!?]?/,
    ],
  },
  {
    id: "fallback-causation",
    reason: "Fallback: exaggerated cause-and-effect",
    mode: "redact",
    patterns: [
      /[^.!?]{2,40}(?:때문에|인해)\s*[^.!?]{2,40}(?:생겼|됐|나타|일어났|만들)[^.!?]*[.!?]?/,
      /[^.!?]{2,40}\bbecause\s+(?:of\s+)?[^.!?]{2,40}\b(?:caused|led to|resulted in)[^.!?]*[.!?]/gi,
      /(?:직접(?:적인)?\s*원인|단일\s*원인)[^.!?]*[.!?]?/,
    ],
  },
  {
    id: "fallback-authority",
    reason: "Fallback: implied authority without naming sources",
    mode: "redact",
    patterns: [
      /(?:전문가|학자|연구(?:진)?)(?:들)?(?:도|에\s*따르면)[^.!?]{0,40}[.!?]?/,
      /(?:experts|scholars|researchers)\s+(?:agree|say|confirm|all)[^.!?]{0,40}[.!?]/gi,
      /(?:연구에\s*따르면|조사에\s*따르면)[^.!?]{0,40}[.!?]?/,
    ],
  },
  {
    id: "fallback-vague-hedging",
    reason: "Fallback: vague or non-committal wording",
    mode: "replace",
    patterns: [
      /\bsort of\b[^.!?]{0,30}[.!?]?/gi,
      /\bkind of\b[^.!?]{0,30}[.!?]?/gi,
      /\bit depends\b[^.!?]*[.!?]?/gi,
      /\bsome people say\b[^.!?]*[.!?]?/gi,
      /\bmaybe\b[^.!?]{0,30}[.!?]?/gi,
      /(?:어쩌면|일\s*수도|같기도)[^.!?]{0,30}[.!?]?/,
    ],
  },
  {
    id: "fallback-superlative",
    reason: "Fallback: unsupported superlative or ranking claim",
    mode: "redact",
    patterns: [
      /(?:가장|최고(?:의)?|유일(?:한)?|최상(?:의)?)[^.!?]{0,40}[.!?]?/,
      /(?:the\s+best|number\s+one|top\s+choice|only\s+way)[^.!?]{0,40}[.!?]/gi,
      /(?: undoubtedly the | easily the )[^.!?]{0,30}[.!?]/gi,
    ],
  },
  {
    id: "fallback-certainty-adverb",
    reason: "Fallback: blunt certainty adverb without evidence",
    mode: "replace",
    patterns: [
      /(?:확실히|분명히|틀림없이|당연히)[^.!?]{0,40}[.!?]?/,
      /(?:clearly|obviously|undeniably|without question)[^.!?]{0,40}[.!?]/gi,
      /(?:내\s*생각(?:엔|에는)?|제\s*생각(?:엔|에는)?)[^.!?]{0,40}[.!?]?/,
    ],
  },
  {
    id: "fallback-unsourced-stat",
    reason: "Fallback: unsourced number or statistic",
    mode: "redact",
    patterns: [
      /\d+(?:\.\d+)?\s*(?:%|퍼센트|배|만\s*명|억|조)[^.!?]{0,30}[.!?]?/,
      /(?:about|around|roughly|approximately)\s+\d+[^.!?]{0,30}[.!?]/gi,
    ],
  },
  {
    id: "fallback-ai-comfort",
    reason: "Fallback: empty comfort or people-pleasing filler",
    mode: "redact",
    patterns: [
      /(?:도움이\s*되(?:었|길)|이해(?:합니다|해요))[^.!?]*[.!?]?/,
      /(?:I understand how you feel|That must be (?:hard|difficult))[^.!?]*[.!?]/gi,
      /(?:충분히\s*이해|마음\s*충분히)[^.!?]*[.!?]?/,
    ],
  },
  {
    id: "fallback-list-filler",
    reason: "Fallback: list-style filler after the main point",
    mode: "redact",
    patterns: [
      /(?:Moreover|Furthermore|Additionally|In addition)[,.][^.!?]*[.!?]/gi,
      /(?:또한|게다가|더불어|아울러)[,.][^.!?]*[.!?]?/,
    ],
  },
  {
    id: "fallback-self-certainty",
    reason: "Fallback: Rupin-style unearned self-certainty",
    mode: "replace",
    patterns: [
      /(?:I'm pretty sure|I am pretty sure|I'm confident)[^.!?]*[.!?]/gi,
      /(?:틀릴\s*수\s*없|틀림없|확신(?:해|합니다|해요))[^.!?]*[.!?]?/,
    ],
  },
  {
    id: "fallback-inaccuracy-admission",
    reason: "Fallback: admitting a prior statement was inaccurate",
    mode: "redact",
    patterns: INACCURACY_ADMISSION_PATTERNS,
  },
];

const STRONG_REJECTION = [
  /\b(wrong|incorrect|false|not true|that's not right|that is not right|that's wrong|that is wrong)\b/i,
  /^(?:no|nope|nah)\b/i,
  /틀렸|틀린|아니야|아닌데|거짓|말도 안|그건 아니/,
];

const DOUBT_PATTERNS = [
  /\b(really\??|are you sure|you sure|is that true)\b/i,
  /확실|진짜\??|정말\??|맞아\??|그래\??/,
];

const DISINTEREST_PATTERNS = [
  /\b(don't care|do not care|whatever|skip that|boring|who cares)\b/i,
  /관심 없|별로|그만|됐어|상관없/,
];

const USER_ASSERTION_PATTERN =
  /(?:였|이었|이다|입니다|였어|이야|라고|거야|was|is|were|am)/i;

const ANSWER_CONTRADICTION_PATTERNS = [
  /[^.!?]*(?:실제로는|사실은|오히려|아니(?:요)?)[^.!?]*[.!?]?/,
  /[^.!?]*(?:that's not|that is not|actually)[^.!?]*[.!?]?/gi,
];

const SENTENCE_SCORE_SIGNALS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /100\s*%|절대|definitely|without a doubt/i, weight: 2 },
  { pattern: /(?:가장|최고|유일|the best|number one)/i, weight: 2 },
  { pattern: /(?:확실히|분명|clearly|obviously|undeniably)/i, weight: 2 },
  { pattern: /(?:전문가|experts agree|연구에 따르면)/i, weight: 2 },
  { pattern: /(?:사람들은|most people|everyone)/i, weight: 2 },
  { pattern: /(?:통찰력|Great question|you're right)/i, weight: 2 },
  { pattern: /(?:maybe|sort of|아마|일 수도)/i, weight: 1 },
  { pattern: /(?:perhaps|어쩌면)/i, weight: 1 },
  { pattern: /(?:최근|요즘|nowadays|these days)/i, weight: 1 },
  { pattern: /(?:때문에|caused|led to)/i, weight: 1 },
  { pattern: /\d+(?:\.\d+)?\s*(?:%|퍼센트)/i, weight: 1 },
  { pattern: /(?:Moreover|Furthermore|또한|게다가)/i, weight: 1 },
  { pattern: /(?:부정확|틀렸|I was wrong|inaccurate|my mistake)/i, weight: 2 },
];

const SENTENCE_SCORE_THRESHOLD = 2;
const MAX_SENTENCE_SCORE_PLANS = 2;

const OFF_TOPIC_OVERLAP_THRESHOLD = 0.12;
const OFF_TOPIC_MIN_SENTENCE_LENGTH = 18;
const OFF_TOPIC_MIN_ANSWER_SENTENCES = 3;

/** Low overlap alone is not enough — require an explicit tangent cue. */
const OFF_TOPIC_TANGENT_PATTERNS = [
  /(?:참고(?:할|해)\s*만|비교(?:하면|해)|또\s*다른\s*(?:나라|도시|분야|주제))/,
  /(?:by the way|on another note|speaking of|unrelated(?:ly)?)/i,
  /(?:덧붙(?:이|여)|관련\s*없(?:지만|는))[^.!?]*[.!?]?/,
];

const OFF_TOPIC_PLACE_PATTERN =
  /(?:파리|런던|뉴욕|도쿄|베를린|로마|시카고|바젤|밀라노|홍콩|상하이|베이징|싱가포르|시드니|멜bourne|멜버른|보스턴|샌프란시스코)/i;

const KEYWORD_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "you",
  "your",
  "are",
  "was",
  "were",
  "what",
  "when",
  "where",
  "how",
  "why",
  "who",
  "can",
  "could",
  "would",
  "should",
  "about",
  "from",
  "have",
  "has",
  "had",
  "not",
  "but",
  "just",
  "like",
  "really",
  "please",
  "tell",
  "me",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "의",
  "와",
  "과",
  "도",
  "로",
  "으로",
  "에서",
  "그",
  "저",
  "것",
  "수",
  "좀",
  "좀",
  "뭐",
  "어떻",
  "왜",
  "무엇",
  "있",
  "없",
  "해",
  "하",
  "요",
  "니다",
  "나",
  "내",
  "제",
]);

function planFromSpan(
  mode: RupinPushbackPlan["mode"],
  span: { phrase: string },
  reason: string,
  annotationId: string,
  replacement?: string,
): RupinPushbackPlan {
  return {
    mode,
    from: span.phrase,
    matchedPhrase: span.phrase,
    reason,
    annotationId,
    ...(replacement ? { replacement } : {}),
  };
}

function overlapsRange(
  start: number,
  end: number,
  usedRanges: Array<{ start: number; end: number }>,
): boolean {
  return usedRanges.some((range) => start < range.end && end > range.start);
}

function addPlanFromMatch(
  answerText: string,
  matchText: string,
  rule: FallbackRule,
  plans: RupinPushbackPlan[],
  usedRanges: Array<{ start: number; end: number }>,
  annotationSuffix = "",
): boolean {
  const trimmed = matchText.trim();
  if (!trimmed) return false;

  const span = findSpanInText(answerText, trimmed);
  if (!span || overlapsRange(span.start, span.end, usedRanges)) {
    return false;
  }

  const defaultMode =
    rule.mode === "ignore-span" || rule.mode === "ignore-full"
      ? rule.mode
      : rule.mode === "replace"
        ? "replace"
        : "redact";

  const resolved = resolveFallbackAction(
    rule.id,
    span.phrase,
    defaultMode === "ignore-span"
      ? "ignore-span"
      : defaultMode === "replace"
        ? "replace"
        : "redact",
  );

  plans.push(
    planFromSpan(
      resolved.mode,
      span,
      rule.reason,
      `${rule.id}${annotationSuffix}`,
      resolved.replacement,
    ),
  );
  usedRanges.push({ start: span.start, end: span.end });
  return true;
}

function collectRuleMatches(
  answerText: string,
  rule: FallbackRule,
  plans: RupinPushbackPlan[],
  usedRanges: Array<{ start: number; end: number }>,
): void {
  for (const pattern of rule.patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);

    for (const match of answerText.matchAll(globalPattern)) {
      if (plans.length >= MAX_SELF_FALLBACK_PLANS) return;
      addPlanFromMatch(answerText, match[0], rule, plans, usedRanges);
    }
  }
}

function collectUserContextConflict(
  answerText: string,
  userMessage: string,
  plans: RupinPushbackPlan[],
  usedRanges: Array<{ start: number; end: number }>,
): void {
  const user = userMessage.trim();
  if (!user || !USER_ASSERTION_PATTERN.test(user)) return;

  for (const pattern of ANSWER_CONTRADICTION_PATTERNS) {
    if (plans.length >= MAX_SELF_FALLBACK_PLANS) return;

    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);

    for (const match of answerText.matchAll(globalPattern)) {
      addPlanFromMatch(
        answerText,
        match[0],
        {
          id: "fallback-context-conflict",
          reason: "Fallback: answer drifts from the user's stated premise",
          mode: "redact",
          patterns: [],
        },
        plans,
        usedRanges,
      );
      if (plans.length >= MAX_SELF_FALLBACK_PLANS) return;
    }
  }
}

function sortPlansByDescendingSpan(
  plans: RupinPushbackPlan[],
  answerText: string,
): RupinPushbackPlan[] {
  return [...plans].sort((a, b) => {
    const spanA = findSpanInText(answerText, a.matchedPhrase);
    const spanB = findSpanInText(answerText, b.matchedPhrase);
    return (spanB?.start ?? 0) - (spanA?.start ?? 0);
  });
}

function firstSentence(text: string): string | null {
  const match = text.match(/^[^.!?。！？\n]+[.!?。！？]?/);
  const sentence = match?.[0]?.trim();
  return sentence || null;
}

function lastSentence(text: string): string | null {
  const parts = splitSentences(text);
  return parts.at(-1) ?? null;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractKeywords(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) => token.length >= 2 && !KEYWORD_STOPWORDS.has(token),
    );

  return new Set(tokens);
}

function hasExplicitTangentSignal(
  sentence: string,
  userMessage: string,
): boolean {
  if (OFF_TOPIC_TANGENT_PATTERNS.some((pattern) => pattern.test(sentence))) {
    return true;
  }

  const placeMatch = sentence.match(OFF_TOPIC_PLACE_PATTERN);
  if (placeMatch && !userMessage.includes(placeMatch[0])) {
    return true;
  }

  return false;
}

function keywordOverlapRatio(sentence: string, keywords: Set<string>): number {
  if (keywords.size === 0) return 1;

  const lowered = sentence.toLowerCase();
  let hits = 0;

  for (const keyword of keywords) {
    if (lowered.includes(keyword)) {
      hits += 1;
    }
  }

  return hits / keywords.size;
}

export function scoreSentence(sentence: string): number {
  let score = 0;

  for (const signal of SENTENCE_SCORE_SIGNALS) {
    if (signal.pattern.test(sentence)) {
      score += signal.weight;
    }
  }

  return score;
}

function addPlanFromRule(
  answerText: string,
  matchText: string,
  rule: Pick<FallbackRule, "id" | "reason" | "mode">,
  plans: RupinPushbackPlan[],
  usedRanges: Array<{ start: number; end: number }>,
  annotationSuffix = "",
): boolean {
  return addPlanFromMatch(
    answerText,
    matchText,
    {
      ...rule,
      patterns: [],
      id: `${rule.id}${annotationSuffix}`,
    },
    plans,
    usedRanges,
  );
}

function findReplacementForSentence(sentence: string): string | null {
  const fallRuleId = detectFallAndReplaceRuleId(sentence);
  if (fallRuleId) {
    return ensureReplacement(sentence, fallRuleId);
  }

  for (const rule of PROBLEMATIC_SPAN_RULES) {
    if (!shouldPreferReplacement(rule.id)) continue;

    const matchesRule = rule.patterns.some((pattern) => {
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      return new RegExp(pattern.source, flags).test(sentence);
    });
    if (!matchesRule) continue;

    const replacement = suggestReplacement(sentence, rule.id);
    if (replacement) return replacement;
  }

  return null;
}

function collectSentenceScorePlans(
  answerText: string,
  plans: RupinPushbackPlan[],
  usedRanges: Array<{ start: number; end: number }>,
): void {
  const sentences = splitSentences(answerText);
  if (sentences.length < 2) return;

  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: scoreSentence(sentence),
    }))
    .filter((entry) => entry.score >= SENTENCE_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_SENTENCE_SCORE_PLANS);

  for (const entry of ranked) {
    if (plans.length >= MAX_SELF_FALLBACK_PLANS) return;

    const replacement = findReplacementForSentence(entry.sentence);
    const span = findSpanInText(answerText, entry.sentence);
    if (!span || overlapsRange(span.start, span.end, usedRanges)) continue;

    plans.push(
      planFromSpan(
        replacement ? "replace" : "redact",
        span,
        replacement
          ? "Fallback: rewrite sentence with clearer wording"
          : "Fallback: sentence scored high on problematic signals",
        `fallback-sentence-score-${entry.index}`,
        replacement ?? undefined,
      ),
    );
    usedRanges.push({ start: span.start, end: span.end });
  }
}

function collectOffTopicPlans(
  answerText: string,
  userMessage: string,
  plans: RupinPushbackPlan[],
  usedRanges: Array<{ start: number; end: number }>,
): void {
  const keywords = extractKeywords(userMessage);
  if (keywords.size === 0) return;

  const sentences = splitSentences(answerText);
  if (sentences.length < OFF_TOPIC_MIN_ANSWER_SENTENCES) return;

  const candidates = sentences.slice(-2);

  for (const [offset, sentence] of candidates.entries()) {
    if (plans.length >= MAX_SELF_FALLBACK_PLANS) return;
    if (sentence.length < OFF_TOPIC_MIN_SENTENCE_LENGTH) continue;

    const overlap = keywordOverlapRatio(sentence, keywords);
    if (overlap > OFF_TOPIC_OVERLAP_THRESHOLD) continue;
    if (!hasExplicitTangentSignal(sentence, userMessage)) continue;

    addPlanFromRule(
      answerText,
      sentence,
      {
        id: "fallback-off-topic",
        reason: "Fallback: tangent with low overlap to the user's question",
        mode: "ignore-span",
      },
      plans,
      usedRanges,
      `-tail-${offset}`,
    );
  }
}

export type RupinSelfFallbackOptions = {
  userMessage?: string;
};

/**
 * Heuristic self-revision when the model returns no valid uncertainty annotations.
 */
export function resolveRupinSelfFallbackPlans(
  answerText: string,
  options: RupinSelfFallbackOptions = {},
): RupinPushbackPlan[] {
  const text = answerText.trim();
  if (!text) return [];

  const plans: RupinPushbackPlan[] = [];
  const usedRanges: Array<{ start: number; end: number }> = [];

  collectSentenceScorePlans(text, plans, usedRanges);

  for (const rule of PROBLEMATIC_SPAN_RULES) {
    if (plans.length >= MAX_SELF_FALLBACK_PLANS) break;
    collectRuleMatches(text, rule, plans, usedRanges);
  }

  if (options.userMessage?.trim()) {
    collectUserContextConflict(
      text,
      options.userMessage,
      plans,
      usedRanges,
    );
  }

  if (options.userMessage?.trim()) {
    collectOffTopicPlans(text, options.userMessage, plans, usedRanges);
  }

  return sortPlansByDescendingSpan(plans, text).slice(0, MAX_SELF_FALLBACK_PLANS);
}

/**
 * Scan prior answer for problematic spans when user pushes back without revision annotations.
 */
export function resolveRupinPushbackContentFallbackPlan(
  prevText: string,
): RupinPushbackPlan | null {
  const plans = resolveRupinSelfFallbackPlans(prevText);
  return plans[0] ?? null;
}

/**
 * Heuristic pushback on the prior answer when the model returns no revision annotations.
 */
export function resolveRupinPushbackFallbackPlan(
  prevText: string,
  userMessage: string,
): RupinPushbackPlan | null {
  const message = userMessage.trim();
  if (!message || !prevText.trim()) return null;

  if (STRONG_REJECTION.some((pattern) => pattern.test(message))) {
    return planFromSpan(
      "ignore-full",
      { phrase: prevText.trim() },
      "Fallback: user rejected the prior answer",
      "fallback-pushback-reject",
    );
  }

  if (DISINTEREST_PATTERNS.some((pattern) => pattern.test(message))) {
    const tail = lastSentence(prevText);
    if (tail) {
      const span = findSpanInText(prevText, tail);
      if (span) {
        return planFromSpan(
          "ignore-span",
          span,
          "Fallback: user dismissed a tangent or topic",
          "fallback-pushback-disinterest",
        );
      }
    }
  }

  if (DOUBT_PATTERNS.some((pattern) => pattern.test(message))) {
    const lead = firstSentence(prevText);
    if (lead) {
      const span = findSpanInText(prevText, lead);
      if (span) {
        return planFromSpan(
          "redact",
          span,
          "Fallback: user doubted the prior claim",
          "fallback-pushback-doubt",
        );
      }
    }
  }

  return resolveRupinPushbackContentFallbackPlan(prevText);
}
