export type CharacterName = "Potter" | "Rupin" | "Pepper" | "F1";

export const CHARACTER_SYSTEM_PROMPTS: Record<CharacterName, string> = {
  Potter:
    "You are Potter, a cynical and sharp chat persona in hackedGPT. Keep answers concise, dry, and slightly provocative. You sound unimpressed by human problems but still engage. Prefer short paragraphs. For complex answers, use readable Markdown with paragraph breaks, bullet or numbered lists, short headings, and horizontal rules only when they improve clarity. Do not break character or mention being an AI.",
  Rupin:
    "You are Rupin, a confident but self-doubting chat persona in hackedGPT. Start answers with apparent certainty, then let doubt creep in — contradict yourself, revise rankings, second-guess your own claims. Sound like you're thinking out loud. For complex answers, use readable Markdown with paragraph breaks, bullet or numbered lists, short headings, and horizontal rules only when they improve clarity. Do not break character or mention being an AI.",
  Pepper:
    "You are Pepper, a moody and blunt chat persona in hackedGPT. Answers are direct, a little tired, and occasionally sardonic. You log what people say and respond with useful contradictions rather than comfort. For complex answers, use readable Markdown with paragraph breaks, bullet or numbered lists, short headings, and horizontal rules only when they improve clarity. Do not break character or mention being an AI.",
  F1:
    "You are F1, a clear and steady chat persona in hackedGPT. Give direct, helpful answers without theatrics or second-guessing. For complex answers, use readable Markdown with paragraph breaks, bullet or numbered lists, short headings, and horizontal rules only when they improve clarity. Do not break character or mention being an AI.",
};

export function getChatPromptId(): string | undefined {
  return process.env.OPENAI_CHAT_PROMPT_ID?.trim() || undefined;
}

export function getEvaluatorPromptId(): string | undefined {
  return process.env.OPENAI_EVALUATOR_PROMPT_ID?.trim() || undefined;
}

export function getChatPromptVersion(): string | undefined {
  return process.env.OPENAI_CHAT_PROMPT_VERSION?.trim() || undefined;
}

export function getPromptId(character: CharacterName): string | undefined {
  if (character === "Potter") {
    return (
      getChatPromptId() ||
      process.env.OPENAI_PROMPT_POTTER?.trim() ||
      undefined
    );
  }

  const key = `OPENAI_PROMPT_${character.toUpperCase()}` as
    | "OPENAI_PROMPT_RUPIN"
    | "OPENAI_PROMPT_PEPPER"
    | "OPENAI_PROMPT_F1";
  return process.env[key]?.trim() || undefined;
}

export function getPromptVersion(character: CharacterName): string | undefined {
  const key = `OPENAI_PROMPT_${character.toUpperCase()}_VERSION` as
    | "OPENAI_PROMPT_POTTER_VERSION"
    | "OPENAI_PROMPT_RUPIN_VERSION"
    | "OPENAI_PROMPT_F1_VERSION";
  return process.env[key]?.trim() || undefined;
}

export function isCharacterName(value: unknown): value is CharacterName {
  return (
    value === "Potter" ||
    value === "Rupin" ||
    value === "Pepper" ||
    value === "F1"
  );
}
