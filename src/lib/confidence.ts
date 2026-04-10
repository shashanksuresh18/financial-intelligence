import type {
  ConfidenceLevel,
  ConfidenceScore,
  WaterfallResult,
} from "@/lib/types";

function getLevel(score: number): ConfidenceLevel {
  if (score >= 75) {
    return "high";
  }

  if (score >= 40) {
    return "medium";
  }

  return "low";
}

export function computeConfidence(result: WaterfallResult): ConfidenceScore {
  if (
    result.secEdgar !== null &&
    result.secEdgar.data.xbrlFacts !== null
  ) {
    return {
      score: 85,
      level: getLevel(85),
      rationale: "SEC EDGAR XBRL filing data present",
    };
  }

  if (
    result.finnhub !== null ||
    result.companiesHouse !== null ||
    result.gleif !== null
  ) {
    return {
      score: 60,
      level: getLevel(60),
      rationale:
        "Market/registry data available (Finnhub/Companies House/GLEIF); no SEC XBRL",
    };
  }

  if (result.secEdgar !== null) {
    return {
      score: 40,
      level: getLevel(40),
      rationale: "SEC EDGAR company info present; no XBRL financial facts",
    };
  }

  if (result.claudeFallback !== null) {
    return {
      score: 25,
      level: getLevel(25),
      rationale: "Web search fallback only; data may be incomplete or stale",
    };
  }

  return {
    score: 10,
    level: getLevel(10),
    rationale: "No data sources returned data for this company",
  };
}
