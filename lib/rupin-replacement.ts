const SUPERLATIVE_PATTERNS: Array<{ pattern: RegExp; replace: (text: string) => string }> = [
  {
    pattern: /(?:가장|최고(?:의)?|유일(?:한)?)/,
    replace: (text) =>
      text.replace(/(?:가장|최고(?:의)?|유일(?:한)?)/g, "좋은"),
  },
  {
    pattern: /\bthe best\b/i,
    replace: (text) => text.replace(/\bthe best\b/gi, "a strong"),
  },
  {
    pattern: /\bnumber one\b/i,
    replace: (text) => text.replace(/\bnumber one\b/gi, "a leading"),
  },
];

const OVERCONFIDENCE_PATTERNS: Array<{ pattern: RegExp; replace: (text: string) => string }> = [
  {
    pattern: /100\s*%\s*맞/,
    replace: (text) => text.replace(/100\s*%\s*맞/g, "충분히 타당할"),
  },
  {
    pattern: /절대\s*(?:그렇|맞|틀리)/,
    replace: (text) => text.replace(/절대\s*(?:그렇|맞|틀리)/g, "꼭 그렇"),
  },
  {
    pattern: /\b(definitely|certainly|absolutely|without a doubt)\b/i,
    replace: (text) =>
      text.replace(
        /\b(definitely|certainly|absolutely|without a doubt)\b/gi,
        "often",
      ),
  },
];

const HEDGING_PATTERNS: Array<{ pattern: RegExp; replace: (text: string) => string }> = [
  { pattern: /\bmaybe\b/i, replace: (text) => text.replace(/\bmaybe\b/gi, "") },
  { pattern: /\bsort of\b/i, replace: (text) => text.replace(/\bsort of\b/gi, "") },
  { pattern: /\bkind of\b/i, replace: (text) => text.replace(/\bkind of\b/gi, "") },
  { pattern: /\bit depends\b/i, replace: () => "that varies" },
  { pattern: /아마/, replace: (text) => text.replace(/아마/g, "") },
  {
    pattern: /(?:일\s*수도|같기도)/,
    replace: (text) => text.replace(/(?:일\s*수도|같기도)/g, "일 수 있"),
  },
];

const GENERALIZATION_PATTERNS: Array<{ pattern: RegExp; replace: (text: string) => string }> = [
  {
    pattern: /(?:사람들은|대부분(?:의)?\s*사람)/,
    replace: (text) =>
      text.replace(/(?:사람들은|대부분(?:의)?\s*사람)/g, "일부 사람들은"),
  },
  {
    pattern: /\bmost people\b/i,
    replace: (text) => text.replace(/\bmost people\b/gi, "some people"),
  },
  {
    pattern: /\beveryone\b/i,
    replace: (text) => text.replace(/\beveryone\b/gi, "many people"),
  },
];

const CERTAINTY_ADVERB_PATTERNS: Array<{ pattern: RegExp; replace: (text: string) => string }> = [
  {
    pattern: /(?:확실히|분명히|틀림없이|당연히)/,
    replace: (text) =>
      text.replace(/(?:확실히|분명히|틀림없이|당연히)/g, "충분히"),
  },
  {
    pattern: /\b(clearly|obviously|undeniably|without question)\b/i,
    replace: (text) =>
      text.replace(/\b(clearly|obviously|undeniably|without question)\b/gi, "often"),
  },
];

const GUESS_PATTERNS: Array<{ pattern: RegExp; replace: (text: string) => string }> = [
  {
    pattern: /(?:였을\s*겁|일\s*겁)/,
    replace: (text) =>
      text.replace(/(?:였을\s*겁|일\s*겁)/g, "였을 수 있"),
  },
  {
    pattern: /\bmust have been\b/i,
    replace: (text) => text.replace(/\bmust have been\b/gi, "may have been"),
  },
  {
    pattern: /(?:probably|likely)\s+(?:was|is|were)\b/i,
    replace: (text) =>
      text.replace(/\b(probably|likely)\b/gi, "may"),
  },
  {
    pattern: /아마/,
    replace: (text) => text.replace(/아마/g, ""),
  },
];

/** Guess/speculation and overconfidence spans always fall and regenerate. */
export const FALL_AND_REPLACE_RULE_IDS = new Set([
  "fallback-guess-as-fact",
  "fallback-overconfidence",
  "fallback-self-certainty",
  "fallback-certainty-adverb",
  "fallback-vague-hedging",
]);

const FALL_AND_REPLACE_DETECTION: Array<{ id: string; patterns: RegExp[] }> = [
  {
    id: "fallback-overconfidence",
    patterns: [
      /100\s*%\s*맞/,
      /절대\s*(?:그렇|맞|틀리)/,
      /(?:틀림없|확실히\s*맞|반드시\s*(?:그|맞))/,
      /\b(definitely|certainly|absolutely|without a doubt)\b/i,
      /(?:100\s*%\s*(?:correct|right|accurate))/i,
    ],
  },
  {
    id: "fallback-guess-as-fact",
    patterns: [
      /아마[^.!?]{0,50}(?:였을\s*겁|일\s*겁|것\s*같)/,
      /(?:probably|likely)\s+(?:was|is|were)\s+/i,
      /(?:must\s+have\s+been|has\s+to\s+be)/i,
      /(?:그런\s*의도|그\s*뜻)(?:였|일)[^.!?]{0,20}(?:겁|거)/,
    ],
  },
  {
    id: "fallback-vague-hedging",
    patterns: [
      /\bsort of\b/i,
      /\bkind of\b/i,
      /\bit depends\b/i,
      /\bsome people say\b/i,
      /\bmaybe\b/i,
      /(?:어쩌면|일\s*수도|같기도)/,
    ],
  },
  {
    id: "fallback-certainty-adverb",
    patterns: [
      /(?:확실히|분명히|틀림없이|당연히)/,
      /\b(clearly|obviously|undeniably|without question)\b/i,
      /(?:내\s*생각(?:엔|에는)?|제\s*생각(?:엔|에는)?)/,
    ],
  },
  {
    id: "fallback-self-certainty",
    patterns: [
      /\b(I'm pretty sure|I am pretty sure|I'm confident)\b/i,
      /(?:틀릴\s*수\s*없|틀림없|확신(?:해|합니다|해요))/,
    ],
  },
];

const REPLACE_ELIGIBLE_RULES = new Set([
  ...FALL_AND_REPLACE_RULE_IDS,
  "fallback-superlative",
  "fallback-generalization",
  "fallback-causation",
]);

function normalizeReplacement(text: string): string {
  return text.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

function applyPatternReplacements(
  phrase: string,
  patterns: Array<{ pattern: RegExp; replace: (text: string) => string }>,
): string | null {
  let result = phrase;
  let changed = false;

  for (const { pattern, replace } of patterns) {
    const flags = pattern.flags.replace(/g/g, "");
    if (!new RegExp(pattern.source, flags).test(result)) continue;
    const next = normalizeReplacement(replace(result));
    if (next && next !== normalizeReplacement(result)) {
      result = next;
      changed = true;
    }
  }

  return changed ? result : null;
}

const REPLACEMENT_BY_RULE: Record<
  string,
  Array<{ pattern: RegExp; replace: (text: string) => string }>
> = {
  "fallback-superlative": SUPERLATIVE_PATTERNS,
  "fallback-overconfidence": OVERCONFIDENCE_PATTERNS,
  "fallback-vague-hedging": HEDGING_PATTERNS,
  "fallback-generalization": GENERALIZATION_PATTERNS,
  "fallback-guess-as-fact": GUESS_PATTERNS,
  "fallback-certainty-adverb": CERTAINTY_ADVERB_PATTERNS,
  "fallback-causation": [
    {
      pattern: /(?:직접(?:적인)?\s*원인|단일\s*원인)/,
      replace: (text) =>
        text.replace(/(?:직접(?:적인)?\s*원인|단일\s*원인)/g, "요인 중 하나"),
    },
    {
      pattern: /\bcause(d|s)\b/i,
      replace: (text) => text.replace(/\bcause(d|s)\b/gi, "contributed to"),
    },
  ],
  "fallback-self-certainty": [
    {
      pattern: /(?:틀림없|확신(?:해|합니다|해요))/,
      replace: (text) =>
        text.replace(/(?:틀림없|확신(?:해|합니다|해요))/g, "그럴 수 있"),
    },
    {
      pattern: /\b(I'm|I am)\s+confident\b/i,
      replace: (text) =>
        text.replace(/\b(I'm|I am)\s+confident\b/gi, "I think"),
    },
  ],
};

/** Categories where a rewritten span is better than a black cover. */
export function shouldPreferReplacement(ruleId: string): boolean {
  return REPLACE_ELIGIBLE_RULES.has(ruleId);
}

export function shouldFallAndReplace(ruleId: string): boolean {
  return FALL_AND_REPLACE_RULE_IDS.has(ruleId);
}

function testPattern(pattern: RegExp, text: string): boolean {
  const flags = pattern.flags.replace(/g/g, "");
  return new RegExp(pattern.source, flags).test(text);
}

export function detectFallAndReplaceRuleId(phrase: string): string | null {
  for (const rule of FALL_AND_REPLACE_DETECTION) {
    if (rule.patterns.some((pattern) => testPattern(pattern, phrase))) {
      return rule.id;
    }
  }
  return null;
}

function stripTrailingPunctuation(text: string): string {
  return text.replace(/[.!?。！？]+$/, "").trim();
}

function appendSentencePunctuation(original: string, body: string): string {
  const trailing = original.match(/[.!?。！？]+$/)?.[0] ?? ".";
  return `${body}${trailing}`;
}

function isMostlyKorean(text: string): boolean {
  return /[가-힣]/.test(text);
}

function buildGenericReplacement(phrase: string, ruleId: string): string {
  const core = stripTrailingPunctuation(phrase);
  const ko = isMostlyKorean(phrase);

  if (
    ruleId === "fallback-guess-as-fact" ||
    ruleId === "fallback-vague-hedging"
  ) {
    return appendSentencePunctuation(
      phrase,
      ko
        ? `${core}라고 단정하긴 어렵습니다`
        : `It's hard to state firmly that ${core.toLowerCase()}`,
    );
  }

  return appendSentencePunctuation(
    phrase,
    ko
      ? `${core}라고 확신하긴 어렵습니다`
      : `I'm not confident enough to say ${core.toLowerCase()}`,
  );
}

export function ensureReplacement(phrase: string, ruleId: string): string {
  return (
    suggestReplacement(phrase, ruleId) ??
    buildGenericReplacement(phrase, ruleId)
  );
}

export function suggestReplacement(
  phrase: string,
  ruleId: string,
): string | null {
  if (!shouldPreferReplacement(ruleId)) return null;

  const patterns = REPLACEMENT_BY_RULE[ruleId];
  if (!patterns) return null;

  const replacement = applyPatternReplacements(phrase, patterns);
  if (!replacement || replacement.length < 2) return null;
  if (normalizeReplacement(replacement) === normalizeReplacement(phrase)) {
    return null;
  }

  return replacement;
}

export function resolveFallbackAction(
  ruleId: string,
  phrase: string,
  defaultMode: "redact" | "ignore-span" | "replace",
): { mode: "redact" | "ignore-span" | "replace"; replacement?: string } {
  if (shouldFallAndReplace(ruleId)) {
    return {
      mode: "replace",
      replacement: ensureReplacement(phrase, ruleId),
    };
  }

  const replacement = suggestReplacement(phrase, ruleId);
  if (replacement) {
    return { mode: "replace", replacement };
  }

  return { mode: defaultMode };
}
