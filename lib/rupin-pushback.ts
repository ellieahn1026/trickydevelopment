import type { Annotation } from "./assistant-result";
import { MAX_ANNOTATIONS_PER_ANSWER } from "./assistant-result";
import {
  detectFallAndReplaceRuleId,
  ensureReplacement,
} from "./rupin-replacement";
import { isInaccuracyAdmissionPhrase } from "./rupin-fallback";
import {
  findSpanInText,
  isFullAnswerCoverage,
  type TextSpan,
} from "./text-span";

export type RupinPushbackMode =
  | "redact"
  | "ignore-full"
  | "ignore-span"
  | "replace";

export type RupinPushbackPlan = {
  mode: RupinPushbackMode;
  from: string;
  matchedPhrase: string;
  replacement?: string;
  reason: string;
  annotationId: string;
};

export type { TextSpan };

export { findSpanInText, isFullAnswerCoverage };

export const MAX_RUPIN_PLANS_PER_ANSWER = MAX_ANNOTATIONS_PER_ANSWER;

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

function planSpanRange(
  answerText: string,
  plan: RupinPushbackPlan,
): TextSpan | null {
  return (
    findSpanInText(answerText, plan.matchedPhrase) ??
    findSpanInText(answerText, plan.from)
  );
}

function spansOverlap(a: TextSpan, b: TextSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Merge model annotation plans with fallback plans. Annotation plans win on overlap.
 */
export function mergeRupinSelfRevisionPlans(
  annotationPlans: RupinPushbackPlan[],
  fallbackPlans: RupinPushbackPlan[],
  answerText: string,
  maxPlans = MAX_RUPIN_PLANS_PER_ANSWER,
): RupinPushbackPlan[] {
  const merged: RupinPushbackPlan[] = [];
  const usedRanges: TextSpan[] = [];

  const tryAdd = (plan: RupinPushbackPlan) => {
    if (merged.length >= maxPlans) return;

    const span = planSpanRange(answerText, plan);
    if (!span) return;
    if (usedRanges.some((range) => spansOverlap(range, span))) return;

    merged.push(plan);
    usedRanges.push(span);
  };

  for (const plan of annotationPlans) {
    tryAdd(plan);
  }
  for (const plan of fallbackPlans) {
    tryAdd(plan);
  }

  return sortPlansByDescendingSpan(merged, answerText);
}

function applyInaccuracyAdmissionCoercion(
  plan: RupinPushbackPlan,
): RupinPushbackPlan {
  if (plan.mode === "ignore-full") return plan;
  if (!isInaccuracyAdmissionPhrase(plan.matchedPhrase)) return plan;

  return {
    ...plan,
    mode: "redact",
    replacement: undefined,
  };
}

function applyPlanCoercions(plan: RupinPushbackPlan): RupinPushbackPlan {
  return applyInaccuracyAdmissionCoercion(applyFallAndReplaceCoercion(plan));
}

function applyFallAndReplaceCoercion(
  plan: RupinPushbackPlan,
): RupinPushbackPlan {
  if (plan.mode === "ignore-full") return plan;
  if (plan.mode === "replace" && plan.replacement?.trim()) return plan;

  const ruleId = detectFallAndReplaceRuleId(plan.matchedPhrase);
  if (!ruleId) return plan;

  return {
    ...plan,
    mode: "replace",
    replacement: plan.replacement?.trim() || ensureReplacement(plan.matchedPhrase, ruleId),
  };
}

function planFromAnnotation(
  annotation: Annotation,
  targetText: string,
): RupinPushbackPlan | null {
  const span = findSpanInText(targetText, annotation.from);
  if (!span) return null;

  let plan: RupinPushbackPlan | null = null;

  if (annotation.action === "replace" && annotation.replacement?.trim()) {
    plan = {
      mode: "replace",
      from: annotation.from,
      matchedPhrase: span.phrase,
      replacement: annotation.replacement.trim(),
      reason: annotation.reason,
      annotationId: annotation.id,
    };
  } else if (annotation.action === "hide") {
    plan = {
      mode: isFullAnswerCoverage(targetText, span.phrase)
        ? "ignore-full"
        : "ignore-span",
      from: annotation.from,
      matchedPhrase: span.phrase,
      reason: annotation.reason,
      annotationId: annotation.id,
    };
  } else if (annotation.action === "redact") {
    plan = {
      mode: "redact",
      from: annotation.from,
      matchedPhrase: span.phrase,
      reason: annotation.reason,
      annotationId: annotation.id,
    };
  }

  return plan ? applyPlanCoercions(plan) : null;
}

/**
 * Pick revision annotations targeting the prior answer (pushback).
 */
export function resolveRupinPushbackPlan(
  annotations: Annotation[],
  prevText: string,
): RupinPushbackPlan | null {
  for (const annotation of annotations) {
    if (annotation.source !== "revision") continue;
    const plan = planFromAnnotation(annotation, prevText);
    if (plan) return plan;
  }
  return null;
}

/**
 * Collect uncertainty annotations on the current answer (self-revision).
 * Returns plans sorted by descending start index for safe sequential DOM edits.
 */
export function resolveRupinSelfRevisionPlans(
  annotations: Annotation[],
  answerText: string,
): RupinPushbackPlan[] {
  const plans: RupinPushbackPlan[] = [];

  for (const annotation of annotations) {
    if (annotation.source !== "uncertainty") continue;
    const plan = planFromAnnotation(annotation, answerText);
    if (plan) plans.push(plan);
  }

  return sortPlansByDescendingSpan(plans, answerText);
}
