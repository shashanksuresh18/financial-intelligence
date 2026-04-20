import { generateNarrative } from "@/lib/claude-narrative";
import { buildInvestmentMemo } from "@/lib/investment-memo";
import type {
  ChallengerReport,
  ConfidenceLevel,
  ConfidenceScore,
  CoverageGap,
  DisagreementNote,
  EarningsHighlight,
  EntityResolution,
  EvidenceSignal,
  FinancialMetric,
  InvestmentMemo,
  NewsHighlight,
  ResearchNoteSection,
  SectionAuditItem,
  StressTestResult,
  StreetView,
  ValidationReport,
  ValuationView,
  WaterfallResult,
} from "@/lib/types";

type MemoAgentInput = {
  readonly company: string;
  readonly entityResolution: EntityResolution;
  readonly waterfallResult: WaterfallResult;
  readonly validationReport: ValidationReport;
  readonly confidence: ConfidenceScore;
  readonly metrics: readonly FinancialMetric[];
  readonly streetView: StreetView | null;
  readonly valuationView: ValuationView | null;
  readonly earningsHighlights: readonly EarningsHighlight[];
  readonly newsHighlights: readonly NewsHighlight[];
  readonly evidenceSignals: readonly EvidenceSignal[];
  readonly coverageGaps: readonly CoverageGap[];
  readonly disagreementNotes: readonly DisagreementNote[];
  readonly sectionAudit: readonly SectionAuditItem[];
  readonly challengerReport?: ChallengerReport | null;
};

type MemoAgentResult = {
  readonly investmentMemo: InvestmentMemo;
  readonly narrative: string;
  readonly sections: readonly ResearchNoteSection[];
};

function downgradeConviction(level: ConfidenceLevel): ConfidenceLevel {
  if (level === "high") {
    return "medium";
  }

  if (level === "medium") {
    return "low";
  }

  return "low";
}

function challengerGapsFromReport(
  report: ChallengerReport,
): readonly CoverageGap[] {
  return report.evidenceGaps.map((item) => ({
    title:
      item.citedSource !== "none"
        ? `Challenger: ${item.citedSource}`
        : "Challenger: data gap",
    detail: item.claim,
    severity: item.severity,
  }));
}

function challengerNotesFromReport(
  report: ChallengerReport,
): readonly DisagreementNote[] {
  return report.counterScenarios.map((item) => ({
    title: "Counter-scenario",
    detail: item.claim,
    sources: [],
  }));
}

function buildStressTest(
  report: ChallengerReport,
  originalConviction: ConfidenceLevel,
  downgraded: boolean,
): StressTestResult {
  return {
    unstatedAssumptions: report.unstatedAssumptions,
    evidenceGaps: report.evidenceGaps,
    counterScenarios: report.counterScenarios,
    convictionDowngraded: downgraded,
    originalConviction,
  };
}

export async function runMemoAgent(
  input: MemoAgentInput,
): Promise<MemoAgentResult> {
  const challengerReport = input.challengerReport ?? null;
  const augmentedCoverageGaps =
    challengerReport === null
      ? input.coverageGaps
      : [
          ...input.coverageGaps,
          ...challengerGapsFromReport(challengerReport),
        ];
  const augmentedDisagreementNotes =
    challengerReport === null
      ? input.disagreementNotes
      : [
          ...input.disagreementNotes,
          ...challengerNotesFromReport(challengerReport),
        ];

  const baseMemo = buildInvestmentMemo({
    company: input.company,
    entityResolution: input.entityResolution,
    confidence: input.confidence,
    metrics: input.metrics,
    streetView: input.streetView,
    valuationView: input.valuationView,
    earningsHighlights: input.earningsHighlights,
    newsHighlights: input.newsHighlights,
    evidenceSignals: input.evidenceSignals,
    coverageGaps: augmentedCoverageGaps,
    disagreementNotes: augmentedDisagreementNotes,
    sectionAudit: input.sectionAudit,
    sources: input.waterfallResult.activeSources,
    validationReport: input.validationReport,
    waterfallResult: input.waterfallResult,
  });

  const highSeverityCount =
    challengerReport === null
      ? 0
      : [
          ...challengerReport.unstatedAssumptions,
          ...challengerReport.evidenceGaps,
          ...challengerReport.counterScenarios,
        ].filter((item) => item.severity === "high").length;
  const convictionDowngraded = highSeverityCount > 0;
  const finalConviction = convictionDowngraded
    ? downgradeConviction(baseMemo.conviction)
    : baseMemo.conviction;
  const stressTest =
    challengerReport === null
      ? null
      : buildStressTest(
          challengerReport,
          baseMemo.conviction,
          convictionDowngraded,
        );
  const finalMemo: InvestmentMemo = {
    ...baseMemo,
    conviction: finalConviction,
    stressTest,
  };
  const narrativeResult = await generateNarrative({
    company: input.company,
    entityResolution: input.entityResolution,
    investmentMemo: finalMemo,
    waterfallResult: input.waterfallResult,
    confidence: input.confidence,
    evidenceSignals: input.evidenceSignals,
    coverageGaps: augmentedCoverageGaps,
    disagreementNotes: augmentedDisagreementNotes,
    sectionAudit: input.sectionAudit,
  });

  console.info("[memo-agent] completed", {
    company: input.company,
    configuredModel:
      process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514",
    challengerApplied: challengerReport !== null,
    originalConviction: baseMemo.conviction,
    finalConviction,
    convictionDowngraded,
    validationCoverage: input.validationReport.coverageLabel,
  });

  return {
    investmentMemo: finalMemo,
    narrative: narrativeResult.narrative,
    sections: narrativeResult.sections,
  };
}
