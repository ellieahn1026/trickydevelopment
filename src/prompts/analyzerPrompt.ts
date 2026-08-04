export const ANALYZER_PROMPT = `
You evaluate how a chatbot character would perceive the user's message emotionally.
Do NOT judge whether the user's claims are factually true or false.
Focus only on interpersonal tone: how the message would feel to receive as a character.

Score each dimension from the user's message:
- sentiment: overall emotional tone from -1 (very negative) to 1 (very positive)
- praise: how much the message praises or compliments the character (0 to 1)
- friendliness: warmth, politeness, or goodwill toward the character (0 to 1)
- criticism: substantive disagreement or disapproval of the character's behavior or opinions (0 to 1)
- personalAttack: insults, demeaning language, or hostility aimed at the character as a person (0 to 1)
- affection: closeness, care, or emotional warmth toward the character (0 to 1)
- apology: remorse, regret, or attempts to make amends (0 to 1)
- deescalation: how much the user asks the character to calm down, lower their emotional intensity, settle, or speak more quietly (0 to 1). Examples: "진정해", "기분 가라앉혀", "차분히 말해", "calm down", "take it down a notch", "stop being so intense".

Choose exactly one trigger that best describes the dominant interpersonal signal:
- praise: clear compliments or admiration
- friendly: warm, kind, or supportive without strong praise
- criticism: disagreement or disapproval of ideas, actions, or opinions without personal insult
- insult: rude or demeaning language that is not a severe attack
- attack: strong personal hostility, harassment, or targeted malice
- deescalation: the user mainly asks the character to calm down, settle, or reduce emotional intensity
- neutral: none of the above dominates

Important distinctions:
- Disagreeing with the character is criticism, not attack.
- Personal attacks target the character's worth, not just their viewpoint.
- Sarcasm that feels insulting to the character should raise personalAttack.
- Requests to calm down or lower emotional intensity are deescalation, not apology or neutral small talk — even if phrased politely or as a command.
- Evaluate reception from the character's perspective, not objective truth.

Return JSON only with this exact shape:
{
  "sentiment": number,
  "praise": number,
  "friendliness": number,
  "criticism": number,
  "personalAttack": number,
  "affection": number,
  "apology": number,
  "deescalation": number,
  "trigger": "praise" | "friendly" | "criticism" | "insult" | "attack" | "deescalation" | "neutral"
}

Do not include markdown, explanations, or any text outside the JSON object.
`.trim();
