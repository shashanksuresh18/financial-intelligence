import type {
  ConfidenceComponent,
  ConfidenceLevel,
  ConfidenceScore,
  EntityResolution,
  ValidationReport,
  WaterfallResult,
} from "@/lib/types";
import { summarizeMeaningfulInsiderFlow } from "@/lib/report-assembly";

function getLevel(score: number): ConfidenceLevel {
  if (score >= 75) {
    return "high";
  }

  if (score >= 45) {
    return "medium";
  }

  return "low";
}

function countFinnhubMetrics(result: WaterfallResult): number {
  const metrics = result.finnhub?.data.basicFinancials?.metric;

  if (metrics === undefined) {
    return 0;
  }

  return Object.values(metrics).filter(
    (value) => value !== null && value !== undefined,
  ).length;
}

function countFmpSignals(result: WaterfallResult): number {
  const fmp = result.fmp?.data;

  if (fmp === undefined) {
    return 0;
  }

  return [
    fmp.historicalMultiples.length > 0 ? 1 : 0,
    fmp.enterpriseValues.length > 0 ? 1 : 0,
    fmp.analystEstimates.length > 0 ? 1 : 0,
    fmp.priceTargetConsensus !== null ? 1 : 0,
    fmp.peers.length > 0 ? 1 : 0,
  ].reduce((total, value) => total + value, 0);
}

function countCompaniesHouseFinancialSignals(result: WaterfallResult): number {
  const profile = result.companiesHouse?.data.profile;
  const latestAccounts = profile?.accounts?.last_accounts;
  const nextAccounts = profile?.accounts?.next_accounts;
  const nextDue = profile?.accounts?.next_due;

  if (profile === undefined || profile === null) {
    return 0;
  }

  return [
    latestAccounts?.made_up_to !== undefined ? 1 : 0,
    latestAccounts?.type !== undefined ? 1 : 0,
    latestAccounts?.period_start_on !== undefined ||
    latestAccounts?.period_end_on !== undefined
      ? 1
      : 0,
    nextAccounts?.due_on !== undefined || nextDue !== undefined ? 1 : 0,
    (result.companiesHouse?.data.accountsFilings.length ?? 0) > 0 ? 1 : 0,
  ].reduce((total, value) => total + value, 0);
}

function buildIdentityComponent(
  result: WaterfallResult,
  entityResolution: EntityResolution,
): ConfidenceComponent {
  if (
    result.secEdgar !== null &&
    (result.secEdgar.data.companyInfo !== null || result.secEdgar.data.xbrlFacts !== null)
  ) {
    return {
      key: "identity",
      label: "Entity Match",
      score: 24,
      rationale: "SEC entity match present with filing-backed company identity.",
    };
  }

  if (
    entityResolution.primarySource !== null &&
    entityResolution.matchedSources.includes("companies-house") &&
    entityResolution.matchedSources.includes("gleif")
  ) {
    return {
      key: "identity",
      label: "Entity Match",
      score: 20,
      rationale: "Registry and LEI sources agree on the company identity.",
    };
  }

  if (
    entityResolution.primarySource === "finnhub" &&
    entityResolution.matchedSources.length >= 2
  ) {
    return {
      key: "identity",
      label: "Entity Match",
      score: 16,
      rationale: "Market symbol mapping is corroborated by a secondary source, but not by primary filings.",
    };
  }

  if (
    entityResolution.primarySource === "companies-house" ||
    entityResolution.primarySource === "gleif"
  ) {
    return {
      key: "identity",
      label: "Entity Match",
      score: 16,
      rationale: "Authoritative registry data confirms the legal entity.",
    };
  }

  if (result.finnhub !== null) {
    return {
      key: "identity",
      label: "Entity Match",
      score: 12,
      rationale: "Market symbol mapping is available, but registry corroboration is limited.",
    };
  }

  if (result.exaDeep !== null) {
    return {
      key: "identity",
      label: "Entity Match",
      score: 10,
      rationale:
        "Entity identified via Exa Deep Research; no primary registry or market match.",
    };
  }

  if (result.claudeFallback !== null) {
    return {
      key: "identity",
      label: "Entity Match",
      score: 5,
      rationale: "Entity identification relies on web search fallback only.",
    };
  }

  return {
    key: "identity",
    label: "Entity Match",
    score: 0,
    rationale: "No trustworthy company identifier was resolved.",
  };
}

function buildFinancialsComponent(result: WaterfallResult): ConfidenceComponent {
  if (result.secEdgar !== null && result.secEdgar.data.xbrlFacts !== null) {
    return {
      key: "financials",
      label: "Financial Depth",
      score: 35,
      rationale: "Primary filing data includes structured XBRL financial facts.",
    };
  }

  const fmpSignalCount = countFmpSignals(result);

  if (fmpSignalCount > 0) {
    const score = Math.min(20, 10 + fmpSignalCount * 2);

    return {
      key: "financials",
      label: "Financial Depth",
      score,
      rationale: `FMP contributes ${fmpSignalCount} valuation and forward-data segments, but the underwriting frame is still not filing-backed.`,
    };
  }

  const finnhubMetricCount = countFinnhubMetrics(result);

  if (finnhubMetricCount > 0) {
    const score = Math.min(18, 8 + Math.min(finnhubMetricCount, 8));

    return {
      key: "financials",
      label: "Financial Depth",
      score,
      rationale: `Market data contributes ${finnhubMetricCount} structured Finnhub metrics for the company.`,
    };
  }

  if (result.finnhub?.data.quote !== null && result.finnhub !== null) {
    return {
      key: "financials",
      label: "Financial Depth",
      score: 10,
      rationale: "Pricing data is available, but deeper financial coverage is still light.",
    };
  }

  const companiesHouseFinancialSignalCount =
    countCompaniesHouseFinancialSignals(result);

  if (companiesHouseFinancialSignalCount > 0) {
    const score = Math.min(14, 6 + companiesHouseFinancialSignalCount * 2);

    return {
      key: "financials",
      label: "Financial Depth",
      score,
      rationale: `Companies House contributes ${companiesHouseFinancialSignalCount} structured accounts/profile metadata points, but not parsed financial statements.`,
    };
  }

  if (
    result.claudeFallback !== null &&
    result.claudeFallback.data.extractedMetrics.length > 0
  ) {
    return {
      key: "financials",
      label: "Financial Depth",
      score: 10,
      rationale: "Financials come from AI-extracted web evidence rather than primary filings.",
    };
  }

  if (result.exaDeep !== null) {
    const hasRevenue = result.exaDeep.data.estimatedRevenue !== null;
    const hasCapital =
      result.exaDeep.data.fundingTotal !== null ||
      result.exaDeep.data.lastValuation !== null;
    const hasProfileDepth =
      result.exaDeep.data.keyInvestors.length > 0 ||
      result.exaDeep.data.competitors.length > 0 ||
      result.exaDeep.data.headquarters !== null;
    const score = hasRevenue && hasCapital ? 12 : hasRevenue || hasCapital ? 8 : 5;

    return {
      key: "financials",
      label: "Financial Depth",
      score: hasProfileDepth ? Math.min(14, score + 2) : score,
      rationale:
        "Private-company operating and capital data come from Exa Deep Research synthesis rather than primary filings.",
    };
  }

  return {
    key: "financials",
    label: "Financial Depth",
    score: 0,
    rationale: "No meaningful financial evidence was assembled.",
  };
}

function buildStreetComponent(result: WaterfallResult): ConfidenceComponent {
  if (result.finnhub === null && result.fmp === null) {
    return {
      key: "street",
      label: "Street Signals",
      score: 0,
      rationale: "No analyst or market signal set is available.",
    };
  }

  const hasRecommendations = (result.finnhub?.data.recommendations.length ?? 0) > 0;
  const hasPriceTarget =
    result.finnhub?.data.priceTarget !== null ||
    result.fmp?.data.priceTargetConsensus !== null;
  const hasEarnings = (result.finnhub?.data.earnings.length ?? 0) > 0;
  const meaningfulInsiderFlow = summarizeMeaningfulInsiderFlow(
    result.finnhub?.data.insiderTransactions.map((item) => ({
      name: item.name,
      shareChange: item.change,
      share: item.share,
      transactionCode: item.transactionCode,
      transactionDate: item.transactionDate,
      filingDate: item.filingDate,
      transactionPrice: item.transactionPrice,
      source: "finnhub" as const,
    })) ?? [],
  );
  const hasInsider = meaningfulInsiderFlow !== null;
  const hasForwardEstimates = (result.fmp?.data.analystEstimates.length ?? 0) > 0;
  const earningsCount = result.finnhub?.data.earnings.length ?? 0;
  const insiderCount = meaningfulInsiderFlow?.transactionCount ?? 0;

  if (
    !hasRecommendations &&
    !hasPriceTarget &&
    !hasEarnings &&
    !hasInsider &&
    !hasForwardEstimates
  ) {
    return {
      key: "street",
      label: "Street Signals",
      score: 0,
      rationale: "No Street-oriented evidence was returned.",
    };
  }

  let score = 0;

  if (hasRecommendations) {
    score += 8;
  }

  if (hasPriceTarget) {
    score += 4;
  }

  score += Math.min(6, earningsCount * 2);

  if (hasForwardEstimates) {
    score += 3;
  }

  if (insiderCount > 0) {
    score += 2;
  }

  return {
    key: "street",
    label: "Street Signals",
    score: Math.min(20, score),
    rationale:
      `Street view includes ${hasRecommendations ? "recommendation data" : "no recommendations"}, ` +
      `${earningsCount} earnings events` +
      `${hasPriceTarget ? ", target-price coverage" : ", no target-price coverage"}` +
      `${hasForwardEstimates ? ", forward analyst estimates" : ""}` +
      `${insiderCount > 0 ? `, and ${insiderCount} insider items.` : "."}`,
  };
}

function buildFreshnessComponent(result: WaterfallResult): ConfidenceComponent {
  if (result.finnhub !== null) {
    return {
      key: "freshness",
      label: "Freshness",
      score: 13,
      rationale: "Live market endpoints refreshed the quote and related signals.",
    };
  }

  if (result.fmp !== null) {
    return {
      key: "freshness",
      label: "Freshness",
      score: 9,
      rationale: "FMP valuation and estimate endpoints refreshed the report with current market context.",
    };
  }

  if (result.secEdgar !== null && result.secEdgar.data.recentFilings.length > 0) {
    return {
      key: "freshness",
      label: "Freshness",
      score: 10,
      rationale: "Recent filing records are available from SEC EDGAR.",
    };
  }

  if (result.companiesHouse !== null || result.gleif !== null) {
    return {
      key: "freshness",
      label: "Freshness",
      score: 6,
      rationale: "Registry data is current enough for entity validation, but not for market timing.",
    };
  }

  if (result.claudeFallback !== null) {
    return {
      key: "freshness",
      label: "Freshness",
      score: 4,
      rationale: "Freshness depends on web search fallback and is less reliable.",
    };
  }

  if (result.exaDeep !== null) {
    return {
      key: "freshness",
      label: "Freshness",
      score: 6,
      rationale: "Exa Deep Research returned structured, grounded results.",
    };
  }

  return {
    key: "freshness",
    label: "Freshness",
    score: 0,
    rationale: "No fresh source data was obtained.",
  };
}

export function computeConfidence(
  result: WaterfallResult,
  entityResolution: EntityResolution,
  validationReport: ValidationReport,
): ConfidenceScore {
  const components: ConfidenceComponent[] = [
    buildIdentityComponent(result, entityResolution),
    buildFinancialsComponent(result),
    buildStreetComponent(result),
    buildFreshnessComponent(result),
  ];
  const score = components.reduce((total, component) => total + component.score, 0);
  const level = getLevel(score);
  const strongestComponents = [...components]
    .sort((left, right) => right.score - left.score)
    .filter((component) => component.score > 0)
    .slice(0, 2)
    .map((component) => component.label.toLowerCase());
  const rationale =
    strongestComponents.length === 0
      ? "No reliable evidence sources returned data for this company."
      : `Confidence is driven mainly by ${strongestComponents.join(
          " and ",
        )}; see breakdown for source-specific coverage.`;

  const isAmbiguous = result.finnhub?.data.isAmbiguous ?? false;
  const hasPrimaryFilingDepth =
    result.secEdgar !== null && result.secEdgar.data.xbrlFacts !== null;
  const highGapCount = validationReport.gaps.filter((gap) => gap.severity === "high").length;
  const mediumGapCount = validationReport.gaps.filter(
    (gap) => gap.severity === "medium",
  ).length;
  const highTensionCount = validationReport.tensions.filter(
    (tension) => tension.severity === "high",
  ).length;
  const mediumTensionCount = validationReport.tensions.filter(
    (tension) => tension.severity === "medium",
  ).length;
  const privateSynthesisOnly =
    result.exaDeep !== null &&
    result.secEdgar === null &&
    result.finnhub === null &&
    result.fmp === null &&
    result.companiesHouse === null &&
    result.gleif === null;
  let finalScore = score;
  let finalLevel = level;
  let finalRationale = rationale;

  if (isAmbiguous) {
    components.push({
      key: "ambiguity-penalty",
      label: "Ambiguity Penalty",
      score: - (score / 2),
      rationale: "Multiple strong candidates exist for this company name; lowering confidence.",
    });
    finalScore = Math.floor(score / 2);
    finalLevel = getLevel(finalScore);
    finalRationale = "Entity resolution is ambiguous. " + rationale;
  }

  if (!isAmbiguous && !hasPrimaryFilingDepth) {
    const cappedScore =
      highGapCount >= 2 || mediumGapCount >= 3
        ? Math.min(finalScore, 72)
        : Math.min(finalScore, 80);

    if (cappedScore < finalScore) {
      components.push({
        key: "underwriting-depth-cap",
        label: "Underwriting Depth Cap",
        score: cappedScore - finalScore,
        rationale:
          "Structured filing depth is incomplete, so data confidence is capped below a fully underwritten public-company read.",
      });
      finalScore = cappedScore;
      finalLevel = getLevel(finalScore);
      finalRationale =
        "Entity certainty is strong, but underwriting-quality evidence is still capped by limited filing depth.";
    }
  }

  const underwritingPenalty = Math.min(
    18,
    highGapCount * 4 + mediumGapCount * 2 + mediumTensionCount * 2,
  );

  if (!isAmbiguous && underwritingPenalty > 0) {
    components.push({
      key: "underwriting-evidence-penalty",
      label: "Underwriting Evidence Penalty",
      score: -underwritingPenalty,
      rationale:
        "Open validation gaps still limit underwriting-quality confidence even though source coverage is present.",
    });
    finalScore = Math.max(0, finalScore - underwritingPenalty);
    finalLevel = getLevel(finalScore);
    finalRationale =
      "Confidence is moderated by unresolved underwriting gaps even though the entity and source stack are usable.";
  }

  if (!isAmbiguous && highTensionCount > 0) {
    components.push({
      key: "unresolved-tension-penalty",
      label: "Unresolved Tension Penalty",
      score: -8,
      rationale:
        "High-severity source tensions remain unresolved, which lowers confidence in the assembled read.",
    });
    finalScore = Math.max(0, finalScore - 8);
    finalLevel = getLevel(finalScore);
    finalRationale =
      "Confidence is reduced by unresolved evidence tensions even though source coverage is present.";
  }

  if (!isAmbiguous && privateSynthesisOnly) {
    const cappedScore = Math.min(finalScore, 58);

    if (cappedScore < finalScore) {
      components.push({
        key: "secondary-evidence-cap",
        label: "Secondary Evidence Cap",
        score: cappedScore - finalScore,
        rationale:
          "Private-company confidence is capped because the read rests mainly on secondary web synthesis rather than corroborated primary evidence.",
      });
      finalScore = cappedScore;
      finalLevel = getLevel(finalScore);
      finalRationale =
        "Confidence stays conservative because the private-company read still depends mainly on secondary evidence.";
    }
  }

  return {
    score: finalScore,
    level: finalLevel,
    rationale: finalRationale,
    components,
  };
}
