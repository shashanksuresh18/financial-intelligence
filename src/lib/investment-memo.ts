import { classifyArchetype, buildDriverTree } from "@/lib/driver-trees";
import { buildDiligenceChecklist, diligenceBlockedThesisText } from "@/lib/diligence-checklist";
import type {
  AnalysisReport,
  ConfidenceLevel,
  CoverageGap,
  CoverageProfile,
  DataSource,
  DerivedInference,
  DiligenceChecklist,
  DriverTree,
  EarningsHighlight,
  EntityResolution,
  EvidenceSignal,
  FactLayer,
  FinancialMetric,
  InferenceLayer,
  InvestmentMemo,
  InvestmentMandateFit,
  InvestmentRecommendation,
  InvestmentRole,
  InvestmentRisk,
  InvestmentRiskCategory,
  JudgmentLayer,
  NewsHighlight,
  RecommendationGapLoad,
  RecommendationLogic,
  RecommendationLogicStrength,
  ResearchNoteSection,
  SectionAuditItem,
  StreetView,
  ValidationReport,
  ValuationView,
  WaterfallResult,
  WithheldSection,
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
  readonly validationReport: ValidationReport;
  readonly waterfallResult: WaterfallResult;
};

const RECOMMENDATION_LABELS: Record<InvestmentRecommendation, string> = {
  buy: "Buy",
  watch: "Watch",
  hold: "Hold",
  avoid: "Avoid",
};

function isEvidenceQualityLanguage(text: string): boolean {
  const haystack = text.toLowerCase();

  return (
    haystack.includes("coverage") ||
    haystack.includes("data") ||
    haystack.includes("evidence") ||
    haystack.includes("filing") ||
    haystack.includes("street") ||
    haystack.includes("analyst") ||
    haystack.includes("target-price") ||
    haystack.includes("target price") ||
    haystack.includes("valuation support") ||
    haystack.includes("disclosure") ||
    haystack.includes("accounts") ||
    haystack.includes("entity") ||
    haystack.includes("underwrite") ||
    haystack.includes("diligence")
  );
}

function isGenericPrivateEvidenceGap(text: string): boolean {
  const haystack = text.toLowerCase();

  return (
    haystack.includes("synthesized public-web research") ||
    haystack.includes("management materials") ||
    haystack.includes("audited private-company reporting") ||
    haystack.includes("primary company disclosures") ||
    haystack.includes("primary diligence still lacks") ||
    haystack.includes("secondary evidence still dominates") ||
    haystack.includes("private-company evidence")
  );
}

function hasMeaningfulPrivateNegativeView(input: InvestmentMemoInput): boolean {
  const negativeSignal = input.evidenceSignals.some(
    (signal) =>
      signal.tone === "negative" &&
      !isEvidenceQualityLanguage(`${signal.title} ${signal.detail}`),
  );
  const negativeDisagreement = input.disagreementNotes.some(
    (note) => !isEvidenceQualityLanguage(`${note.title} ${note.detail}`),
  );

  return negativeSignal || negativeDisagreement;
}

function buildDisplayRecommendationLabel(
  input: InvestmentMemoInput,
  recommendation: InvestmentRecommendation,
  role: InvestmentRole,
  mandateFit: InvestmentMandateFit,
): string {
  if (role !== "Private diligence") {
    return RECOMMENDATION_LABELS[recommendation];
  }

  if (recommendation === "watch") {
    return "Primary diligence required";
  }

  if (recommendation === "avoid") {
    return hasMeaningfulPrivateNegativeView(input) && mandateFit === "Aligned mandate"
      ? RECOMMENDATION_LABELS[recommendation]
      : "Pass for now";
  }

  return RECOMMENDATION_LABELS[recommendation];
}

function buildConvictionSummary(
  input: InvestmentMemoInput,
  conviction: ConfidenceLevel,
  role: InvestmentRole,
  mandateFit: InvestmentMandateFit,
  logic: RecommendationLogic,
): string {
  const dataConfidenceLabel = input.confidence.level;

  if (role === "Private diligence") {
    if (mandateFit === "Out of mandate") {
      return `Data confidence is ${dataConfidenceLabel}, and investment conviction stays ${conviction} because the company still sits outside the current underwriting threshold.`;
    }

    return logic.entityCertainty === "weak"
      ? `Data confidence is ${dataConfidenceLabel}, and investment conviction stays ${conviction} because entity support and primary diligence are still too thin.`
      : `Data confidence is ${dataConfidenceLabel}, and investment conviction stays ${conviction} because the case still relies on secondary evidence and incomplete underwriting detail.`;
  }

  if (role === "Reference public comp" || mandateFit === "Out of mandate") {
    return `Data confidence is ${dataConfidenceLabel}, but investment conviction stays ${conviction} because this is a reference public comp rather than a mandate-fit target.`;
  }

  if (logic.valuationSupport === "weak") {
    return `Data confidence is ${dataConfidenceLabel}, but investment conviction stays ${conviction} because the valuation frame is still too weak to defend a stronger view.`;
  }

  if (logic.dataGaps === "heavy") {
    return `Data confidence is ${dataConfidenceLabel}, but investment conviction stays ${conviction} because evidence gaps still limit clean underwriting.`;
  }

  if (conviction === "high") {
    return `Data confidence is ${dataConfidenceLabel}, and investment conviction is high because the entity, operating, and valuation evidence align cleanly.`;
  }

  if (conviction === "medium") {
    return `Data confidence is ${dataConfidenceLabel}, and investment conviction is medium because the case is usable but not yet one-sided.`;
  }

  return `Data confidence is ${dataConfidenceLabel}, but investment conviction stays low because the case still needs clearer upside or cleaner downside protection.`;
}

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

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}%`;
}

function formatCompactCurrency(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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

function factIdsMatching(facts: FactLayer, patterns: readonly string[]): readonly string[] {
  const normalized = patterns.map((pattern) => pattern.toLowerCase());

  return facts.items
    .filter((fact) =>
      normalized.some((pattern) => fact.claim.toLowerCase().includes(pattern)),
    )
    .map((fact) => fact.evidenceId)
    .filter((id): id is string => id !== null);
}

function pushInference(
  items: DerivedInference[],
  seen: Set<string>,
  inference: DerivedInference,
): void {
  if (seen.has(inference.claim)) {
    return;
  }

  seen.add(inference.claim);
  items.push(inference);
}

export function buildInferenceLayer(
  facts: FactLayer,
  metrics: readonly FinancialMetric[],
  valuationView: ValuationView | null,
): InferenceLayer {
  const items: DerivedInference[] = [];
  const seen = new Set<string>();
  const revenueGrowth = findMetricNumber(metrics, "Revenue Growth");
  const grossMargin = findMetricNumber(metrics, "Gross Margin");
  const freeCashFlowMargin = findMetricNumber(metrics, "Free Cash Flow Margin");

  if (revenueGrowth !== null) {
    pushInference(items, seen, {
      claim:
        revenueGrowth >= 0
          ? `Revenue growth is positive at ${formatPercent(revenueGrowth)}, so the operating setup has at least one measurable growth anchor.`
          : `Revenue growth is negative at ${formatPercent(revenueGrowth)}, so the current case needs margin or valuation support to offset contraction.`,
      derivedFrom: factIdsMatching(facts, ["Revenue Growth"]),
      mechanismType: "trend",
      quantified: true,
    });
  }

  if (grossMargin !== null && freeCashFlowMargin !== null) {
    pushInference(items, seen, {
      claim: `Gross margin of ${formatPercent(grossMargin)} and free cash flow margin of ${formatPercent(freeCashFlowMargin)} show how much accounting margin converts into cash margin.`,
      derivedFrom: factIdsMatching(facts, ["Gross Margin", "Free Cash Flow Margin"]),
      mechanismType: "ratio",
      quantified: true,
    });
  }

  for (const metric of valuationView?.metrics ?? []) {
    if (metric.current !== null && metric.forward !== null) {
      const direction = metric.forward < metric.current ? "compresses" : "expands";

      pushInference(items, seen, {
        claim: `${metric.label} ${direction} from ${formatMultiple(metric.current)} current to ${formatMultiple(metric.forward)} forward, making the valuation view dependent on forecast delivery.`,
        derivedFrom: factIdsMatching(facts, [
          `${metric.label} current`,
          `${metric.label} forward`,
        ]),
        mechanismType: "trend",
        quantified: true,
      });
    }

    if (
      metric.current !== null &&
      metric.historicalLow !== null &&
      metric.historicalHigh !== null
    ) {
      const midpoint = (metric.historicalLow + metric.historicalHigh) / 2;
      const relative =
        Math.abs(metric.current - midpoint) < 0.1
          ? "near"
          : metric.current > midpoint
            ? "above"
            : "below";

      pushInference(items, seen, {
        claim: `${metric.label} at ${formatMultiple(metric.current)} sits ${relative} the historical midpoint of ${formatMultiple(midpoint)}.`,
        derivedFrom: factIdsMatching(facts, [`${metric.label} current`]),
        mechanismType: "comparison",
        quantified: true,
      });
    }
  }

  return {
    items: items.filter((item) => item.derivedFrom.length > 0).slice(0, 8),
  };
}

export function buildJudgmentLayer(
  memo: InvestmentMemo,
  confidence: InvestmentMemoInput["confidence"],
  withheldSections: readonly WithheldSection[],
): JudgmentLayer {
  const blockReasons: string[] = [];
  const hasPrimaryFiling =
    (memo.factLayer?.primaryFilingCount ?? 0) > 0 ||
    (memo.evidenceAnchors ?? []).some(
      (anchor) => anchor.evidenceClass === "primary-filing",
    );

  if (confidence.level === "low" && !hasPrimaryFiling) {
    blockReasons.push(
      "Conviction is blocked because data confidence is low and no primary filing evidence is present.",
    );
  }

  if (withheldSections.some((section) => section.section === "strong-recommendation")) {
    blockReasons.push(
      "A strong recommendation is withheld because the evidence base does not clear underwriting thresholds.",
    );
  }

  if (memo.diligenceChecklist?.blockThesis === true) {
    blockReasons.push(
      "Private-company thesis generation is blocked until critical diligence checklist items are resolved.",
    );
  }

  return {
    recommendation: memo.recommendation ?? null,
    conviction: memo.conviction ?? null,
    blocked: blockReasons.length > 0,
    blockReasons,
  };
}

function parseScaledNumberText(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const normalized = value.replace(/,/g, "");
  const match = normalized.match(
    /(-?\d+(?:\.\d+)?)\s*(trillion|billion|million|thousand|t|b|m|k)?/i,
  );

  if (match === null) {
    return null;
  }

  const rawNumber = Number(match[1]);

  if (Number.isNaN(rawNumber)) {
    return null;
  }

  const suffix = (match[2] ?? "").toLowerCase();
  const multiplier =
    suffix === "trillion" || suffix === "t"
      ? 1_000_000_000_000
      : suffix === "billion" || suffix === "b"
        ? 1_000_000_000
        : suffix === "million" || suffix === "m"
          ? 1_000_000
          : suffix === "thousand" || suffix === "k"
            ? 1_000
            : 1;

  return rawNumber * multiplier;
}

function parseYearText(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const match = value.match(/\b(19|20)\d{2}\b/);
  return match === null ? null : Number(match[0]);
}

function splitMetricList(value: string | null): readonly string[] {
  if (value === null) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function joinFragments(items: readonly string[]): string {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0]!;
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function lowercaseSentenceStart(text: string): string {
  return text.replace(/^[A-Z]/, (character) => character.toLowerCase());
}

function stripTrailingPunctuation(text: string): string {
  return text.trim().replace(/[.]+$/, "");
}

function normalizeVerdictClause(text: string): string {
  return lowercaseSentenceStart(stripTrailingPunctuation(firstSentence(stripSourceTags(text))));
}

function splitIntoSentences(text: string): readonly string[] {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return [];
  }

  const sentences: string[] = [];
  let sentenceStart = 0;

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];

    if (character !== "." && character !== "!" && character !== "?") {
      continue;
    }

    const previous = index > 0 ? trimmed[index - 1] : "";
    const next = index + 1 < trimmed.length ? trimmed[index + 1] : "";

    if (
      character === "." &&
      /\d/.test(previous) &&
      /\d/.test(next)
    ) {
      continue;
    }

    let nextIndex = index + 1;

    while (nextIndex < trimmed.length && /\s/.test(trimmed[nextIndex])) {
      nextIndex += 1;
    }

    if (nextIndex >= trimmed.length) {
      const sentence = trimmed.slice(sentenceStart).trim();

      if (sentence.length > 0) {
        sentences.push(sentence);
      }

      break;
    }

    const nextCharacter = trimmed[nextIndex];

    if (!/[A-Z0-9"'([]/.test(nextCharacter)) {
      continue;
    }

    const sentence = trimmed.slice(sentenceStart, index + 1).trim();

    if (sentence.length > 0) {
      sentences.push(sentence);
    }

    sentenceStart = nextIndex;
    index = nextIndex - 1;
  }

  if (sentenceStart < trimmed.length) {
    const sentence = trimmed.slice(sentenceStart).trim();

    if (sentence.length > 0) {
      sentences.push(sentence);
    }
  }

  return sentences;
}

function firstSentence(text: string): string {
  return splitIntoSentences(text)[0] ?? "";
}

function stripSourceTags(text: string): string {
  return text.replace(/\s*\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
}

function firstSentences(text: string, count: number): string {
  const normalized = stripSourceTags(text);

  if (normalized.length === 0) {
    return "";
  }

  return splitIntoSentences(normalized)
    .slice(0, count)
    .join(" ");
}

function shouldIgnoreCompaniesHouseRegistryData(
  validationReport: ValidationReport
): boolean {
  return validationReport.tensions.some(
    (tension) => tension.flag === "likely_wrong_entity"
  );
}

function addUniqueListItem(items: string[], candidate: string | null): void {
  if (candidate === null) {
    return;
  }

  const normalized = candidate.trim();

  if (normalized.length === 0 || items.includes(normalized)) {
    return;
  }

  items.push(normalized);
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

function isPrivateCompanyLike(input: InvestmentMemoInput): boolean {
  return (
    (input.sources.includes("exa-deep") || input.sources.includes("claude-fallback")) &&
    !input.sources.includes("finnhub") &&
    !input.sources.includes("fmp") &&
    !input.sources.includes("sec-edgar")
  );
}

function getPrivateStageProfile(input: InvestmentMemoInput): {
  readonly estimatedRevenue: number | null;
  readonly totalFunding: number | null;
  readonly lastValuation: number | null;
  readonly foundedYear: number | null;
  readonly investorCount: number;
  readonly competitorCount: number;
  readonly hasRegistrySupport: boolean;
  readonly hasScaleEvidence: boolean;
  readonly hasCapitalScale: boolean;
  readonly isVeryEarly: boolean;
  readonly isThinlyUnderwritten: boolean;
} {
  const estimatedRevenue = parseScaledNumberText(findMetricText(input.metrics, "Estimated Revenue"));
  const totalFunding = parseScaledNumberText(findMetricText(input.metrics, "Total Funding"));
  const lastValuation = parseScaledNumberText(findMetricText(input.metrics, "Last Valuation"));
  const foundedYear = parseYearText(findMetricText(input.metrics, "Founded Year"));
  const investorCount = splitMetricList(findMetricText(input.metrics, "Key Investors")).length;
  const competitorCount = splitMetricList(findMetricText(input.metrics, "Competitors")).length;
  const hasRegistrySupport =
    input.sources.includes("companies-house") || input.sources.includes("gleif");
  const hasScaleEvidence = estimatedRevenue !== null && estimatedRevenue >= 50_000_000;
  const hasCapitalScale =
    (totalFunding !== null && totalFunding >= 100_000_000) ||
    (lastValuation !== null && lastValuation >= 500_000_000);
  const companyAge =
    foundedYear === null ? null : new Date().getUTCFullYear() - foundedYear;
  const isVeryEarly =
    (estimatedRevenue !== null && estimatedRevenue < 50_000_000) ||
    (companyAge !== null && companyAge <= 3 && !hasScaleEvidence && !hasCapitalScale);
  const isThinlyUnderwritten =
    input.sources.length <= 1 ||
    (!hasRegistrySupport && estimatedRevenue === null) ||
    (investorCount === 0 && competitorCount === 0);

  return {
    estimatedRevenue,
    totalFunding,
    lastValuation,
    foundedYear,
    investorCount,
    competitorCount,
    hasRegistrySupport,
    hasScaleEvidence,
    hasCapitalScale,
    isVeryEarly,
    isThinlyUnderwritten,
  };
}

function buildPrivateEvidenceConstraint(
  input: InvestmentMemoInput,
  prefix: string,
): string {
  const missing: string[] = [];
  const estimatedRevenue = findMetricText(input.metrics, "Estimated Revenue");
  const grossMargin = findMetricNumber(input.metrics, "Gross Margin");
  const operatingMargin = findMetricNumber(input.metrics, "Operating Margin");
  const lastValuation = findMetricText(input.metrics, "Last Valuation");

  if (estimatedRevenue === null) {
    missing.push("verified scale");
  }

  if (grossMargin === null && operatingMargin === null) {
    missing.push("unit economics");
  }

  if (lastValuation === null) {
    missing.push("clean valuation context");
  }

  const missingSummary =
    missing.length === 0
      ? "verified traction, economics, and downside support"
      : joinFragments(missing.slice(0, 3));

  return `${prefix} ${missingSummary}`;
}

function buildPrivateMandateConstraint(input: InvestmentMemoInput): string {
  const profile = getPrivateStageProfile(input);

  if (profile.estimatedRevenue !== null && profile.estimatedRevenue < 50_000_000) {
    return "current revenue scale still looks below the underwriting threshold";
  }

  if (profile.isVeryEarly) {
    return "the company still appears too early-stage for the current underwriting style";
  }

  return "scale, maturity, and diligence depth still sit outside the current underwriting threshold";
}

function isThinPrivateUnderwriteabilityCase(
  input: InvestmentMemoInput,
  logic: Omit<RecommendationLogic, "supportingReasons" | "confidenceLimitingReasons">,
): boolean {
  if (!isPrivateCompanyLike(input)) {
    return false;
  }

  const profile = getPrivateStageProfile(input);

  return (
    logic.financialDepth === "thin" ||
    logic.valuationSupport === "weak" ||
    logic.dataGaps !== "contained" ||
    profile.isThinlyUnderwritten
  );
}

function getCoverageProfile(input: InvestmentMemoInput): CoverageProfile {
  const entityStatus = getSectionStatus(input.sectionAudit, "Entity Resolution");
  const hasFinnhub = input.sources.includes("finnhub");
  const hasFmp = input.sources.includes("fmp");
  const hasCompaniesHouse = input.sources.includes("companies-house");
  const hasExaDeep = input.sources.includes("exa-deep");
  const hasClaudeFallback = input.sources.includes("claude-fallback");
  const hasStreet =
    input.streetView?.latest != null ||
    input.streetView?.priceTarget != null ||
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

  if ((hasExaDeep || hasClaudeFallback) && !hasFinnhub && !hasFmp && !input.sources.includes("sec-edgar")) {
    return hasCompaniesHouse ? "Registry-led private coverage" : "Limited private coverage";
  }

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

function getRawMarketCap(input: InvestmentMemoInput): number | null {
  if (input.valuationView?.marketCap !== null && input.valuationView?.marketCap !== undefined) {
    return input.valuationView.marketCap;
  }

  const marketCapMetric = findMetricNumber(input.metrics, "Market Cap (USDm)");
  return marketCapMetric === null ? null : marketCapMetric * 1_000_000;
}

function deriveMandateFit(input: InvestmentMemoInput): InvestmentMandateFit {
  const marketCap = getRawMarketCap(input);
  const revenue = findMetricNumber(input.metrics, "Revenue");
  const ticker = input.entityResolution.identifiers.find((item) => item.label === "Ticker")?.value ?? null;
  const isPublicComp =
    ticker !== null ||
    input.sources.includes("finnhub") ||
    input.sources.includes("fmp") ||
    input.sources.includes("sec-edgar");
  const privateCompanyLike = isPrivateCompanyLike(input);

  if (
    isPublicComp &&
    ((marketCap !== null && marketCap >= 50_000_000_000) ||
      (revenue !== null && revenue >= 20_000_000_000))
  ) {
    return "Out of mandate";
  }

  if (
    isPublicComp &&
    ((marketCap !== null && marketCap >= 10_000_000_000) ||
      (revenue !== null && revenue >= 5_000_000_000))
  ) {
    return "Borderline mandate fit";
  }

  if (privateCompanyLike) {
    const privateProfile = getPrivateStageProfile(input);

    if (privateProfile.isVeryEarly) {
      return "Out of mandate";
    }

    if (
      privateProfile.isThinlyUnderwritten ||
      (!privateProfile.hasScaleEvidence && !privateProfile.hasCapitalScale)
    ) {
      return "Borderline mandate fit";
    }
  }

  return "Aligned mandate";
}

function deriveRole(
  input: InvestmentMemoInput,
  recommendation: InvestmentRecommendation,
  mandateFit: InvestmentMandateFit,
  logic: Omit<RecommendationLogic, "supportingReasons" | "confidenceLimitingReasons">,
): InvestmentRole {
  if (logic.entityCertainty === "weak" && !isPrivateCompanyLike(input)) {
    return "Entity resolution case";
  }

  if (isPrivateCompanyLike(input)) {
    return "Private diligence";
  }

  if (mandateFit === "Out of mandate") {
    return "Reference public comp";
  }

  if (recommendation === "watch" || logic.dataGaps !== "contained") {
    return "Watchlist candidate";
  }

  return "Core target";
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
    (coverageProfile === "Registry-led private coverage" ||
      coverageProfile === "Limited private coverage") &&
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
  const grossMargin = findMetricNumber(input.metrics, "Gross Margin");
  const capexToRevenue = findMetricNumber(input.metrics, "CapEx / Revenue");
  const freeCashFlowMargin = findMetricNumber(input.metrics, "Free Cash Flow Margin");
  const positiveSignals = input.evidenceSignals.filter((signal) => signal.tone === "positive");

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

  if (grossMargin !== null && grossMargin >= 40) {
    reasons.push(`SEC-backed gross margin remains strong at ${formatPercent(grossMargin)}.`);
  }

  if (capexToRevenue !== null && capexToRevenue <= 10) {
    reasons.push(`Capital intensity looks manageable, with CapEx / Revenue at ${formatPercent(capexToRevenue)}.`);
  }

  if (freeCashFlowMargin !== null && freeCashFlowMargin > 0) {
    reasons.push(`Free-cash-flow conversion is positive, with FCF margin at ${formatPercent(freeCashFlowMargin)}.`);
  }

  positiveSignals
    .slice(0, 2)
    .forEach((signal) => reasons.push(firstSentence(stripSourceTags(signal.detail))));

  if (logic.entityCertainty === "strong") {
    reasons.push("Entity resolution is strong enough to support a house view.");
  }

  if (logic.financialDepth === "strong") {
    reasons.push("Financial depth is strong enough to support an operating read rather than a headline-only view.");
  } else if (logic.financialDepth === "adequate") {
    reasons.push("Financial depth is sufficient for a first-pass investment read.");
  }

  return [...new Set(reasons)].slice(0, 4);
}

function buildConfidenceLimitingReasons(
  input: InvestmentMemoInput,
  logic: Omit<RecommendationLogic, "supportingReasons" | "confidenceLimitingReasons">,
): readonly string[] {
  const reasons: string[] = [];
  const privateCompanyLike = isPrivateCompanyLike(input);

  if (logic.entityCertainty !== "strong") {
    reasons.push(
      privateCompanyLike
        ? "Entity resolution still relies on private-company research rather than primary registry or filing corroboration."
        : "Entity certainty is not fully locked down.",
    );
  }
  if (logic.financialDepth === "thin") {
    reasons.push("Financial depth is still thin.");
  }
  if (logic.valuationSupport === "weak") {
    reasons.push(
      privateCompanyLike
        ? "Private valuation support is still too thin to defend a stronger view."
        : "Valuation support is too weak to defend a stronger view.",
    );
  }
  if (logic.streetSignals === "weak") {
    reasons.push(
      privateCompanyLike
        ? "Private-market reference points are still limited, so external pricing context is thin."
        : "Street coverage is limited or absent.",
    );
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
    .filter((gap) => {
      if (!privateCompanyLike) {
        return true;
      }

      return !isGenericPrivateEvidenceGap(firstSentence(stripSourceTags(gap.detail)));
    })
    .slice(0, privateCompanyLike ? 1 : 2)
    .forEach((gap) => reasons.push(firstSentence(stripSourceTags(gap.detail))));

  return [...new Set(reasons)].slice(0, 4);
}

function deriveRecommendation(
  input: InvestmentMemoInput,
  coverageProfile: CoverageProfile,
  mandateFit: InvestmentMandateFit,
  logic: Omit<RecommendationLogic, "supportingReasons" | "confidenceLimitingReasons">,
): InvestmentRecommendation {
  const upsidePercent = input.streetView?.priceTarget?.upsidePercent ?? null;
  const revenueGrowth = findMetricNumber(input.metrics, "Revenue Growth");
  const latestSurprise = input.earningsHighlights[0]?.surprisePercent ?? null;
  const positiveSignals = input.evidenceSignals.filter((signal) => signal.tone === "positive").length;
  const negativeSignals = input.evidenceSignals.filter((signal) => signal.tone === "negative").length;
  const privateCompanyLike = isPrivateCompanyLike(input);
  const hasPrimaryOrFmp =
    input.sources.includes("sec-edgar") ||
    input.sources.includes("fmp") ||
    (input.waterfallResult.secEdgar !== null &&
      input.waterfallResult.secEdgar.data.xbrlFacts !== null);
  const hasHighSeverityTension = input.validationReport.tensions.some(
    (tension) => tension.severity === "high",
  );
  const consensusOnlyUpside =
    logic.streetSignals === "strong" &&
    logic.financialDepth === "thin" &&
    logic.valuationSupport !== "strong";
  const buyEligible =
    input.confidence.level !== "low" &&
    logic.financialDepth !== "thin" &&
    hasPrimaryOrFmp &&
    !hasHighSeverityTension &&
    !consensusOnlyUpside;

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

  if (logic.entityCertainty === "weak" && !isPrivateCompanyLike(input)) {
    return "avoid";
  }

  if (mandateFit === "Out of mandate") {
    const strongReferenceCompCase =
      logic.entityCertainty === "strong" &&
      logic.financialDepth === "strong" &&
      input.confidence.score >= 80 &&
      positiveSignals >= negativeSignals &&
      (revenueGrowth === null || revenueGrowth >= 0) &&
      (upsidePercent === null || upsidePercent > 0);

    return strongReferenceCompCase ? "hold" : score >= -1 ? "watch" : "avoid";
  }

  if (privateCompanyLike && isThinPrivateUnderwriteabilityCase(input, logic)) {
    return hasMeaningfulPrivateNegativeView(input) && logic.dataGaps === "contained"
      ? "avoid"
      : "watch";
  }

  if (
    (coverageProfile === "Registry-led private coverage" ||
      coverageProfile === "Limited private coverage" ||
      coverageProfile === "Limited evidence") &&
    (logic.valuationSupport === "weak" || logic.financialDepth === "thin")
  ) {
    return score >= 1 ? "watch" : "avoid";
  }

  if (
    score >= 7 &&
    mandateFit === "Aligned mandate" &&
    buyEligible &&
    logic.valuationSupport !== "weak" &&
    logic.dataGaps === "contained"
  ) {
    return "buy";
  }

  if (
    score >= 4 &&
    logic.valuationSupport !== "weak" &&
    logic.dataGaps === "contained" &&
    positiveSignals > 0
  ) {
    return "hold";
  }

  if (score >= 0) {
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
  const ignoreCompaniesHouse = shouldIgnoreCompaniesHouseRegistryData(
    input.validationReport
  );
  const whyNow = input.evidenceSignals
    .filter(
      (signal) =>
        !ignoreCompaniesHouse || !signal.sources.includes("companies-house")
    )
    .slice(0, 3)
    .map((signal) => `${signal.title}: ${firstSentence(stripSourceTags(signal.detail))}`);
  const nextAccountsDue = ignoreCompaniesHouse
    ? null
    : findMetricText(input.metrics, "Next Accounts Due");
  const latestSecFiling = input.waterfallResult.secEdgar?.data.recentFilings[0] ?? null;
  const latestEarnings = input.earningsHighlights[0];
  const latestRecommendation = input.streetView?.latest ?? null;
  const latestHeadline = input.newsHighlights?.[0];

  if (whyNow.length < 3 && ignoreCompaniesHouse && latestSecFiling !== null) {
    addUniqueListItem(
      whyNow,
      `SEC filing marker: the latest ${latestSecFiling.form} was filed on ${latestSecFiling.filingDate}.`
    );
  }

  if (whyNow.length < 3 && ignoreCompaniesHouse && latestEarnings !== undefined) {
    addUniqueListItem(
      whyNow,
      latestEarnings.surprisePercent === null
        ? `Earnings marker: ${latestEarnings.period} is the latest reported earnings checkpoint in the current evidence set.`
        : `Earnings marker: ${latestEarnings.period} posted a ${formatSignedPercent(latestEarnings.surprisePercent)} surprise.`
    );
  }

  if (whyNow.length < 3 && ignoreCompaniesHouse && latestRecommendation !== null) {
    addUniqueListItem(
      whyNow,
      `Analyst posture: ${input.streetView?.consensusRating ?? "Hold"} consensus stands at ${latestRecommendation.bullish} bullish, ${latestRecommendation.neutral} hold, and ${latestRecommendation.bearish} bearish ratings.`
    );
  }

  if (whyNow.length < 3 && nextAccountsDue !== null) {
    addUniqueListItem(
      whyNow,
      `Next filing marker: the next accounts deadline is ${nextAccountsDue}.`
    );
  }

  if (whyNow.length < 3 && latestHeadline !== undefined) {
    addUniqueListItem(whyNow, `News flow: ${latestHeadline.headline}`);
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
  input: InvestmentMemoInput,
  recommendation: InvestmentRecommendation,
  logic: RecommendationLogic,
  mandateFit: InvestmentMandateFit,
): string {
  if (isPrivateCompanyLike(input) && mandateFit === "Out of mandate") {
    return `The business may be interesting, but ${buildPrivateMandateConstraint(input)}.`;
  }

  if (mandateFit === "Out of mandate") {
    return "This looks more useful as a reference public comp than as an actionable Amakor-style target because scale and mandate fit overpower the valuation debate.";
  }

  if (logic.entityCertainty === "weak") {
    return "The entity match is not strong enough to support capital deployment.";
  }

  if (isPrivateCompanyLike(input) && (logic.financialDepth === "thin" || logic.valuationSupport === "weak")) {
    return `${buildPrivateEvidenceConstraint(input, "Primary diligence still lacks")}.`;
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
    return isPrivateCompanyLike(input)
      ? "The business may be worth monitoring, but the current private-company evidence on scale, valuation, and moat quality is still not investable enough."
      : "The business may be worth monitoring, but the current filing, valuation, and estimate coverage is still not investable enough.";
  }

  return "The available evidence is either too weak or too adverse to justify involvement now.";
}

function buildThesis(
  recommendation: InvestmentRecommendation,
  input: InvestmentMemoInput,
  mandateFit: InvestmentMandateFit,
): string {
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const forwardEstimate = input.valuationView?.forwardEstimates[0] ?? null;
  const evToSales = input.valuationView?.metrics.find((item) => item.label === "EV / Sales") ?? null;
  const evToEbitda = input.valuationView?.metrics.find((item) => item.label === "EV / EBITDA") ?? null;
  const grossMargin = findMetricNumber(input.metrics, "Gross Margin");
  const capexToRevenue = findMetricNumber(input.metrics, "CapEx / Revenue");
  const freeCashFlowMargin = findMetricNumber(input.metrics, "Free Cash Flow Margin");
  const positiveSignal = input.evidenceSignals.find((item) => item.tone === "positive") ?? input.evidenceSignals[0];
  const estimatedRevenue = findMetricText(input.metrics, "Estimated Revenue");
  const totalFunding = findMetricText(input.metrics, "Total Funding");
  const lastValuation = findMetricText(input.metrics, "Last Valuation");
  const exaOverview = input.waterfallResult.exaDeep?.data.overview ?? null;

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

  if (grossMargin !== null) {
    dataAnchors.push(`SEC-backed gross margin of ${formatPercent(grossMargin)}`);
  }

  if (capexToRevenue !== null) {
    dataAnchors.push(`CapEx / Revenue of ${formatPercent(capexToRevenue)}`);
  }

  if (freeCashFlowMargin !== null) {
    dataAnchors.push(`free-cash-flow margin of ${formatPercent(freeCashFlowMargin)}`);
  }

  const signalDetail =
    positiveSignal === undefined
      ? null
      : firstSentence(stripSourceTags(positiveSignal.detail)).replace(/^\w/, (c) => c.toLowerCase());

  if (isPrivateCompanyLike(input) && mandateFit === "Out of mandate") {
    const privateAnchors = [
      estimatedRevenue !== null ? `estimated revenue of ${estimatedRevenue}` : null,
      totalFunding !== null ? `funding history of ${totalFunding}` : null,
      lastValuation !== null ? `last known valuation of ${lastValuation}` : null,
    ].filter((value): value is string => value !== null);

    return privateAnchors.length > 0
      ? `This sits outside the current underwriting threshold: even with ${privateAnchors.join(", ")}, ${buildPrivateMandateConstraint(input)}.`
      : `This sits outside the current underwriting threshold because ${buildPrivateMandateConstraint(input)}.`;
  }

  if (mandateFit === "Out of mandate") {
    const publicCompAnchor =
      dataAnchors.length > 0
        ? `${dataAnchors.slice(0, 3).join(", ")}`
        : "the breadth of public-market evidence";

    return `This is best treated as a reference public comp rather than a core Amakor-style target: ${publicCompAnchor} provide a useful benchmark for quality and valuation discipline, but the company's scale sits well outside the mandate's target band.`;
  }

  if (getCoverageProfile(input) === "Limited private coverage" || getCoverageProfile(input) === "Registry-led private coverage") {
    const privateAnchors = [
      estimatedRevenue !== null ? `estimated revenue of ${estimatedRevenue}` : null,
      totalFunding !== null ? `funding history of ${totalFunding}` : null,
      lastValuation !== null ? `last known valuation of ${lastValuation}` : null,
    ].filter((value): value is string => value !== null);
    const diligenceConstraint = buildPrivateEvidenceConstraint(
      input,
      "primary diligence still lacks",
    );

    if (recommendation === "avoid") {
      return privateAnchors.length > 0
        ? `The private-company case remains preliminary: even with ${privateAnchors.join(", ")}, ${diligenceConstraint}.`
        : `The private-company case remains preliminary because ${diligenceConstraint}.`;
    }

    if (privateAnchors.length > 0) {
      return `The private-company case is directionally interesting: ${privateAnchors.join(", ")} point to real scale, but ${diligenceConstraint} before capital can be committed.`;
    }

    return exaOverview !== null
      ? `The business appears to ${firstSentences(exaOverview, 2).replace(/^\w/, (character) => character.toLowerCase())}, but ${diligenceConstraint}.`
      : `The company may sit in an attractive market, but ${diligenceConstraint}.`;
  }

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
  mandateFit: InvestmentMandateFit,
): string {
  const firstGap = input.coverageGaps[0];
  const firstTension = input.disagreementNotes[0];
  const hasSec = input.sources.includes("sec-edgar");
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const marketCap = getRawMarketCap(input);

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

  if (isPrivateCompanyLike(input) && mandateFit === "Out of mandate") {
    return `The anti-thesis is that ${buildPrivateMandateConstraint(input)}, so the company cannot yet be treated as a true mandate-fit underwriting case.`;
  }

  if (mandateFit === "Out of mandate") {
    return `The anti-thesis is that the company is simply too large for the target mandate${marketCap === null ? "" : `, with market value around ${formatCompactCurrency(marketCap)}`}; even a solid public-market setup does not convert that into an actionable growth-equity fit.`;
  }

  if (isPrivateCompanyLike(input)) {
    const revenueAnchor = findMetricText(input.metrics, "Estimated Revenue");
    const valuationAnchor = findMetricText(input.metrics, "Last Valuation");
    const privateWeakness = buildPrivateEvidenceConstraint(
      input,
      "the current read still lacks",
    );

    const anchor = [revenueAnchor, valuationAnchor]
      .filter((value): value is string => value !== null)
      .join(" and ");

    return anchor.length > 0
      ? `The anti-thesis is not necessarily that the business is weak; it is that secondary evidence still dominates, so even with ${anchor}, ${privateWeakness}.`
      : `The anti-thesis is not necessarily that the business is weak; it is that ${privateWeakness}, leaving the case short of a true underwriting standard.`;
  }

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
  if (isPrivateCompanyLike(input)) {
    const estimatedRevenue = findMetricText(input.metrics, "Estimated Revenue");
    const totalFunding = findMetricText(input.metrics, "Total Funding");
    const lastValuation = findMetricText(input.metrics, "Last Valuation");
    const privateAnchors = [
      estimatedRevenue !== null ? `estimated revenue of ${estimatedRevenue}` : null,
      totalFunding !== null ? `capital raised of ${totalFunding}` : null,
      lastValuation !== null ? `valuation context at ${lastValuation}` : null,
    ].filter((value): value is string => value !== null);

    return privateAnchors.length > 0
      ? `The upside case depends on ${privateAnchors.join(", ")} being backed by durable customer adoption, strong model economics, and a moat that is more product-led than hype-driven.`
      : "Upside is difficult to underwrite because commercial traction, capital context, and moat quality are still too thinly evidenced in the current private-company read.";
  }

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
      evToSales.historicalHigh !== null && evToSales.current < evToSales.historicalHigh
        ? `current EV/Sales of ${formatMultiple(evToSales.current)} is below the historical high of ${formatMultiple(evToSales.historicalHigh)}, leaving re-rating room if estimates hold`
        : evToSales.historicalHigh !== null
          ? `current EV/Sales of ${formatMultiple(evToSales.current)} is already near the historical high of ${formatMultiple(evToSales.historicalHigh)}, so upside depends more on estimate delivery than re-rating`
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
  if (isPrivateCompanyLike(input)) {
    const revenueAnchor = findMetricText(input.metrics, "Estimated Revenue");
    const valuationAnchor = findMetricText(input.metrics, "Last Valuation");
    const anchoredEvidence =
      [revenueAnchor, valuationAnchor].filter((value): value is string => value !== null).join(" and ");

    return anchoredEvidence.length > 0
      ? `The downside is hard to floor because the current case leans on ${anchoredEvidence} without enough primary support on retention, margins, or financing resilience; if operating quality is weaker than secondary evidence suggests, the valuation frame can break quickly.`
      : "The downside is hard to floor because primary diligence still has not verified traction, economics, or financing resilience; if operating quality is weaker than current web evidence suggests, the case can break before valuation is properly testable.";
  }

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
  mandateFit: InvestmentMandateFit,
): string {
  const overviewSection = getSectionBody(input.sections, "Company Overview");

  if (overviewSection.length > 0) {
    return firstSentences(overviewSection, 2);
  }

  const ticker = input.entityResolution.identifiers.find((item) => item.label === "Ticker")?.value;
  const companyNumber = input.entityResolution.identifiers.find(
    (item) => item.label === "Company Number",
  )?.value;
  const exaOverview = input.waterfallResult.exaDeep?.data.overview ?? null;

  if (coverageProfile === "Registry-led private coverage" || coverageProfile === "Limited private coverage") {
    if (exaOverview !== null && exaOverview.trim().length > 0) {
      return firstSentences(exaOverview, 2);
    }

    return coverageProfile === "Registry-led private coverage"
      ? `${input.company} is currently being read primarily through registry evidence and selective private-company web context. Commercial relevance may exist, but the public evidence set is still much thinner than a listed-company read.`
      : `${input.company} is currently being read primarily through private-company web research rather than filings or market data. Commercial relevance may exist, but the evidence set is still much thinner than a listed-company read.`;
  }

  if (coverageProfile === "Strong public coverage" || coverageProfile === "Mixed public coverage") {
    if (mandateFit === "Out of mandate") {
      return `${input.company}${ticker === undefined ? "" : ` (${ticker})`} is best used here as a large-cap public reference point with deep market, valuation, and Street coverage rather than as a direct Amakor-style target company.`;
    }

    return `${input.company}${ticker === undefined ? "" : ` (${ticker})`} is currently covered as a public-market name with live market, valuation, and Street evidence. The commercial read is usable, but richer company-profile detail can still improve the memo.`;
  }

  return `${input.company}${companyNumber === undefined ? "" : ` (Company Number: ${companyNumber})`} has been resolved as a legal entity, but the available evidence is still too thin to present a richer commercial snapshot without overreaching.`;
}

function buildValuationCase(
  input: InvestmentMemoInput,
  logic: RecommendationLogic,
  mandateFit: InvestmentMandateFit,
): string {
  const pe = input.valuationView?.metrics.find((item) => item.label === "P/E") ?? null;
  const evToEbitda =
    input.valuationView?.metrics.find((item) => item.label === "EV / EBITDA") ?? null;
  const evToSales =
    input.valuationView?.metrics.find((item) => item.label === "EV / Sales") ?? null;
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const valuationSection = getSectionBody(input.sections, "Valuation");

  if (isPrivateCompanyLike(input) && mandateFit === "Out of mandate") {
    const totalFunding = findMetricText(input.metrics, "Total Funding");
    const lastValuation = findMetricText(input.metrics, "Last Valuation");
    const privateValuationBits = [
      totalFunding !== null ? `funding visibility at ${totalFunding}` : null,
      lastValuation !== null ? `last known valuation at ${lastValuation}` : null,
    ].filter((value): value is string => value !== null);

    return privateValuationBits.length > 0
      ? `Valuation context is visible through ${privateValuationBits.join(", ")}, but ${buildPrivateMandateConstraint(input)}.`
      : `Valuation is not the gating issue here; ${buildPrivateMandateConstraint(input)}.`;
  }

  if (mandateFit === "Out of mandate") {
    const fragments = [
      pe !== null && pe.current !== null
        ? `current P/E of ${formatMultiple(pe.current)}${pe.forward !== null ? ` versus ${formatMultiple(pe.forward)} forward` : ""}`
        : null,
      evToSales !== null && evToSales.current !== null
        ? `EV / Sales at ${formatMultiple(evToSales.current)}`
        : null,
      target !== null && target.upsidePercent !== null
        ? `${formatSignedPercent(target.upsidePercent)} Street upside to ${formatCurrency(target.targetMean)}`
        : null,
    ].filter((value): value is string => value !== null);

    return `Valuation is still worth tracking because ${fragments.join(", ") || "public-market valuation context is available"}, but this should be read as benchmark context for a mega-cap public comp, not as a direct mandate-qualified underwriting case.`;
  }

  if (isPrivateCompanyLike(input)) {
    const totalFunding = findMetricText(input.metrics, "Total Funding");
    const lastValuation = findMetricText(input.metrics, "Last Valuation");
    const privateValuationBits = [
      totalFunding !== null ? `funding visibility at ${totalFunding}` : null,
      lastValuation !== null ? `last known valuation at ${lastValuation}` : null,
    ].filter((value): value is string => value !== null);

    return privateValuationBits.length > 0
      ? `Private valuation support is partial: ${privateValuationBits.join(", ")} are available from public-web research, but a clean entry valuation, round structure, and downside frame are still missing.`
      : "Private valuation support is weak. No recent round pricing, transaction context, or clean comparable framework is attached strongly enough to defend a valuation-led case.";
  }

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

  const rankedRisks = uniqueRisks.map((risk) => ({
    ...risk,
    category: categorizeRisk(risk.title, risk.detail),
  }));

  const filteredRisks = isPrivateCompanyLike(input)
    ? (() => {
        let genericEvidenceRiskUsed = false;

        return rankedRisks.filter((risk) => {
          if (
            risk.category === "data-quality" &&
            isGenericPrivateEvidenceGap(`${risk.title} ${risk.detail}`)
          ) {
            if (genericEvidenceRiskUsed) {
              return false;
            }

            genericEvidenceRiskUsed = true;
          }

          return true;
        });
      })()
    : rankedRisks;

  return filteredRisks.slice(0, 5).map((risk, index) => ({
    ...risk,
    rank: index + 1,
  }));
}

function buildCatalystsToMonitor(
  input: InvestmentMemoInput,
  logic: RecommendationLogic,
): readonly string[] {
  const catalysts: string[] = [];
  const nextAccountsDue = shouldIgnoreCompaniesHouseRegistryData(
    input.validationReport
  )
    ? null
    : findMetricText(input.metrics, "Next Accounts Due");
  const latestEarnings = input.earningsHighlights[0];
  const latestHeadline = input.newsHighlights?.[0];
  const exaRecentNews = input.waterfallResult.exaDeep?.data.recentNews ?? null;

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

  if (catalysts.length < 4 && latestHeadline === undefined && exaRecentNews !== null && exaRecentNews.trim().length > 0) {
    catalysts.push(`Recent private-company development to monitor: ${firstSentence(exaRecentNews)}`);
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
  const privateCompanyLike = isPrivateCompanyLike(input);

  if (logic.financialDepth !== "strong") {
    items.push(
      privateCompanyLike
        ? "Primary company materials, management commentary, or cleaner private financial disclosures would materially improve confidence."
        : "More primary filing detail or parsed accounts would materially improve confidence.",
    );
  }
  if (logic.valuationSupport !== "strong") {
    items.push(
      privateCompanyLike
        ? "A clearer funding-round, valuation, and transaction context would sharpen the recommendation."
        : "A fuller valuation frame with historical and forward context would sharpen the recommendation.",
    );
  }
  if (logic.streetSignals === "weak") {
    items.push(
      privateCompanyLike
        ? "Independent confirmation of customer traction, investors, or commercial adoption would make the house view easier to defend."
        : "Broader analyst or market-signal coverage would make the house view easier to defend.",
    );
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
  const privateCompanyLike = isPrivateCompanyLike(input);

  if (input.earningsHighlights[0] !== undefined) {
    items.push("Another weak earnings print or reversal in recent delivery would reduce confidence quickly.");
  }
  if (input.streetView?.latest != null) {
    items.push("Analyst downgrades or target cuts would weaken the current read materially.");
  }
  if (privateCompanyLike) {
    items.push("Any evidence that revenue scale, customer adoption, or financing access is weaker than reported would reduce confidence materially.");
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
  const grossMargin = findMetricNumber(input.metrics, "Gross Margin");
  const capexToRevenue = findMetricNumber(input.metrics, "CapEx / Revenue");
  const estimatedRevenue = findMetricText(input.metrics, "Estimated Revenue");
  const totalFunding = findMetricText(input.metrics, "Total Funding");
  const lastValuation = findMetricText(input.metrics, "Last Valuation");
  const headquarters = findMetricText(input.metrics, "Headquarters");
  const keyInvestors = findMetricText(input.metrics, "Key Investors");
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const lastAccountsMadeUpTo = shouldIgnoreCompaniesHouseRegistryData(
    input.validationReport
  )
    ? null
    : findMetricText(input.metrics, "Last Accounts Made Up To");

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
  if (estimatedRevenue !== null) {
    facts.push(`Estimated revenue is reported at ${estimatedRevenue} in the current private-company evidence stack.`);
  }
  if (totalFunding !== null) {
    facts.push(`Total funding is reported at ${totalFunding} in the current evidence set.`);
  }
  if (lastValuation !== null) {
    facts.push(`Last known valuation is reported at ${lastValuation}.`);
  }
  if (headquarters !== null) {
    facts.push(`Headquarters is listed as ${headquarters}.`);
  }
  if (keyInvestors !== null) {
    facts.push(`Named investors include ${keyInvestors}.`);
  }
  if (revenueGrowth !== null) {
    facts.push(`Revenue growth is ${formatSignedPercent(revenueGrowth)} on the current evidence set.`);
  }
  if (grossMargin !== null) {
    facts.push(`SEC-backed gross margin is ${formatPercent(grossMargin)} on the latest fiscal-year filing.`);
  }
  if (capexToRevenue !== null) {
    facts.push(`Capital intensity is running at ${formatPercent(capexToRevenue)} of revenue on the latest fiscal-year filing.`);
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
  input: InvestmentMemoInput,
  recommendation: InvestmentRecommendation,
  coverageProfile: CoverageProfile,
  logic: RecommendationLogic,
  mandateFit: InvestmentMandateFit,
): readonly string[] {
  const inferences: string[] = [];

  if (mandateFit === "Out of mandate") {
    inferences.push(
      isPrivateCompanyLike(input)
        ? "The company currently sits outside the underwriting threshold, so the right conclusion is pass-for-now rather than a full negative fundamental verdict."
        : "The company is better used as a reference public comp for quality, sentiment, and valuation framing than as a direct mandate-fit target.",
    );
  }

  if (recommendation === "buy") {
    inferences.push("The balance of evidence suggests the market may still be underpricing the operating setup.");
  } else if (recommendation === "hold") {
    inferences.push("The business looks credible, but the current setup appears more balanced than obviously mispriced.");
  } else if (recommendation === "watch") {
    inferences.push("The company may warrant future attention, but the present evidence base is not yet investment-grade.");
  } else {
    inferences.push("Either the entity match, the valuation frame, or the evidence depth is too weak to justify action now.");
  }

  if (coverageProfile === "Registry-led private coverage" || coverageProfile === "Limited private coverage") {
    inferences.push(
      coverageProfile === "Registry-led private coverage"
        ? "Because this is a registry-led private-company read, conviction must stay lower than for a listed company with mark-to-market evidence."
        : "Because this is a thin private-company read built from web and secondary evidence, conviction must stay lower than for a listed company with mark-to-market evidence.",
    );
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

function buildHeadlineAnchor(input: InvestmentMemoInput): string | null {
  const target = input.streetView?.priceTarget ?? input.valuationView?.priceTargetFallback ?? null;
  const latestEarnings = input.earningsHighlights[0] ?? null;
  const revenueGrowth = findMetricNumber(input.metrics, "Revenue Growth");
  const grossMargin = findMetricNumber(input.metrics, "Gross Margin");
  const estimatedRevenue = findMetricText(input.metrics, "Estimated Revenue");
  const lastValuation = findMetricText(input.metrics, "Last Valuation");

  if (target !== null && target.upsidePercent !== null && target.targetMean !== null) {
    return `${formatSignedPercent(target.upsidePercent)} Street upside to ${formatCurrency(target.targetMean)}`;
  }

  if (revenueGrowth !== null) {
    return `${formatSignedPercent(revenueGrowth)} revenue growth`;
  }

  if (latestEarnings?.surprisePercent != null) {
    return `${latestEarnings.period} earnings surprise of ${formatSignedPercent(latestEarnings.surprisePercent)}`;
  }

  if (grossMargin !== null) {
    return `${formatPercent(grossMargin)} gross margin`;
  }

  if (estimatedRevenue !== null) {
    return `estimated revenue around ${estimatedRevenue}`;
  }

  if (lastValuation !== null) {
    return `last known valuation around ${lastValuation}`;
  }

  return null;
}

function buildHeadlineSupport(
  input: InvestmentMemoInput,
  supportingReasons: readonly string[],
): string {
  const positiveSignal = input.evidenceSignals.find((signal) => signal.tone === "positive");
  const latestEarnings = input.earningsHighlights[0] ?? null;
  const revenueGrowth = findMetricNumber(input.metrics, "Revenue Growth");
  const grossMargin = findMetricNumber(input.metrics, "Gross Margin");
  const estimatedRevenue = findMetricText(input.metrics, "Estimated Revenue");

  if (positiveSignal !== undefined) {
    return normalizeVerdictClause(positiveSignal.detail);
  }

  if (revenueGrowth !== null && revenueGrowth > 0) {
    return `revenue momentum remains positive at ${formatSignedPercent(revenueGrowth)}`;
  }

  if (latestEarnings?.surprisePercent != null && latestEarnings.surprisePercent > 0) {
    return `${latestEarnings.period} earnings beat by ${formatSignedPercent(latestEarnings.surprisePercent)}`;
  }

  if (grossMargin !== null) {
    return `gross margin remains ${formatPercent(grossMargin)}`;
  }

  if (estimatedRevenue !== null) {
    return `public-web research points to revenue around ${estimatedRevenue}`;
  }

  const specificReason = supportingReasons.find(
    (reason) =>
      !reason.startsWith("Entity resolution is strong enough") &&
      !reason.startsWith("Financial depth is strong enough") &&
      !reason.startsWith("Financial depth is sufficient"),
  );

  return normalizeVerdictClause(specificReason ?? supportingReasons[0] ?? "the current evidence profile is usable");
}

function buildHeadlineLimiter(
  input: InvestmentMemoInput,
  mandateFit: InvestmentMandateFit,
  role: InvestmentRole,
  logic: RecommendationLogic,
  confidenceLimitingReasons: readonly string[],
): string {
  const negativeSignal = input.evidenceSignals.find((signal) => signal.tone === "negative");
  const highGap = input.coverageGaps.find((gap) => gap.severity === "high");
  const revenueGrowth = findMetricNumber(input.metrics, "Revenue Growth");

  if (role === "Reference public comp" || mandateFit === "Out of mandate") {
    if (isPrivateCompanyLike(input)) {
      return "its current scale, stage, and diligence depth still leave it outside the underwriting threshold";
    }

    return "its scale and mandate mismatch keep it in benchmark territory rather than the actionable target set";
  }

  if (highGap !== undefined) {
    return normalizeVerdictClause(highGap.detail);
  }

  if (logic.dataGaps === "heavy") {
    return "coverage gaps are still too heavy to underwrite cleanly";
  }

  if (negativeSignal !== undefined) {
    return normalizeVerdictClause(negativeSignal.detail);
  }

  if (revenueGrowth !== null && revenueGrowth < 0) {
    return `revenue momentum is under pressure at ${formatSignedPercent(revenueGrowth)}`;
  }

  const specificLimit = confidenceLimitingReasons.find(
    (reason) =>
      !reason.startsWith("Entity certainty is not fully locked down.") &&
      !reason.startsWith("Data gaps are heavy enough") &&
      !reason.startsWith("Data gaps remain meaningful") &&
      !reason.startsWith("Evidence tensions are present."),
  );

  return normalizeVerdictClause(
    specificLimit ?? confidenceLimitingReasons[0] ?? "the limiting evidence still outweighs the upside case",
  );
}

function buildVerdict(
  input: InvestmentMemoInput,
  company: string,
  displayRecommendationLabel: string,
  recommendation: InvestmentRecommendation,
  mandateFit: InvestmentMandateFit,
  role: InvestmentRole,
  logic: RecommendationLogic,
  supportingReasons: readonly string[],
  confidenceLimitingReasons: readonly string[],
): string {
  const support = buildHeadlineSupport(input, supportingReasons);
  const limiter = buildHeadlineLimiter(
    input,
    mandateFit,
    role,
    logic,
    confidenceLimitingReasons,
  );
  const anchor = buildHeadlineAnchor(input);
  const anchorClause = anchor === null ? "" : `, with ${anchor}`;

  if (role === "Reference public comp") {
    return `${displayRecommendationLabel}: ${company} is a reference public comp, not a direct target: ${support}${anchorClause}, but ${limiter}.`;
  }

  if (role === "Entity resolution case") {
    return `${displayRecommendationLabel}: ${company} cannot be underwritten cleanly because ${limiter}${anchor === null ? "" : `, even though ${anchor} is attached to the current read`}.`;
  }

  if (role === "Private diligence") {
    if (displayRecommendationLabel === "Pass for now") {
      return `${displayRecommendationLabel}: ${company} is not yet underwriteable because ${limiter}${anchor === null ? "" : `, despite ${anchor}`}.`;
    }

    if (displayRecommendationLabel === "Primary diligence required") {
      return `${company} merits deeper work because ${support}${anchorClause}, but ${limiter}.`;
    }

    return `${displayRecommendationLabel}: ${company} merits deeper work because ${support}${anchorClause}, but ${limiter}.`;
  }

  if (recommendation === "buy") {
    return `${displayRecommendationLabel}: ${company} looks actionable because ${support}${anchorClause}, while ${limiter}.`;
  }

  if (recommendation === "hold") {
    return `${displayRecommendationLabel}: ${company} has a usable case because ${support}${anchorClause}, but ${limiter}.`;
  }

  if (recommendation === "watch") {
    return `${displayRecommendationLabel}: ${company} merits follow-up because ${support}${anchorClause}, but ${limiter}.`;
  }

  return `${displayRecommendationLabel}: ${company} is hard to defend here because ${limiter}${anchor === null ? "" : `, even though ${anchor} is visible in the current evidence set`}.`;
}

export function buildInvestmentMemo(input: InvestmentMemoInput): InvestmentMemo {
  const coverageProfile = getCoverageProfile(input);
  const preliminaryFit = deriveMandateFit(input);
  const logicBase = classifyLogic(input, coverageProfile);
  const supportingReasons = buildSupportingReasons(input, logicBase);
  const confidenceLimitingReasons = buildConfidenceLimitingReasons(input, logicBase);
  const logic: RecommendationLogic = {
    ...logicBase,
    supportingReasons,
    confidenceLimitingReasons,
  };
  const recommendation = deriveRecommendation(input, coverageProfile, preliminaryFit, logic);
  const conviction = deriveConviction(input, recommendation, logic);
  const role = deriveRole(input, recommendation, preliminaryFit, logicBase);
  const mandateFit =
    role === "Reference public comp"
      ? "Benchmark territory"
      : preliminaryFit;
  const displayRecommendationLabel = buildDisplayRecommendationLabel(
    input,
    recommendation,
    role,
    mandateFit,
  );
  const convictionSummary = buildConvictionSummary(
    input,
    conviction,
    role,
    mandateFit,
    logic,
  );

  // --- Driver tree: classify archetype and build driver tree ---
  const archetype = classifyArchetype(input.waterfallResult, input.metrics);
  const driverTree: DriverTree = buildDriverTree(archetype, input.metrics, []);

  const baseKeyRisks = buildKeyRisks(input);
  const driverTreeRisks: readonly InvestmentRisk[] = driverTree.criticalMissing.map(
    (driverName, index) => ({
      title: `Missing critical driver: ${driverName}`,
      detail: `The ${driverName} metric is required for the ${archetype} archetype but is not available in the current evidence set. Conviction cannot be upgraded until this gap is closed.`,
      category: "data-quality" as InvestmentRiskCategory,
      rank: baseKeyRisks.length + index + 1,
    }),
  );
  // --- Diligence checklist for private companies ---
  const isPrivate =
    input.waterfallResult.finnhub === null &&
    input.waterfallResult.fmp === null &&
    input.waterfallResult.secEdgar === null &&
    (input.waterfallResult.exaDeep !== null ||
     input.waterfallResult.companiesHouse !== null ||
     input.waterfallResult.claudeFallback !== null);

  const diligenceChecklist: DiligenceChecklist | null = isPrivate
    ? buildDiligenceChecklist(input.metrics, input.waterfallResult, [])
    : null;

  const thesisText = diligenceChecklist !== null && diligenceChecklist.blockThesis
    ? diligenceBlockedThesisText(diligenceChecklist)
    : buildThesis(recommendation, input, mandateFit);

  const verdictText = diligenceChecklist !== null && !diligenceChecklist.underwritingReady
    ? `Primary diligence required — ${buildVerdict(
        input,
        input.company,
        displayRecommendationLabel,
        recommendation,
        mandateFit,
        role,
        logic,
        supportingReasons,
        confidenceLimitingReasons,
      )}`
    : buildVerdict(
        input,
        input.company,
        displayRecommendationLabel,
        recommendation,
        mandateFit,
        role,
        logic,
        supportingReasons,
        confidenceLimitingReasons,
      );

  return {
    recommendation,
    displayRecommendationLabel,
    conviction,
    convictionSummary,
    mandateFit,
    role,
    coverageProfile,
    verdict: verdictText,
    whyNow: buildWhyNow(input, logic),
    keyDisqualifier: buildKeyDisqualifier(input, recommendation, logic, mandateFit),
    thesis: thesisText,
    antiThesis: buildAntiThesis(recommendation, input, mandateFit),
    businessSnapshot: buildBusinessSnapshot(input, coverageProfile, mandateFit),
    valuationCase: buildValuationCase(input, logic, mandateFit),
    upsideCase: buildUpsideCase(input, logic),
    downsideCase: buildDownsideCase(input, logic),
    keyRisks: [...baseKeyRisks, ...driverTreeRisks],
    catalystsToMonitor: buildCatalystsToMonitor(input, logic),
    whatImprovesConfidence: buildWhatImprovesConfidence(input, logic),
    whatReducesConfidence: buildWhatReducesConfidence(input, logic),
    verifiedFacts: buildVerifiedFacts(input),
    reasonedInference: buildReasonedInference(input, recommendation, coverageProfile, logic, mandateFit),
    unknowns: buildUnknowns(input),
    logic,
    driverTree,
    diligenceChecklist,
  };
}
