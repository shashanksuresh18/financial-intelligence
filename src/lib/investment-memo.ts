import type {
  AnalysisReport,
  CoverageGap,
  CoverageProfile,
  DataSource,
  EarningsHighlight,
  EntityResolution,
  EvidenceSignal,
  FinancialMetric,
  InvestmentMemo,
  InvestmentRecommendation,
  InvestmentRisk,
  InvestmentRiskCategory,
  NewsHighlight,
  RecommendationGapLoad,
  RecommendationLogic,
  RecommendationLogicStrength,
  ResearchNoteSection,
  SectionAuditItem,
  StreetView,
  ValuationView,
} from "@/lib/types";

type InvestmentMemoInput = {
  readonly company: string;
  readonly entityResolution: EntityResolution;
  readonly confidence: AnalysisReport["confidence"];
  readonly metrics: readonly FinancialMetric[];
  readonly streetView: StreetView | null;
  readonly valuationView: ValuationView | null;
  readonly earningsHighlights: readonly EarningsHighlight[];
  readonly newsHighlights?: readonly NewsHighlight[];
  readonly evidenceSignals: readonly EvidenceSignal[];
  readonly coverageGaps: readonly CoverageGap[];
  readonly disagreementNotes: AnalysisReport["disagreementNotes"];
  readonly sectionAudit: readonly SectionAuditItem[];
  readonly sections?: readonly ResearchNoteSection[];
  readonly narrative?: string;
  readonly sources: readonly DataSource[];
};

const RECOMMENDATION_LABELS: Record<InvestmentRecommendation, string> = {
  buy: "Buy",
  watch: "Watch",
  hold: "Hold",
  avoid: "Avoid",
};

function findMetric(metrics: readonly FinancialMetric[], label: string): FinancialMetric | null {
  return metrics.find((metric) => metric.label === label) ?? null;
}

function findMetricNumber(metrics: readonly FinancialMetric[], label: string): number | null {
  const metric = findMetric(metrics, label);
  return metric !== null && typeof metric.value === "number" ? metric.value : null;
}

function findMetricText(metrics: readonly FinancialMetric[], label: string): string | null {
  const metric = findMetric(metrics, label);
  return metric !== null && typeof metric.value === "string" ? metric.value : null;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatCurrency(value: number | null, maximumFractionDigits = 2): string {
  if (value === null) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

function formatMultiple(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}x`;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return "";
  }

  const periodIndex = trimmed.indexOf(".");
  return periodIndex >= 0 ? trimmed.slice(0, periodIndex + 1).trim() : trimmed;
}

function stripSourceTags(text: string): string {
  return text.replace(/\s*\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
}

function firstSentences(text: string, count: number): string {
  const normalized = stripSourceTags(text);

  if (normalized.length === 0) {
    return "";
  }

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, count)
    .join(" ");
}

function getSectionStatus(
  sectionAudit: readonly SectionAuditItem[],
  section: SectionAuditItem["section"],
): SectionAuditItem["status"] {
  return sectionAudit.find((item) => item.section === section)?.status ?? "limited";
}

function getSectionBody(
  sections: readonly ResearchNoteSection[] | undefined,
  title: ResearchNoteSection["title"],
): string {
  return sections?.find((section) => section.title === title)?.body.trim() ?? "";
}

function getCoverageProfile(input: InvestmentMemoInput): CoverageProfile {
  const entityStatus = getSectionStatus(input.sectionAudit, "Entity Resolution");
  const hasFinnhub = input.sources.includes("finnhub");
  const hasFmp = input.sources.includes("fmp");
  const hasCompaniesHouse = input.sources.includes("companies-house");
  const hasClaudeFallback = input.sources.includes("claude-fallback");
  const hasStreet =
    input.streetView?.latest !== null ||
    input.streetView?.priceTarget !== null ||
    input.earningsHighlights.length > 0;
  const hasForward = (input.valuationView?.forwardEstimates.length ?? 0) > 0;
  const hasValuationMetrics =
    input.valuationView?.metrics.some(
      (item) =>
        item.current !== null ||
        item.forward !== null ||
        item.historicalLow !== null ||
        item.historicalHigh !== null,
    ) ?? false;

  if (entityStatus === "limited") {
    return "Ambiguous entity";
  }

  if ((hasFinnhub || hasFmp) && hasStreet && hasValuationMetrics && hasForward) {
    return "Strong public coverage";
  }

  if (hasCompaniesHouse && !hasFinnhub && !hasFmp) {
    return hasClaudeFallback ? "Registry-led private coverage" : "Limited evidence";
  }

  if (hasFinnhub || hasFmp || hasClaudeFallback) {
    return "Mixed public coverage";
  }

  return "Limited evidence";
}

function classifyLogic(
  input: InvestmentMemoInput,
  coverageProfile: CoverageProfile,
): Omit<RecommendationLogic, "supportingReasons" | "confidenceLimitingReasons"> {
  const entityStatus = getSectionStatus(input.sectionAudit, "Entity Resolution");
  const financialStatus = getSectionStatus(input.sectionAudit, "Financial Analysis");
  const valuationStatus = getSectionStatus(input.sectionAudit, "Valuation");
  const streetStatus = getSectionStatus(input.sectionAudit, "Street Consensus");
  const freshnessScore =
    input.confidence.components.find((component) => component.key === "freshness")?.score ?? 0;
  const highGapCount = input.coverageGaps.filter((gap) => gap.severity === "high").length;
  const mediumGapCount = input.coverageGaps.filter((gap) => gap.severity === "medium").length;
  const metricCount = input.metrics.length;

  const entityCertainty: RecommendationLogic["entityCertainty"] =
    entityStatus === "supported" ? "strong" : entityStatus === "partial" ? "mixed" : "weak";

  let financialDepth: RecommendationLogic["financialDepth"];
  if (financialStatus === "supported" && (metricCount >= 12 || input.sources.includes("sec-edgar"))) {
    financialDepth = "strong";
  } else if (financialStatus !== "limited" || metricCount >= 6) {
    financialDepth = "adequate";
  } else {
    financialDepth = "thin";
  }

  const valuationSupport: RecommendationLogicStrength =
    valuationStatus === "supported" ? "strong" : valuationStatus === "partial" ? "mixed" : "weak";
  const streetSignals: RecommendationLogicStrength =
    streetStatus === "supported" ? "strong" : streetStatus === "partial" ? "mixed" : "weak";
  const freshness: RecommendationLogic["freshness"] =
    freshnessScore >= 12 ? "fresh" : freshnessScore >= 8 ? "reasonable" : "stale";

  let dataGaps: RecommendationGapLoad = "contained";
  if (highGapCount >= 1 || mediumGapCount >= 3) {
    dataGaps = highGapCount >= 2 || mediumGapCount >= 4 ? "heavy" : "meaningful";
  }

  if (
    coverageProfile === "Registry-led private coverage" &&
    input.coverageGaps.length >= 4 &&
    dataGaps === "contained"
  ) {
    dataGaps = "meaningful";
  }

  return {
    entityCertainty,
    financialDepth,
    valuationSupport,
    streetSignals,
    freshness,
    dataGaps,
    tensions: input.disagreementNotes.length > 0 ? "present" : "clear",
  };
}

function buildSupportingReasons(
  input: InvestmentMemoInput,
  logic: Omit<RecommendationLogic, "supportingReasons" | "confidenceLimitingReasons">,
): readonly string[] {
  const reasons: string[] = [];
  const upsidePercent = input.streetView?.priceTarget?.upsidePercent ?? null;
  const revenueGrowth = findMetricNumber(input.metrics, "Revenue Growth");
  const latestSurprise = input.earningsHighlights[0]?.surprisePercent ?? null;
  const positiveSignals = input.evidenceSignals.filter((signal) => signal.tone === "positive");

  if (logic.entityCertainty === "strong") {
    reasons.push("Entity resolution is strong enough to support a house view.");
  }

  if (logic.financialDepth === "strong") {
    reasons.push("Financial depth is strong enough to support an operating read rather than a headline-only view.");
  } else if (logic.financialDepth === "adequate") {
    reasons.push("Financial depth is sufficient for a first-pass investment read.");
  }

  if (logic.valuationSupport === "strong" && upsidePercent !== null) {
    reasons.push(`Valuation support is present, with ${formatSignedPercent(upsidePercent)} implied upside on the current evidence set.`);
  } else if (logic.valuationSupport === "mixed") {
    reasons.push("Valuation evidence is usable, even if not yet complete.");
  }

  if (logic.streetSignals === "strong") {
    reasons.push("Street positioning and earnings context are active enough to benchmark the house view.");
  }

  if (revenueGrowth !== null && revenueGrowth > 0) {
    reasons.push(`Operating momentum is positive, with revenue growth at ${formatSignedPercent(revenueGrowth)}.`);
  }

  if (latestSurprise !== null && latestSurprise > 0) {
    reasons.push(`Recent earnings delivery has been supportive, with the latest surprise at ${formatSignedPercent(latestSurprise)}.`);
  }

  positiveSignals
    .slice(0, 2)
    .forEach((signal) => reasons.push(firstSentence(stripSourceTags(signal.detail))));

  return [...new Set(reasons)].slice(0, 4);
}

function buildConfidenceLimitingReasons(
  input: InvestmentMemoInput,
  logic: Omit<RecommendationLogic, "supportingReasons" | "confidenceLimitingReasons">,
): readonly string[] {
  const reasons: string[] = [];

  if (logic.entityCertainty !== "strong") {
    reasons.push("Entity certainty is not fully locked down.");
  }
  if (logic.financialDepth === "thin") {
    reasons.push("Financial depth is still thin.");
  }
  if (logic.valuationSupport === "weak") {
    reasons.push("Valuation support is too weak to defend a stronger view.");
  }
  if (logic.streetSignals === "weak") {
    reasons.push("Street coverage is limited or absent.");
  }
  if (logic.dataGaps !== "contained") {
    reasons.push(
      logic.dataGaps === "heavy"
        ? "Data gaps are heavy enough to materially cap conviction."
        : "Data gaps remain meaningful and keep the recommendation conservative.",
    );
  }
  if (logic.tensions === "present") {
    reasons.push("Evidence tensions are present.");
  }

  input.coverageGaps
    .slice(0, 2)
    .forEach((gap) => reasons.push(firstSentence(stripSourceTags(gap.detail))));

  return [...new Set(reasons)].slice(0, 4);
}

function deriveRecommendation(
  input: InvestmentMemoInput,
  coverageProfile: CoverageProfile,
  logic: Omit<RecommendationLogic, "supportingReasons" | "confidenceLimitingReasons">,
): InvestmentRecommendation {
  const upsidePercent = input.streetView?.priceTarget?.upsidePercent ?? null;
  const revenueGrowth = findMetricNumber(input.metrics, "Revenue Growth");
  const latestSurprise = input.earningsHighlights[0]?.surprisePercent ?? null;
  const positiveSignals = input.evidenceSignals.filter((signal) => signal.tone === "positive").length;
  const negativeSignals = input.evidenceSignals.filter((signal) => signal.tone === "negative").length;

  let score = 0;
  score += logic.entityCertainty === "strong" ? 2 : logic.entityCertainty === "mixed" ? 0 : -4;
  score += logic.financialDepth === "strong" ? 2 : logic.financialDepth === "adequate" ? 1 : -2;
  score += logic.valuationSupport === "strong" ? 2 : logic.valuationSupport === "mixed" ? 0 : -1;
  score += logic.streetSignals === "strong" ? 1 : logic.streetSignals === "mixed" ? 0 : -1;
  score += logic.freshness === "fresh" ? 1 : logic.freshness === "stale" ? -1 : 0;
  score += logic.dataGaps === "contained" ? 1 : logic.dataGaps === "heavy" ? -2 : -1;
  score += logic.tensions === "clear" ? 0 : -1;

  if (input.confidence.score >= 80) {
    score += 2;
  } else if (input.confidence.score >= 65) {
    score += 1;
  } else if (input.confidence.score < 35) {
    score -= 2;
  } else if (input.confidence.score < 50) {
    score -= 1;
  }

  score += Math.min(positiveSignals, 2);
  score -= Math.min(negativeSignals, 2);

  if (upsidePercent !== null) {
    if (upsidePercent >= 15) {
      score += 1;
    } else if (upsidePercent <= 0) {
      score -= 1;
    }
  }

  if (revenueGrowth !== null) {
    if (revenueGrowth >= 10) {
      score += 1;
    } else if (revenueGrowth < 0) {
      score -= 1;
    }
  }

  if (latestSurprise !== null) {
    if (latestSurprise > 0) {
      score += 1;
    } else if (latestSurprise < 0) {
      score -= 1;
    }
  }

  if (logic.entityCertainty === "weak") {
    return "avoid";
  }

  if (
    (coverageProfile === "Registry-led private coverage" || coverageProfile === "Limited evidence") &&
    (logic.valuationSupport === "weak" || logic.financialDepth === "thin")
  ) {
    return score >= 2 ? "watch" : "avoid";
  }

  if (score >= 6 && logic.valuationSupport !== "weak" && logic.dataGaps !== "heavy") {
    return "buy";
  }

  if (score >= 2) {
    return "hold";
  }

  if (score >= -1) {
    return "watch";
  }

  return "avoid";
}

function deriveConviction(
  input: InvestmentMemoInput,
  recommendation: InvestmentRecommendation,
  logic: Omit<RecommendationLogic, "supportingReasons" | "confidenceLimitingReasons">,
): InvestmentMemo["conviction"] {
  if (
    recommendation === "buy" &&
    input.confidence.score >= 80 &&
    logic.entityCertainty === "strong" &&
    logic.dataGaps === "contained" &&
    logic.valuationSupport !== "weak"
  ) {
    return "high";
  }

  if (
    input.confidence.score >= 60 &&
    logic.entityCertainty !== "weak" &&
    logic.dataGaps !== "heavy" &&
    recommendation !== "watch"
  ) {
    return "medium";
  }

  return "low";
}

function buildWhyNow(
  input: InvestmentMemoInput,
  logic: RecommendationLogic,
): readonly string[] {
  const whyNow = input.evidenceSignals
    .slice(0, 3)
    .map((signal) => `${signal.title}: ${firstSentence(stripSourceTags(signal.detail))}`);
  const nextAccountsDue = findMetricText(input.metrics, "Next Accounts Due");
  const latestHeadline = input.newsHighlights?.[0];

  if (whyNow.length < 3 && nextAccountsDue !== null) {
    whyNow.push(`Next filing marker: the next accounts deadline is ${nextAccountsDue}.`);
  }

  if (whyNow.length < 3 && latestHeadline !== undefined) {
    whyNow.push(`News flow: ${latestHeadline.headline}`);
  }

  if (whyNow.length === 0) {
    whyNow.push(
      logic.dataGaps === "heavy"
        ? "There is no clear timing edge today because current coverage gaps still prevent a clean underwriting case."
        : "The current evidence set is fresh enough to support a first-pass view.",
    );
  }

  return whyNow.slice(0, 3);
}

function buildKeyDisqualifier(
  recommendation: InvestmentRecommendation,
  logic: RecommendationLogic,
): string {
  if (logic.entityCertainty === "weak") {
    return "The entity match is not strong enough to support capital deployment.";
  }

  if (logic.valuationSupport === "weak") {
    return "Valuation support is too weak to defend a stronger recommendation.";
  }

  if (logic.financialDepth === "thin") {
    return "Primary operating detail is still too thin to underwrite the case cleanly.";
  }

  if (recommendation === "buy") {
    return "A clear earnings stumble or a sharp downgrade in Street support would undermine the current buy case.";
  }

  if (recommendation === "hold") {
    return "The current risk/reward is not asymmetric enough to justify a stronger call.";
  }

  if (recommendation === "watch") {
    return "The business may be worth monitoring, but the current filing, valuation, and estimate coverage is still not investable enough.";
  }

  return "The available evidence is either too weak or too adverse to justify involvement now.";
}

function buildThesis(
  recommendation: InvestmentRecommendation,
  input: InvestmentMemoInput,
): string {
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const forwardEstimate = input.valuationView?.forwardEstimates[0] ?? null;
  const evToSales = input.valuationView?.metrics.find((item) => item.label === "EV / Sales") ?? null;
  const evToEbitda = input.valuationView?.metrics.find((item) => item.label === "EV / EBITDA") ?? null;
  const positiveSignal = input.evidenceSignals.find((item) => item.tone === "positive") ?? input.evidenceSignals[0];

  const dataAnchors: string[] = [];

  if (target !== null && target.targetMean !== null && target.upsidePercent !== null) {
    dataAnchors.push(`${formatCurrency(target.targetMean)} consensus target (${formatSignedPercent(target.upsidePercent)} upside)`);
  }

  if (evToSales !== null && evToSales.current !== null) {
    dataAnchors.push(`EV/Sales of ${formatMultiple(evToSales.current)}`);
  } else if (evToEbitda !== null && evToEbitda.current !== null) {
    dataAnchors.push(`EV/EBITDA of ${formatMultiple(evToEbitda.current)}`);
  }

  if (forwardEstimate !== null) {
    const estimateBits = [
      forwardEstimate.revenueEstimate !== null
        ? `revenue ${formatCurrency(forwardEstimate.revenueEstimate, 0)}`
        : null,
      forwardEstimate.epsEstimate !== null
        ? `EPS ${forwardEstimate.epsEstimate.toFixed(2)}`
        : null,
    ].filter((v): v is string => v !== null);

    if (estimateBits.length > 0) {
      dataAnchors.push(`${forwardEstimate.period} estimates of ${estimateBits.join("/")}`);
    }
  }

  const signalDetail =
    positiveSignal === undefined
      ? null
      : firstSentence(stripSourceTags(positiveSignal.detail)).replace(/^\w/, (c) => c.toLowerCase());

  if (recommendation === "buy" || recommendation === "hold") {
    if (dataAnchors.length > 0) {
      return signalDetail !== null
        ? `The thesis rests on ${dataAnchors.join(", ")}; ${signalDetail}.`
        : `The thesis rests on ${dataAnchors.join(", ")} and a constructive read on the current operating data.`;
    }
    return signalDetail !== null
      ? `The thesis is that ${signalDetail}, and the available context supports a constructive view.`
      : "The thesis is that the company looks fundamentally credible on the available evidence.";
  }

  if (recommendation === "watch") {
    return dataAnchors.length > 0
      ? `The thesis is conditional: if ${dataAnchors.join(", ")} hold${signalDetail !== null ? ` and ${signalDetail}` : ""}, the setup could become actionable.`
      : "The thesis is that there may be a worthwhile setup here, but the data is still too incomplete to act on with confidence.";
  }

  return "The thesis for action does not close: certainty, valuation support, or downside framing is too weak to justify deployment.";
}

function buildAntiThesis(
  recommendation: InvestmentRecommendation,
  input: InvestmentMemoInput,
): string {
  const firstGap = input.coverageGaps[0];
  const firstTension = input.disagreementNotes[0];
  const hasSec = input.sources.includes("sec-edgar");
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;

  // Most specific data weakness: prefer named gap (e.g. missing SEC XBRL) over generic text
  const dataWeakness = (() => {
    if (!hasSec && (input.sources.includes("finnhub") || input.sources.includes("fmp"))) {
      return "the absence of SEC XBRL filings means the financial picture rests on market-data estimates rather than audited statement detail";
    }
    if (firstGap !== undefined) {
      return firstSentence(stripSourceTags(firstGap.detail)).replace(/^\w/, (c) => c.toLowerCase());
    }
    return "material diligence gaps remain unresolved";
  })();

  if (recommendation === "buy") {
    const bearFloor =
      target !== null && target.targetLow !== null
        ? ` The Street's low target of ${formatCurrency(target.targetLow)} defines the bear scenario if the thesis breaks.`
        : "";
    return `The anti-thesis is that ${dataWeakness}, so the market could be less wrong than the upside case assumes.${bearFloor}`;
  }

  if (recommendation === "hold") {
    return `The anti-thesis is that ${dataWeakness}, which keeps conviction capped even if the operating picture looks solid.`;
  }

  if (recommendation === "watch") {
    return `The anti-thesis is that ${dataWeakness}, leaving the name on watch rather than progressing to an investable call.`;
  }

  const tensionDetail =
    firstTension !== undefined
      ? firstSentence(stripSourceTags(firstTension.detail)).replace(/^\w/, (c) => c.toLowerCase())
      : firstGap !== undefined
        ? firstSentence(stripSourceTags(firstGap.detail)).replace(/^\w/, (c) => c.toLowerCase())
        : "the current data is too weak or contradictory";

  return `The anti-thesis is that ${tensionDetail} makes the risk/reward indefensible at current prices.`;
}

function buildUpsideCase(
  input: InvestmentMemoInput,
  logic: RecommendationLogic,
): string {
  if (logic.valuationSupport === "weak") {
    const highGap = input.coverageGaps.find((gap) => gap.severity === "high");
    return highGap !== undefined
      ? `Upside is difficult to quantify: ${firstSentence(stripSourceTags(highGap.detail)).replace(/^\w/, (c) => c.toLowerCase())}.`
      : "Upside is difficult to quantify without a working valuation frame; treat any upside framing as provisional.";
  }

  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const forwardEstimate = input.valuationView?.forwardEstimates[0] ?? null;
  const evToSales = input.valuationView?.metrics.find((item) => item.label === "EV / Sales") ?? null;
  const evToEbitda = input.valuationView?.metrics.find((item) => item.label === "EV / EBITDA") ?? null;

  const parts: string[] = [];

  if (target !== null && target.upsidePercent !== null && target.targetMean !== null) {
    parts.push(`The upside case carries ${formatSignedPercent(target.upsidePercent)} to the ${formatCurrency(target.targetMean)} consensus target`);
  }

  if (forwardEstimate !== null) {
    const estimateBits = [
      forwardEstimate.revenueEstimate !== null
        ? `revenue ${formatCurrency(forwardEstimate.revenueEstimate, 0)}`
        : null,
      forwardEstimate.epsEstimate !== null
        ? `EPS ${forwardEstimate.epsEstimate.toFixed(2)}`
        : null,
    ].filter((v): v is string => v !== null);

    if (estimateBits.length > 0) {
      parts.push(`Street ${forwardEstimate.period} estimates stand at ${estimateBits.join(", ")}`);
    }
  }

  if (evToSales !== null && evToSales.current !== null) {
    parts.push(
      evToSales.historicalHigh !== null
        ? `current EV/Sales of ${formatMultiple(evToSales.current)} is below the historical high of ${formatMultiple(evToSales.historicalHigh)}, leaving re-rating room if estimates hold`
        : `current EV/Sales of ${formatMultiple(evToSales.current)} provides a usable entry-point anchor`,
    );
  } else if (evToEbitda !== null && evToEbitda.current !== null && evToEbitda.forward !== null) {
    parts.push(`EV/EBITDA compresses from ${formatMultiple(evToEbitda.current)} TTM to ${formatMultiple(evToEbitda.forward)} forward, implying margin expansion is already in estimates`);
  }

  if (parts.length === 0) {
    const positiveSignal = input.evidenceSignals.find((s) => s.tone === "positive");
    return positiveSignal !== undefined
      ? `The upside case rests on ${firstSentence(stripSourceTags(positiveSignal.detail)).replace(/^\w/, (c) => c.toLowerCase())}.`
      : "Upside is currently unbounded because target, multiple, or forward-estimate support is still missing from the report.";
  }

  return parts.join("; ") + ".";
}

function buildDownsideCase(
  input: InvestmentMemoInput,
  logic: RecommendationLogic,
): string {
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const latestEarnings = input.earningsHighlights[0] ?? null;
  const highGaps = input.coverageGaps.filter((gap) => gap.severity === "high");

  const parts: string[] = [];

  if (target !== null && target.targetLow !== null) {
    const currentPrice = findMetricNumber(input.metrics, "Current Price");
    if (currentPrice !== null && currentPrice > 0) {
      const downside = ((target.targetLow - currentPrice) / currentPrice) * 100;
      parts.push(`The downside case floors at the Street low target of ${formatCurrency(target.targetLow)}, ${formatSignedPercent(downside)} from current levels`);
    } else {
      parts.push(`The downside case floors at the Street low target of ${formatCurrency(target.targetLow)}`);
    }
  } else if (logic.dataGaps === "heavy") {
    parts.push("The downside is poorly bounded because data gaps are too heavy to stress-test the operating case cleanly");
  }

  if (latestEarnings !== null && latestEarnings.surprisePercent !== null) {
    if (latestEarnings.surprisePercent < 0) {
      parts.push(`the ${latestEarnings.period} earnings miss of ${formatSignedPercent(latestEarnings.surprisePercent)} is a live execution risk trigger if the next cycle repeats`);
    } else {
      parts.push(`if the ${formatSignedPercent(latestEarnings.surprisePercent)} surprise from ${latestEarnings.period} reverses, the current setup weakens materially`);
    }
  }

  if (highGaps.length > 0) {
    parts.push(firstSentence(stripSourceTags(highGaps[0].detail)).replace(/^\w/, (c) => c.toLowerCase()));
  }

  if (parts.length === 0) {
    return "Downside is hard to bound precisely because there is no clean low-target or earnings-risk anchor in the current report.";
  }

  return parts.join("; ") + ".";
}

function buildBusinessSnapshot(
  input: InvestmentMemoInput,
  coverageProfile: CoverageProfile,
): string {
  const overviewSection = getSectionBody(input.sections, "Company Overview");

  if (overviewSection.length > 0) {
    return firstSentences(overviewSection, 2);
  }

  const ticker = input.entityResolution.identifiers.find((item) => item.label === "Ticker")?.value;
  const companyNumber = input.entityResolution.identifiers.find(
    (item) => item.label === "Company Number",
  )?.value;

  if (coverageProfile === "Registry-led private coverage") {
    return `${input.company} is currently being read primarily through registry evidence and selective private-company web context. Commercial relevance may exist, but the public evidence set is still much thinner than a listed-company read.`;
  }

  if (coverageProfile === "Strong public coverage" || coverageProfile === "Mixed public coverage") {
    return `${input.company}${ticker === undefined ? "" : ` (${ticker})`} is currently covered as a public-market name with live market, valuation, and Street evidence. The commercial read is usable, but richer company-profile detail can still improve the memo.`;
  }

  return `${input.company}${companyNumber === undefined ? "" : ` (Company Number: ${companyNumber})`} has been resolved as a legal entity, but the available evidence is still too thin to present a richer commercial snapshot without overreaching.`;
}

function buildValuationCase(
  input: InvestmentMemoInput,
  logic: RecommendationLogic,
): string {
  const pe = input.valuationView?.metrics.find((item) => item.label === "P/E") ?? null;
  const evToEbitda =
    input.valuationView?.metrics.find((item) => item.label === "EV / EBITDA") ?? null;
  const evToSales =
    input.valuationView?.metrics.find((item) => item.label === "EV / Sales") ?? null;
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const valuationSection = getSectionBody(input.sections, "Valuation");

  if (logic.valuationSupport === "strong") {
    const fragments = [
      pe !== null && pe.current !== null
        ? `current P/E is ${formatMultiple(pe.current)}${pe.forward !== null ? ` versus ${formatMultiple(pe.forward)} forward` : ""}`
        : null,
      evToEbitda !== null && evToEbitda.current !== null
        ? `EV / EBITDA is ${formatMultiple(evToEbitda.current)}`
        : evToSales !== null && evToSales.current !== null
          ? `EV / Sales is ${formatMultiple(evToSales.current)}`
          : null,
      target !== null && target.upsidePercent !== null
        ? `the target framework implies ${formatSignedPercent(target.upsidePercent)} upside`
        : null,
    ].filter((value): value is string => value !== null);

    if (fragments.length > 0) {
      return `Valuation support is present: ${fragments.join(", ")}. ${valuationSection.length > 0 ? firstSentence(stripSourceTags(valuationSection)) : "The current recommendation can use valuation as part of the case rather than treating it as a missing variable."}`;
    }
  }

  if (logic.valuationSupport === "mixed") {
    return `Valuation support is partial. ${valuationSection.length > 0 ? firstSentence(stripSourceTags(valuationSection)) : "Some current multiple or target context is available, but the historical and forward frame is still incomplete."} Treat any upside/downside framing with caution.`;
  }

  return `Valuation support is weak. ${valuationSection.length > 0 ? firstSentence(stripSourceTags(valuationSection)) : "There is not enough current, historical, or forward valuation context to defend a strong risk/reward case."} The recommendation therefore leans more heavily on evidence quality than on valuation.`;
}

function categorizeRisk(title: string, detail: string): InvestmentRiskCategory {
  const haystack = `${title} ${detail}`.toLowerCase();

  if (
    haystack.includes("fca") ||
    haystack.includes("sec") ||
    haystack.includes("regulator") ||
    haystack.includes("regulatory") ||
    haystack.includes("antitrust")
  ) {
    return "regulatory";
  }

  if (
    haystack.includes("execution") ||
    haystack.includes("earnings") ||
    haystack.includes("guidance") ||
    haystack.includes("growth") ||
    haystack.includes("insider")
  ) {
    return "execution";
  }

  if (
    haystack.includes("valuation") ||
    haystack.includes("market") ||
    haystack.includes("target-price") ||
    haystack.includes("peer")
  ) {
    return "market";
  }

  if (
    haystack.includes("data") ||
    haystack.includes("coverage") ||
    haystack.includes("filing") ||
    haystack.includes("accounts") ||
    haystack.includes("entity")
  ) {
    return "data-quality";
  }

  return "structural";
}

function buildKeyRisks(input: InvestmentMemoInput): readonly InvestmentRisk[] {
  const riskSeed = [
    ...input.coverageGaps.map((gap) => ({
      title: gap.title,
      detail: firstSentence(stripSourceTags(gap.detail)),
    })),
    ...input.disagreementNotes.map((note) => ({
      title: note.title,
      detail: firstSentence(stripSourceTags(note.detail)),
    })),
    ...input.evidenceSignals
      .filter((signal) => signal.tone === "negative")
      .map((signal) => ({
        title: signal.title,
        detail: firstSentence(stripSourceTags(signal.detail)),
      })),
  ];

  const uniqueRisks = riskSeed.filter(
    (risk, index, allRisks) =>
      allRisks.findIndex((candidate) => candidate.title === risk.title) === index,
  );

  return uniqueRisks.slice(0, 5).map((risk, index) => ({
    ...risk,
    category: categorizeRisk(risk.title, risk.detail),
    rank: index + 1,
  }));
}

function buildCatalystsToMonitor(
  input: InvestmentMemoInput,
  logic: RecommendationLogic,
): readonly string[] {
  const catalysts: string[] = [];
  const nextAccountsDue = findMetricText(input.metrics, "Next Accounts Due");
  const latestEarnings = input.earningsHighlights[0];
  const latestHeadline = input.newsHighlights?.[0];

  if (latestEarnings !== undefined) {
    catalysts.push(
      latestEarnings.surprisePercent === null
        ? `Monitor the next earnings cycle after ${latestEarnings.period} for cleaner execution signals.`
        : `Monitor the next earnings cycle after ${latestEarnings.period} to see whether the recent ${formatSignedPercent(latestEarnings.surprisePercent)} surprise persists or reverses.`,
    );
  }

  if (nextAccountsDue !== null) {
    catalysts.push(`Next filing marker: accounts are due by ${nextAccountsDue}.`);
  }

  if (latestHeadline !== undefined) {
    catalysts.push(`Latest news to monitor: ${latestHeadline.headline}`);
  }

  if (catalysts.length === 0) {
    catalysts.push(
      logic.dataGaps === "heavy"
        ? "The next meaningful catalyst is simply better evidence: filings, estimates, or cleaner market coverage."
        : "The next meaningful catalyst is the next fresh filing, estimate revision, or company-specific event.",
    );
  }

  return catalysts.slice(0, 4);
}

function buildWhatImprovesConfidence(
  input: InvestmentMemoInput,
  logic: RecommendationLogic,
): readonly string[] {
  const items: string[] = [];

  if (logic.financialDepth !== "strong") {
    items.push("More primary filing detail or parsed accounts would materially improve confidence.");
  }
  if (logic.valuationSupport !== "strong") {
    items.push("A fuller valuation frame with historical and forward context would sharpen the recommendation.");
  }
  if (logic.streetSignals === "weak") {
    items.push("Broader analyst or market-signal coverage would make the house view easier to defend.");
  }
  if (logic.entityCertainty !== "strong") {
    items.push("A tighter parent-entity match would reduce the risk of analyzing the wrong vehicle.");
  }

  const positiveSignal = input.evidenceSignals.find((signal) => signal.tone === "positive");
  if (positiveSignal !== undefined) {
    items.push(`Confirmation that ${positiveSignal.title.toLowerCase()} persists would strengthen the memo.`);
  }

  return [...new Set(items)].slice(0, 3);
}

function buildWhatReducesConfidence(
  input: InvestmentMemoInput,
  logic: RecommendationLogic,
): readonly string[] {
  const items: string[] = [];
  const negativeSignal = input.evidenceSignals.find((signal) => signal.tone === "negative");

  if (input.earningsHighlights[0] !== undefined) {
    items.push("Another weak earnings print or reversal in recent delivery would reduce confidence quickly.");
  }
  if (input.streetView?.latest !== null) {
    items.push("Analyst downgrades or target cuts would weaken the current read materially.");
  }
  if (logic.dataGaps !== "contained") {
    items.push("If current data gaps persist, the recommendation should stay conservative or weaken further.");
  }
  if (negativeSignal !== undefined) {
    items.push(`Any further evidence behind ${negativeSignal.title.toLowerCase()} would make the case worse.`);
  }

  return [...new Set(items)].slice(0, 3);
}

function buildVerifiedFacts(input: InvestmentMemoInput): readonly string[] {
  const facts: string[] = [];
  const ticker = input.entityResolution.identifiers.find((item) => item.label === "Ticker")?.value;
  const companyNumber = input.entityResolution.identifiers.find(
    (item) => item.label === "Company Number",
  )?.value;
  const currentPrice = findMetricNumber(input.metrics, "Current Price");
  const revenueGrowth = findMetricNumber(input.metrics, "Revenue Growth");
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const lastAccountsMadeUpTo = findMetricText(input.metrics, "Last Accounts Made Up To");

  facts.push(
    ticker !== undefined
      ? `The company is currently being analyzed as ${input.company} (${ticker}).`
      : companyNumber !== undefined
        ? `The legal entity is resolved as ${input.company} (Company Number: ${companyNumber}).`
        : `The entity is resolved as ${input.company}.`,
  );

  if (currentPrice !== null) {
    facts.push(`Current price is ${formatCurrency(currentPrice)} on the latest market snapshot.`);
  }
  if (revenueGrowth !== null) {
    facts.push(`Revenue growth is ${formatSignedPercent(revenueGrowth)} on the current evidence set.`);
  }
  if (target !== null && target.targetMean !== null && target.upsidePercent !== null) {
    facts.push(
      `The current target framework implies ${formatSignedPercent(target.upsidePercent)} upside to ${formatCurrency(target.targetMean)}.`,
    );
  }
  if (lastAccountsMadeUpTo !== null) {
    facts.push(`The latest available accounts are made up to ${lastAccountsMadeUpTo}.`);
  }

  return facts.slice(0, 4);
}

function buildReasonedInference(
  recommendation: InvestmentRecommendation,
  coverageProfile: CoverageProfile,
  logic: RecommendationLogic,
): readonly string[] {
  const inferences: string[] = [];

  if (recommendation === "buy") {
    inferences.push("The balance of evidence suggests the market may still be underpricing the operating setup.");
  } else if (recommendation === "hold") {
    inferences.push("The business looks credible, but the current setup appears more balanced than obviously mispriced.");
  } else if (recommendation === "watch") {
    inferences.push("The company may warrant future attention, but the present evidence base is not yet investment-grade.");
  } else {
    inferences.push("Either the entity match, the valuation frame, or the evidence depth is too weak to justify action now.");
  }

  if (coverageProfile === "Registry-led private coverage") {
    inferences.push("Because this is a registry-led private-company read, conviction must stay lower than for a listed company with mark-to-market evidence.");
  }

  if (logic.valuationSupport === "strong") {
    inferences.push("Valuation can be used as an active part of the house view rather than treated as a missing variable.");
  } else if (logic.valuationSupport === "weak") {
    inferences.push("The memo should lean more on evidence quality than on any single valuation claim because valuation support is thin.");
  }

  return inferences.slice(0, 3);
}

function buildUnknowns(input: InvestmentMemoInput): readonly string[] {
  const unknowns = input.coverageGaps.map(
    (gap) => `${gap.title}: ${firstSentence(stripSourceTags(gap.detail))}`,
  );

  return unknowns.length > 0
    ? unknowns.slice(0, 4)
    : ["No major unknowns or missing-data flags were raised on this run."];
}

function buildVerdict(
  company: string,
  recommendation: InvestmentRecommendation,
  conviction: InvestmentMemo["conviction"],
  logic: RecommendationLogic,
  supportingReasons: readonly string[],
): string {
  const recommendationLabel = RECOMMENDATION_LABELS[recommendation];
  const leadReason = supportingReasons[0] ?? "the current evidence profile";

  if (recommendation === "buy") {
    return `${recommendationLabel}: ${company} looks attractive on current evidence because ${leadReason.replace(/^[A-Z]/, (character) => character.toLowerCase())} and the valuation frame is usable, though conviction remains ${conviction}.`;
  }

  if (recommendation === "hold") {
    return `${recommendationLabel}: ${company} looks investable but not obviously mispriced; current positives are offset by enough caution to keep conviction ${conviction}.`;
  }

  if (recommendation === "watch") {
    return `${recommendationLabel}: ${company} may be worth tracking, but ${logic.dataGaps === "heavy" ? "current disclosure and coverage are still too thin" : "the current case is not yet strong enough"} to support action beyond a monitored view.`;
  }

  return `${recommendationLabel}: ${company} is not attractive enough on current evidence because the case is either too thin, too ambiguous, or too weakly supported to defend.`;
}

export function buildInvestmentMemo(input: InvestmentMemoInput): InvestmentMemo {
  const coverageProfile = getCoverageProfile(input);
  const logicBase = classifyLogic(input, coverageProfile);
  const supportingReasons = buildSupportingReasons(input, logicBase);
  const confidenceLimitingReasons = buildConfidenceLimitingReasons(input, logicBase);
  const logic: RecommendationLogic = {
    ...logicBase,
    supportingReasons,
    confidenceLimitingReasons,
  };
  const recommendation = deriveRecommendation(input, coverageProfile, logic);
  const conviction = deriveConviction(input, recommendation, logic);

  return {
    recommendation,
    conviction,
    coverageProfile,
    verdict: buildVerdict(input.company, recommendation, conviction, logic, supportingReasons),
    whyNow: buildWhyNow(input, logic),
    keyDisqualifier: buildKeyDisqualifier(recommendation, logic),
    thesis: buildThesis(recommendation, input),
    antiThesis: buildAntiThesis(recommendation, input),
    businessSnapshot: buildBusinessSnapshot(input, coverageProfile),
    valuationCase: buildValuationCase(input, logic),
    upsideCase: buildUpsideCase(input, logic),
    downsideCase: buildDownsideCase(input, logic),
    keyRisks: buildKeyRisks(input),
    catalystsToMonitor: buildCatalystsToMonitor(input, logic),
    whatImprovesConfidence: buildWhatImprovesConfidence(input, logic),
    whatReducesConfidence: buildWhatReducesConfidence(input, logic),
    verifiedFacts: buildVerifiedFacts(input),
    reasonedInference: buildReasonedInference(recommendation, coverageProfile, logic),
    unknowns: buildUnknowns(input),
    logic,
  };
}
