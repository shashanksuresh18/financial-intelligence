import { getEvidenceClassBreakdown } from "@/lib/report-assembly";
import type {
  AnalysisReport,
  ConfidenceScore,
  DiligenceChecklist,
  InvestmentScenario,
  InvestmentRecommendation,
  PeerRelevanceScore,
  RecommendationLogic,
  ReconciliationStatus,
  ThesisDriver,
  ValuationView,
  WithheldSection,
} from "@/lib/types";

type StrongRecommendationContext = {
  readonly report?: AnalysisReport;
  readonly reconciliationStatus?: ReconciliationStatus;
  readonly peerRelevanceScores?: readonly PeerRelevanceScore[];
  readonly bullCase?: InvestmentScenario | null;
  readonly diligenceChecklist?: DiligenceChecklist | null;
};

export function canRenderPeerPanel(
  peerRelevanceScores: readonly PeerRelevanceScore[],
  minPassCount = 3,
): boolean {
  return peerRelevanceScores.filter((score) => score.passes).length >= minPassCount;
}

export function canRenderPricedInAnalysis(
  reconciliationStatus: ReconciliationStatus,
  valuationView: ValuationView | null,
): boolean {
  if (reconciliationStatus.blocksValuationView) {
    return false;
  }

  return (valuationView?.metrics ?? []).some((metric) => metric.current !== null);
}

export function canRenderScenarioRange(
  thesisDrivers: readonly ThesisDriver[] | null,
  confidence: ConfidenceScore,
  report?: AnalysisReport,
): boolean {
  if (confidence.level === "low") {
    return false;
  }

  const verifiedDrivers = (thesisDrivers ?? []).filter(
    (driver) => driver.currentlyHolds && driver.confidence !== "low",
  );

  if (verifiedDrivers.length < 2) {
    return false;
  }

  if (report === undefined) {
    return true;
  }

  const breakdown = getEvidenceClassBreakdown(report);
  const nonModelEvidence =
    breakdown["primary-filing"] +
    breakdown.registry +
    breakdown["market-data-vendor"] +
    breakdown["analyst-consensus"] +
    breakdown["news-reporting"] +
    breakdown["synthesized-web"];

  return nonModelEvidence >= 50;
}

export function canRenderStrongRecommendation(
  recommendation: InvestmentRecommendation,
  confidence: ConfidenceScore,
  logic: RecommendationLogic,
  withheldSections: readonly WithheldSection[],
  context: StrongRecommendationContext = {},
): boolean {
  if (recommendation !== "buy") {
    return true;
  }

  if (confidence.level === "low") {
    return false;
  }

  if (logic.financialDepth === "thin" || logic.valuationSupport === "weak") {
    return false;
  }

  const hasBlockingWithheldSection = withheldSections.some(
    (section) =>
      section.section === "priced-in-analysis" ||
      section.section === "scenario-range" ||
      section.section === "private-thesis",
  );

  if (hasBlockingWithheldSection) {
    return false;
  }

  if (
    context.reconciliationStatus !== undefined &&
    (context.reconciliationStatus.blocksValuationView ||
      context.reconciliationStatus.overall === "failed")
  ) {
    return false;
  }

  const peerPassCount =
    context.peerRelevanceScores?.filter((score) => score.passes).length ?? null;
  const peerGateSoundlyWithheld = withheldSections.some(
    (section) =>
      section.section === "peer-comparison" &&
      section.reason === "insufficient-peer-relevance",
  );

  if (
    peerPassCount !== null &&
    peerPassCount < 3 &&
    !peerGateSoundlyWithheld
  ) {
    return false;
  }

  if (context.report !== undefined) {
    const breakdown = getEvidenceClassBreakdown(context.report);
    const primaryOrRegistry =
      breakdown["primary-filing"] + breakdown.registry;

    if (primaryOrRegistry < 30) {
      return false;
    }
  }

  if (
    context.bullCase !== undefined &&
    !hasSupportedBullCase(context.bullCase)
  ) {
    return false;
  }

  if (
    context.diligenceChecklist !== null &&
    context.diligenceChecklist !== undefined &&
    !canRenderPrivateThesis(context.diligenceChecklist)
  ) {
    return false;
  }

  return true;
}

export function canRenderPrivateThesis(checklist: DiligenceChecklist): boolean {
  return !checklist.blockThesis && checklist.passCount >= 3;
}

function hasSupportedBullCase(bullCase: InvestmentScenario | null): boolean {
  if (bullCase === null) {
    return false;
  }

  const assumptions = bullCase.assumptions.filter(
    (assumption) => assumption.trim().length > 0,
  );
  const quantifiedOutcome = bullCase.quantifiedOutcome.trim();

  if (assumptions.length === 0 || quantifiedOutcome.length === 0) {
    return false;
  }

  const combined = `${assumptions.join(" ")} ${quantifiedOutcome}`.toLowerCase();
  const consensusSignals = [
    "consensus",
    "target price",
    "target-price",
    "street target",
    "analyst target",
    "price target",
  ];
  const operatingSignals = [
    "revenue",
    "margin",
    "gross",
    "fcf",
    "free cash flow",
    "earnings",
    "eps",
    "retention",
    "take rate",
    "capex",
    "cash flow",
    "multiple",
  ];
  const restsOnConsensus = consensusSignals.some((signal) =>
    combined.includes(signal),
  );
  const hasOperatingBridge = operatingSignals.some((signal) =>
    combined.includes(signal),
  );

  return !restsOnConsensus || hasOperatingBridge;
}

export function makeWithheldSection(
  section: WithheldSection["section"],
  reason: WithheldSection["reason"],
  userMessage: string,
): WithheldSection {
  return {
    section,
    reason,
    userMessage,
  };
}
