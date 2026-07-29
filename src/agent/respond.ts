const OPENAI_BASE = "https://api.openai.com/v1";

const F1_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "chat_answer",
  strict: true,
  schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description: "The complete answer shown to the user.",
      },
      mood: {
        type: "string",
        enum: ["happy", "sad", "common"],
        description: "Emotional tone of the answer.",
      },
    },
    required: ["answer", "mood"],
    additionalProperties: false,
  },
} as const;

export type F1RespondInput = {
  message: string;
  instructions: string;
  maxOutputTokens: number;
  previousResponseId?: string;
};

export type F1RespondResult = {
  text: string;
  mood: string;
  responseId: string;
};

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set. Add it to your .env file.");
  }
  return key;
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function buildRequestBody(
  input: F1RespondInput,
  stream = false,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: getModel(),
    input: input.message,
    instructions: input.instructions,
    max_output_tokens: input.maxOutputTokens,
    text: {
      format: F1_RESPONSE_FORMAT,
    },
  };

  if (stream) {
    body.stream = true;
  }

  if (input.previousResponseId) {
    body.previous_response_id = input.previousResponseId;
  }

  return body;
}

async function openaiFetchResponse(path: string, init: RequestInit = {}) {
  const response = await fetch(`${OPENAI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${body}`);
  }

  return response;
}

/**
 * OpenAI Responses API — 스트리밍.
 */
export async function generateF1ReplyStream(
  input: F1RespondInput,
): Promise<Response> {
  return openaiFetchResponse("/responses", {
    method: "POST",
    body: JSON.stringify(buildRequestBody(input, true)),
  });
}

/**
 * OpenAI Responses API — 비스트리밍.
 */
export async function generateF1Reply(
  input: F1RespondInput,
): Promise<F1RespondResult> {
  const response = await openaiFetchResponse("/responses", {
    method: "POST",
    body: JSON.stringify(buildRequestBody(input)),
  });

  const payload = (await response.json()) as {
    id?: string;
    output_text?: string;
  };

  if (!payload.id) {
    throw new Error("OpenAI returned a response without an id.");
  }

  const raw = payload.output_text?.trim() ?? "";
  let text = raw;
  let mood = "common";

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { answer?: string; mood?: string };
      text = parsed.answer ?? raw;
      mood = parsed.mood ?? mood;
    } catch {
      text = raw;
    }
  }

  return {
    text,
    mood,
    responseId: payload.id,
  };
}
