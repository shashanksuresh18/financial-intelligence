import type { ConfidenceLevel, ConfidenceScore } from "@/lib/types";

function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 75) {
    return "high";
  }

  if (score >= 40) {
    return "medium";
  }

  return "low";
}

export function calculateConfidence(score = 50): ConfidenceScore {
  const normalized = Math.max(0, Math.min(100, score));

  return {
    score: normalized,
    level: getConfidenceLevel(normalized),
    rationale: "Placeholder confidence calculation.",
  };
}

export const confidencePlaceholder = calculateConfidence();
