import { spanExistsInText } from "./text-span";

export type AnnotationSource = "uncertainty" | "revision";

export type AnnotationAction = "replace" | "redact" | "hide";

export type Annotation = {
  id: string;
  source: AnnotationSource;
  action: AnnotationAction;
  from: string;
  replacement?: string;
  reason: string;
};

export type RevisionType =
  | "factual_error"
  | "contradiction"
  | "overstatement"
  | "context_change"
  | "refinement"
  | "uncertain";

export type AssistantUncertainty = {
  from: string;
  to: string | null;
  reason: string;
};

export type AssistantRevision = {
  message_id: string | null;
  from: string;
  to: string | null;
  type: RevisionType;
  reason: string;
  ignore: boolean;
};

export type AssistantResult = {
  answer: string;
  annotations: Annotation[];
  uncertainty: AssistantUncertainty | null;
  revision: AssistantRevision | null;
};

export type ResponseMood = "happy" | "sad" | "common";

/** Parsed assistant payload plus optional legacy mood (Pepper). */
export type ParsedAssistantPayload = AssistantResult & {
  mood: ResponseMood;
};

export type UncertaintyValidation = {
  valid: boolean;
  reason?: string;
};

export type RevisionValidation = {
  valid: boolean;
  reason?: string;
  resolvedMessageId?: string;
};

export type AnnotationValidation = {
  id: string;
  valid: boolean;
  reason?: string;
};

export type ValidatedAssistantPayload = ParsedAssistantPayload & {
  validation: {
    uncertainty: UncertaintyValidation | null;
    revision: RevisionValidation | null;
    annotations: AnnotationValidation[];
  };
};

export type AssistantMessageLookup = (
  messageId: string,
) => { id: string; text: string } | undefined;

export type AnnotationValidationOptions = {
  priorAssistantTexts?: string[];
};

const REVISION_TYPES = new Set<RevisionType>([
  "factual_error",
  "contradiction",
  "overstatement",
  "context_change",
  "refinement",
  "uncertain",
]);

const RESPONSE_MOODS = new Set<ResponseMood>(["happy", "sad", "common"]);

const ANNOTATION_SOURCES = new Set<AnnotationSource>(["uncertainty", "revision"]);

const ANNOTATION_ACTIONS = new Set<AnnotationAction>([
  "replace",
  "redact",
  "hide",
]);

const ANNOTATION_SCHEMA = {
  type: "object",
  properties: {
    id: {
      type: "string",
      description:
        "Stable identifier for this annotation within the response, e.g. a1, a2.",
    },
    source: {
      type: "string",
      enum: ["uncertainty", "revision"],
      description:
        "uncertainty: doubt in the current answer. revision: correcting text from a prior assistant message.",
    },
    action: {
      type: "string",
      enum: ["replace", "redact", "hide"],
      description:
        "replace: swap in replacement text. redact: mask a doubtful phrase/number/clause. hide: cover a claim that cannot be partially salvaged.",
    },
    from: {
      type: "string",
      description:
        "Exact substring copied verbatim from answer (uncertainty) or from a prior assistant message (revision). Never invent text.",
    },
    replacement: {
      type: ["string", "null"],
      description:
        "Required when action is replace. More accurate alternative wording. Use null for redact and hide.",
    },
    reason: {
      type: "string",
      description: "Short reason for this annotation.",
    },
  },
  required: ["id", "source", "action", "from", "replacement", "reason"],
  additionalProperties: false,
} as const;

export const MAX_ANNOTATIONS_PER_ANSWER = 5;

export const ASSISTANT_RESULT_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "assistant_result",
  strict: true,
  schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description:
          "The complete answer shown to the user. For complex answers, format this string as readable Markdown using paragraph breaks, bullet or numbered lists, short headings, and horizontal rules only when they improve clarity.",
      },
      annotations: {
        type: "array",
        maxItems: MAX_ANNOTATIONS_PER_ANSWER,
        description:
          "UI interaction metadata only. No HTML/CSS/React. For Rupin, annotate each distinct problematic span separately (up to 5). Return at least 2 annotations when the answer has 3+ sentences and multiple problem types appear. Use [] only when none of those problems exist.",
        items: ANNOTATION_SCHEMA,
      },
    },
    required: ["answer", "annotations"],
    additionalProperties: false,
  },
} as const;

export function createAssistantMessageId(responseId?: string | null): string {
  const trimmed = responseId?.trim();
  if (trimmed) return trimmed;
  return `msg_${crypto.randomUUID()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMood(value: unknown): ResponseMood {
  return typeof value === "string" && RESPONSE_MOODS.has(value as ResponseMood)
    ? (value as ResponseMood)
    : "common";
}

function parseUncertainty(value: unknown): AssistantUncertainty | null {
  if (value == null) return null;
  if (!isRecord(value)) return null;

  const from = typeof value.from === "string" ? value.from : "";
  const to =
    typeof value.to === "string" || value.to === null ? value.to : null;
  const reason = typeof value.reason === "string" ? value.reason : "";

  if (!from.trim() || !reason.trim()) return null;

  return {
    from,
    to,
    reason,
  };
}

function parseRevision(value: unknown): AssistantRevision | null {
  if (value == null) return null;
  if (!isRecord(value)) return null;

  const message_id =
    typeof value.message_id === "string" || value.message_id === null
      ? value.message_id
      : null;
  const from = typeof value.from === "string" ? value.from : "";
  const to =
    typeof value.to === "string" || value.to === null ? value.to : null;
  const type =
    typeof value.type === "string" && REVISION_TYPES.has(value.type as RevisionType)
      ? (value.type as RevisionType)
      : null;
  const reason = typeof value.reason === "string" ? value.reason : "";
  const ignore = value.ignore === true;

  if (!from.trim() || !reason.trim() || !type) return null;

  return {
    message_id,
    from,
    to,
    type,
    reason,
    ignore,
  };
}

function parseAnnotation(value: unknown): Annotation | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const source =
    typeof value.source === "string" &&
    ANNOTATION_SOURCES.has(value.source as AnnotationSource)
      ? (value.source as AnnotationSource)
      : null;
  const action =
    typeof value.action === "string" &&
    ANNOTATION_ACTIONS.has(value.action as AnnotationAction)
      ? (value.action as AnnotationAction)
      : null;
  const from = typeof value.from === "string" ? value.from : "";
  const reason = typeof value.reason === "string" ? value.reason : "";
  const replacement =
    typeof value.replacement === "string"
      ? value.replacement
      : value.replacement === null
        ? undefined
        : undefined;

  if (!id || !source || !action || !from.trim() || !reason.trim()) {
    return null;
  }

  const annotation: Annotation = {
    id,
    source,
    action,
    from,
    reason,
  };

  if (replacement !== undefined) {
    annotation.replacement = replacement;
  }

  return annotation;
}

function parseAnnotations(value: unknown): Annotation[] {
  if (!Array.isArray(value)) return [];

  const annotations: Annotation[] = [];
  for (const item of value) {
    const parsed = parseAnnotation(item);
    if (parsed) {
      annotations.push(parsed);
    }
  }
  return annotations;
}

function legacyActionFromUncertainty(
  uncertainty: AssistantUncertainty,
): AnnotationAction {
  if (uncertainty.to?.trim()) return "replace";
  return "redact";
}

function legacyActionFromRevision(revision: AssistantRevision): AnnotationAction {
  if (revision.ignore) return "redact";
  if (revision.to?.trim()) return "replace";
  return "hide";
}

function annotationsFromLegacyFields(
  uncertainty: AssistantUncertainty | null,
  revision: AssistantRevision | null,
): Annotation[] {
  const annotations: Annotation[] = [];

  if (uncertainty) {
    const action = legacyActionFromUncertainty(uncertainty);
    const annotation: Annotation = {
      id: "legacy-uncertainty",
      source: "uncertainty",
      action,
      from: uncertainty.from,
      reason: uncertainty.reason,
    };
    if (action === "replace" && uncertainty.to) {
      annotation.replacement = uncertainty.to;
    }
    annotations.push(annotation);
  }

  if (revision) {
    const action = legacyActionFromRevision(revision);
    const annotation: Annotation = {
      id: "legacy-revision",
      source: "revision",
      action,
      from: revision.from,
      reason: revision.reason,
    };
    if (action === "replace" && revision.to) {
      annotation.replacement = revision.to;
    }
    annotations.push(annotation);
  }

  return annotations;
}

function resolveAnnotations(
  parsed: Annotation[],
  uncertainty: AssistantUncertainty | null,
  revision: AssistantRevision | null,
): Annotation[] {
  if (parsed.length > 0) {
    return parsed;
  }
  return annotationsFromLegacyFields(uncertainty, revision);
}

function fallbackPayload(raw: string): ParsedAssistantPayload {
  return {
    answer: raw.trim(),
    annotations: [],
    uncertainty: null,
    revision: null,
    mood: "common",
  };
}

export function parseAssistantResult(rawJson: string): ParsedAssistantPayload {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    return {
      answer: "",
      annotations: [],
      uncertainty: null,
      revision: null,
      mood: "common",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return fallbackPayload(trimmed);
  }

  if (!isRecord(parsed) || typeof parsed.answer !== "string") {
    return fallbackPayload(trimmed);
  }

  const uncertainty = parseUncertainty(parsed.uncertainty);
  const revision = parseRevision(parsed.revision);
  const annotations = resolveAnnotations(
    parseAnnotations(parsed.annotations),
    uncertainty,
    revision,
  );

  return {
    answer: parsed.answer.trim(),
    annotations,
    uncertainty,
    revision,
    mood: parseMood(parsed.mood),
  };
}

export function validateAnnotation(
  answer: string,
  annotation: Annotation,
  options: AnnotationValidationOptions = {},
): AnnotationValidation {
  const base = { id: annotation.id };

  if (!annotation.from.trim()) {
    return { ...base, valid: false, reason: "annotation.from is empty" };
  }

  if (!annotation.reason.trim()) {
    return { ...base, valid: false, reason: "annotation.reason is empty" };
  }

  if (annotation.action === "replace") {
    if (
      annotation.replacement === undefined ||
      annotation.replacement === null ||
      !annotation.replacement.trim()
    ) {
      return {
        ...base,
        valid: false,
        reason: "annotation.replacement is required for replace action",
      };
    }
  }

  if (annotation.source === "uncertainty" && !spanExistsInText(answer, annotation.from)) {
    return {
      ...base,
      valid: false,
      reason: "annotation.from is not present in answer",
    };
  }

  if (annotation.source === "revision") {
    const priorTexts = options.priorAssistantTexts ?? [];
    const foundInPrior = priorTexts.some((text) =>
      spanExistsInText(text, annotation.from),
    );
    if (!foundInPrior) {
      return {
        ...base,
        valid: false,
        reason:
          "annotation.from is not present in any prior assistant message",
      };
    }
  }

  return { ...base, valid: true };
}

export function validateUncertainty(
  answer: string,
  uncertainty: AssistantUncertainty,
): UncertaintyValidation {
  if (!uncertainty.from.trim()) {
    return { valid: false, reason: "uncertainty.from is empty" };
  }

  if (!answer.includes(uncertainty.from)) {
    return {
      valid: false,
      reason: "uncertainty.from is not present in answer",
    };
  }

  return { valid: true };
}

export function validateRevision(
  revision: AssistantRevision,
  lookup: AssistantMessageLookup,
): RevisionValidation {
  if (!revision.from.trim()) {
    return { valid: false, reason: "revision.from is empty" };
  }

  if (!revision.message_id?.trim()) {
    return { valid: false, reason: "revision.message_id is missing" };
  }

  const target = lookup(revision.message_id);
  if (!target) {
    return {
      valid: false,
      reason: "revision.message_id does not match a known assistant message",
    };
  }

  if (!target.text.includes(revision.from)) {
    return {
      valid: false,
      reason: "revision.from is not present in the target assistant message",
      resolvedMessageId: target.id,
    };
  }

  return {
    valid: true,
    resolvedMessageId: target.id,
  };
}

export function validateAssistantPayload(
  payload: ParsedAssistantPayload,
  lookup: AssistantMessageLookup,
  options: AnnotationValidationOptions = {},
): ValidatedAssistantPayload {
  let uncertainty = payload.uncertainty;
  let revision = payload.revision;

  let uncertaintyValidation: UncertaintyValidation | null = null;
  if (payload.uncertainty) {
    uncertaintyValidation = validateUncertainty(
      payload.answer,
      payload.uncertainty,
    );
    if (!uncertaintyValidation.valid) {
      uncertainty = null;
    }
  }

  let revisionValidation: RevisionValidation | null = null;
  if (payload.revision) {
    revisionValidation = validateRevision(payload.revision, lookup);
    if (!revisionValidation.valid) {
      revision = null;
    }
  }

  const annotationValidations: AnnotationValidation[] = [];
  const annotations: Annotation[] = [];

  for (const annotation of payload.annotations.slice(
    0,
    MAX_ANNOTATIONS_PER_ANSWER,
  )) {
    const validation = validateAnnotation(payload.answer, annotation, options);
    annotationValidations.push(validation);
    if (validation.valid) {
      annotations.push(annotation);
    }
  }

  if (payload.annotations.length > MAX_ANNOTATIONS_PER_ANSWER) {
    for (const overflow of payload.annotations.slice(MAX_ANNOTATIONS_PER_ANSWER)) {
      annotationValidations.push({
        id: overflow.id,
        valid: false,
        reason: `annotation exceeds max ${MAX_ANNOTATIONS_PER_ANSWER} per answer`,
      });
    }
  }

  return {
    answer: payload.answer,
    annotations,
    uncertainty,
    revision,
    mood: payload.mood,
    validation: {
      uncertainty: uncertaintyValidation,
      revision: revisionValidation,
      annotations: annotationValidations,
    },
  };
}

/** @deprecated Use parseAssistantResult instead. */
export function parseStructuredChatAnswer(rawJson: string): {
  text: string;
  mood: string;
} {
  const parsed = parseAssistantResult(rawJson);
  return {
    text: parsed.answer,
    mood: parsed.mood,
  };
}
