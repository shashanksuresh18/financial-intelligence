import Anthropic from "@anthropic-ai/sdk";

import { generateNarrative } from "@/lib/claude-narrative";
import { archetypeLabel, buildDriverTree, classifyArchetype } from "@/lib/driver-trees";
import {
  buildInferenceLayer,
  buildInvestmentMemo,
  buildJudgmentLayer,
} from "@/lib/investment-memo";
import {
  applyNebiusMemoOverrides,
  synthesizeNebiusMemo,
} from "@/lib/nebius-memo";
import {
  buildFactLayer,
  evidenceClassForSource,
  evidenceClassForSources,
} from "@/lib/report-assembly";
import { buildRelevantPeerItems } from "@/lib/peer-engine";
import type {
  ChallengerReport,
  ComparablePeer,
  ComparablesAnchor,
  ConfidenceLevel,
  ConfidenceScore,
  CoverageGap,
  DataSource,
  DisagreementNote,
  DriverTree,
  EarningsHighlight,
  EntityResolution,
  EvidenceAnchor,
  EvidenceClass,
  EvidenceSignal,
  FinancialMetric,
  InvestmentMemo,
  InvestmentScenario,
  KillCriterion,
  MandateRationale,
  NewsHighlight,
  PeerRelevanceScore,
  PricedInAnalysis,
  ReconciliationStatus,
  ResearchNoteSection,
  SectionAuditItem,
  StressTestResult,
  StreetView,
  ThesisDriver,
  ValidationReport,
  ValuationMetricComparison,
  ValuationView,
  WaterfallResult,
  WithheldSection,
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
  readonly withheldSections?: readonly WithheldSection[];
  readonly reconciliationStatus?: ReconciliationStatus;
  readonly peerRelevanceScores?: readonly PeerRelevanceScore[];
};

type MemoAgentResult = {
  readonly investmentMemo: InvestmentMemo;
  readonly narrative: string;
  readonly sections: readonly ResearchNoteSection[];
};

type SynthesizedDepthFields = {
  readonly thesisDrivers: readonly ThesisDriver[] | null;
  readonly bullCase: InvestmentScenario | null;
  readonly bearCase: InvestmentScenario | null;
  readonly pricedInAnalysis: {
    readonly impliedGrowthRate: string;
    readonly ourGrowthAssumption: string;
    readonly conclusion: string;
  } | null;
  readonly comparablesAnchor: {
    readonly subjectVsMedian: string;
    readonly modelingNote: string | null;
  } | null;
  readonly whatWouldChangeTheCall: readonly KillCriterion[] | null;
};

type DepthMemoFields = Pick<
  InvestmentMemo,
  | "amakorDepthIndex"
  | "bearCase"
  | "bullCase"
  | "comparablesAnchor"
  | "driverTree"
  | "evidenceAnchors"
  | "mandateRationale"
  | "pricedInAnalysis"
  | "thesisDrivers"
  | "unitEconomics"
  | "variantView"
  | "whatWouldChangeTheCall"
  | "catalysts"
>;

type PrimaryValuationContext = {
  readonly metric: ValuationMetricComparison | null;
  readonly peerMedian: number | null;
  readonly evidenceIds: readonly string[];
};

const MODEL_CANDIDATES = [
  process.env.ANTHROPIC_MODEL?.trim(),
  "claude-sonnet-4-20250514",
].filter((value): value is string => typeof value === "string" && value.length > 0);

const DEPTH_FIELDS_MAX_TOKENS = 2200;

const DEPTH_FIELDS_OUTPUT_SCHEMA: {
  additionalProperties: boolean;
  properties: Record<string, unknown>;
  required: string[];
  type: "object";
} = {
  additionalProperties: false,
  properties: {
    thesisDrivers: {
      items: {
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          confidence: { enum: ["high", "medium", "low"], type: "string" },
          currentlyHolds: { type: "boolean" },
          evidenceId: { type: "string" },
          ifFails: { type: "string" },
          interpretation: { type: "string" },
        },
        required: [
          "claim",
          "interpretation",
          "evidenceId",
          "confidence",
          "currentlyHolds",
          "ifFails",
        ],
        type: "object",
      },
      maxItems: 5,
      minItems: 3,
      type: "array",
    },
    bullCase: {
      anyOf: [
        {
          additionalProperties: false,
          properties: {
            assumptions: {
              items: { type: "string" },
              minItems: 2,
              type: "array",
            },
            impliedMultiple: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            probabilityHint: { type: "string" },
            quantifiedOutcome: { type: "string" },
            scenario: { type: "string" },
          },
          required: [
            "scenario",
            "assumptions",
            "quantifiedOutcome",
            "impliedMultiple",
            "probabilityHint",
          ],
          type: "object",
        },
        { type: "null" },
      ],
    },
    bearCase: {
      anyOf: [
        {
          additionalProperties: false,
          properties: {
            assumptions: {
              items: { type: "string" },
              minItems: 2,
              type: "array",
            },
            impliedMultiple: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            probabilityHint: { type: "string" },
            quantifiedOutcome: { type: "string" },
            scenario: { type: "string" },
          },
          required: [
            "scenario",
            "assumptions",
            "quantifiedOutcome",
            "impliedMultiple",
            "probabilityHint",
          ],
          type: "object",
        },
        { type: "null" },
      ],
    },
    comparablesAnchor: {
      anyOf: [
        {
          additionalProperties: false,
          properties: {
            modelingNote: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            subjectVsMedian: { type: "string" },
          },
          required: ["subjectVsMedian", "modelingNote"],
          type: "object",
        },
        { type: "null" },
      ],
    },
    pricedInAnalysis: {
      anyOf: [
        {
          additionalProperties: false,
          properties: {
            conclusion: { type: "string" },
            impliedGrowthRate: { type: "string" },
            ourGrowthAssumption: { type: "string" },
          },
          required: ["impliedGrowthRate", "ourGrowthAssumption", "conclusion"],
          type: "object",
        },
        { type: "null" },
      ],
    },
    whatWouldChangeTheCall: {
      anyOf: [
        {
          items: {
            additionalProperties: false,
            properties: {
              condition: { type: "string" },
              newRecommendation: {
                enum: ["buy", "watch", "hold", "avoid"],
                type: "string",
              },
              thesisDriverIndex: {
                anyOf: [{ type: "integer" }, { type: "null" }],
              },
            },
            required: ["condition", "thesisDriverIndex", "newRecommendation"],
            type: "object",
          },
          minItems: 1,
          type: "array",
        },
        { type: "null" },
      ],
    },
  },
  required: [
    "thesisDrivers",
    "bullCase",
    "bearCase",
    "pricedInAnalysis",
    "comparablesAnchor",
    "whatWouldChangeTheCall",
  ],
  type: "object",
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

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const typedError = error as Error & {
      readonly status?: number;
      readonly headers?: unknown;
      readonly error?: unknown;
      readonly cause?: unknown;
    };

    return {
      name: typedError.name,
      message: typedError.message,
      status: typedError.status ?? null,
      error: typedError.error ?? null,
      cause: typedError.cause ?? null,
    };
  }

  if (typeof error === "object" && error !== null) {
    return { ...(error as Record<string, unknown>) };
  }

  return { error: String(error) };
}

function isNewMemoSchemaEnabled(): boolean {
  const configured = process.env.NEW_MEMO_SCHEMA?.trim().toLowerCase();

  if (configured === undefined || configured.length === 0) {
    return process.env.NODE_ENV !== "production";
  }

  return ["1", "true", "yes", "on"].includes(configured);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function nextUniqueId(baseId: string, used: Set<string>): string {
  if (!used.has(baseId)) {
    used.add(baseId);
    return baseId;
  }

  let counter = 2;

  while (used.has(`${baseId}-${counter}`)) {
    counter += 1;
  }

  const nextId = `${baseId}-${counter}`;
  used.add(nextId);
  return nextId;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  if (Math.abs(value) <= 1) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 1,
      style: "percent",
    }).format(value);
  }

  return `${formatNumber(value)}%`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 1 : 2,
    notation: Math.abs(value) >= 1_000 ? "compact" : "standard",
    style: "currency",
  }).format(value);
}

function formatMetricValue(metric: FinancialMetric): string {
  if (metric.value === null) {
    return "n/a";
  }

  if (typeof metric.value === "string") {
    return metric.value;
  }

  if (metric.format === "percent") {
    return formatPercent(metric.value);
  }

  if (metric.format === "currency") {
    return formatCurrency(metric.value);
  }

  return formatNumber(metric.value);
}

function formatMultiple(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}x`;
}

function buildEvidenceAnchors(input: MemoAgentInput): readonly EvidenceAnchor[] {
  const anchors: EvidenceAnchor[] = [];
  const usedIds = new Set<string>();

  const pushAnchor = (
    source: DataSource,
    label: string,
    value: string,
    period: string | null,
    evidenceClass: EvidenceClass = evidenceClassForSource(source),
  ): void => {
    const id = nextUniqueId(`${source}:${slugify(label)}`, usedIds);
    anchors.push({
      id,
      source,
      label,
      value,
      period,
      evidenceClass,
    });
  };

  for (const metric of input.metrics) {
    if (metric.source === undefined || metric.value === null) {
      continue;
    }

    pushAnchor(
      metric.source,
      metric.label,
      formatMetricValue(metric),
      metric.period ?? null,
      metric.evidenceClass ?? evidenceClassForSource(metric.source),
    );
  }

  for (const signal of input.evidenceSignals) {
    const primarySource = signal.sources[0];

    if (primarySource === undefined) {
      continue;
    }

    pushAnchor(
      primarySource,
      signal.title,
      signal.detail,
      null,
      signal.evidenceClass ?? evidenceClassForSources(signal.sources) ?? evidenceClassForSource(primarySource),
    );
  }

  for (const metric of input.valuationView?.metrics ?? []) {
    const source = metric.source ?? input.valuationView?.source ?? "fmp";

    if (metric.current !== null) {
      pushAnchor(
        source,
        `${metric.label} current`,
        formatMultiple(metric.current),
        null,
        metric.evidenceClass ?? evidenceClassForSource(source),
      );
    }

    if (metric.forward !== null) {
      pushAnchor(
        source,
        `${metric.label} forward`,
        formatMultiple(metric.forward),
        null,
        metric.evidenceClass ?? evidenceClassForSource(source),
      );
    }
  }

  for (const earnings of input.earningsHighlights.slice(0, 3)) {
    const actual =
      earnings.actual === null ? "actual n/a" : `actual ${formatNumber(earnings.actual)}`;
    const estimate =
      earnings.estimate === null
        ? "estimate n/a"
        : `estimate ${formatNumber(earnings.estimate)}`;
    const surprise =
      earnings.surprisePercent === null
        ? "surprise n/a"
        : `surprise ${formatPercent(earnings.surprisePercent)}`;

    pushAnchor(
      earnings.source,
      `Earnings ${earnings.period}`,
      `${actual}; ${estimate}; ${surprise}`,
      earnings.period,
      earnings.evidenceClass ?? evidenceClassForSource(earnings.source),
    );
  }

  return anchors;
}

function pushModelInferenceAnchor(
  anchors: EvidenceAnchor[],
  usedIds: Set<string>,
  label: string,
  value: string | null | undefined,
): void {
  if (value === null || value === undefined || value.trim().length === 0) {
    return;
  }

  anchors.push({
    id: nextUniqueId(`claude-fallback:${slugify(label)}`, usedIds),
    source: "claude-fallback",
    label,
    value,
    period: null,
    // Depth fields are generated by Claude from the structured evidence packet,
    // so their class is deterministic model inference rather than source evidence.
    evidenceClass: "model-inference",
  });
}

function buildModelInferenceAnchors(
  parsed: SynthesizedDepthFields,
  existingAnchors: readonly EvidenceAnchor[],
): readonly EvidenceAnchor[] {
  const anchors: EvidenceAnchor[] = [];
  const usedIds = new Set(existingAnchors.map((anchor) => anchor.id));

  parsed.thesisDrivers?.forEach((driver, index) => {
    pushModelInferenceAnchor(
      anchors,
      usedIds,
      `Thesis driver ${index + 1}`,
      `${driver.claim} ${driver.interpretation}`,
    );
  });
  pushModelInferenceAnchor(anchors, usedIds, "Bull case", parsed.bullCase?.quantifiedOutcome);
  pushModelInferenceAnchor(anchors, usedIds, "Bear case", parsed.bearCase?.quantifiedOutcome);
  pushModelInferenceAnchor(
    anchors,
    usedIds,
    "Priced-in conclusion",
    parsed.pricedInAnalysis?.conclusion,
  );
  pushModelInferenceAnchor(
    anchors,
    usedIds,
    "Comparables interpretation",
    parsed.comparablesAnchor?.subjectVsMedian,
  );
  parsed.whatWouldChangeTheCall?.forEach((criterion, index) => {
    pushModelInferenceAnchor(
      anchors,
      usedIds,
      `Kill criterion ${index + 1}`,
      criterion.condition,
    );
  });

  return anchors;
}

function findEvidenceIds(
  anchors: readonly EvidenceAnchor[],
  labelPatterns: readonly string[],
): readonly string[] {
  const normalizedPatterns = labelPatterns.map((pattern) => pattern.toLowerCase());

  return anchors
    .filter((anchor) =>
      normalizedPatterns.some((pattern) => anchor.label.toLowerCase().includes(pattern)),
    )
    .map((anchor) => anchor.id);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function getPeerMetricMedian(
  peers: readonly ComparablePeer[],
  metric: ValuationMetricComparison["label"],
): number | null {
  if (metric === "P/E") {
    return median(
      peers
        .map((peer) => peer.peRatio)
        .filter((value): value is number => value !== null),
    );
  }

  if (metric === "EV / EBITDA") {
    return median(
      peers
        .map((peer) => peer.evToEbitda)
        .filter((value): value is number => value !== null),
    );
  }

  return null;
}

function buildComparablePeers(input: MemoAgentInput): readonly ComparablePeer[] {
  return buildRelevantPeerItems(input.waterfallResult).map((peer) => ({
    name: peer.companyName,
    ticker: peer.symbol,
    peRatio: peer.peRatio,
    evToEbitda: peer.evToEbitda,
    revenueGrowth: peer.revenueGrowth,
    grossMargin: null,
    source: "fmp",
  }));
}

function selectPrimaryValuationContext(
  input: MemoAgentInput,
  anchors: readonly EvidenceAnchor[],
  peers: readonly ComparablePeer[],
): PrimaryValuationContext {
  const metrics = input.valuationView?.metrics ?? [];
  const preferredOrder: readonly ValuationMetricComparison["label"][] = [
    "EV / Sales",
    "EV / EBITDA",
    "P/E",
    "P/B",
  ];

  const selectedMetric =
    preferredOrder
      .map((label) => metrics.find((metric) => metric.label === label && metric.current !== null))
      .find((metric): metric is ValuationMetricComparison => metric !== undefined) ??
    metrics.find((metric) => metric.current !== null) ??
    null;

  if (selectedMetric === null) {
    return {
      metric: null,
      peerMedian: null,
      evidenceIds: [],
    };
  }

  return {
    metric: selectedMetric,
    peerMedian: getPeerMetricMedian(peers, selectedMetric.label),
    evidenceIds: findEvidenceIds(anchors, [selectedMetric.label.toLowerCase()]),
  };
}

function buildFallbackSubjectVsMedian(
  context: PrimaryValuationContext,
): string {
  if (context.metric === null || context.metric.current === null) {
    return "Peer median comparison is unavailable because the current memo lacks a usable public multiple.";
  }

  if (context.peerMedian === null) {
    return `${context.metric.label} is currently ${formatMultiple(context.metric.current)}, but a clean peer-median comparison is not available in the current peer set.`;
  }

  const delta = context.metric.current - context.peerMedian;
  const relative = Math.abs(delta) < 0.05 ? "roughly in line with" : delta > 0 ? "above" : "below";

  return `${context.metric.label} is ${formatMultiple(context.metric.current)} versus a peer median of ${formatMultiple(context.peerMedian)}, leaving the stock ${relative} the comp set before any view on quality or durability.`;
}

function buildComparablesAnchor(
  input: MemoAgentInput,
  context: PrimaryValuationContext,
): ComparablesAnchor | null {
  const peerGroup = buildComparablePeers(input);

  if (peerGroup.length === 0) {
    return null;
  }

  return {
    peerGroup,
    medianRow: {
      peRatio: median(
        peerGroup
          .map((peer) => peer.peRatio)
          .filter((value): value is number => value !== null),
      ),
      evToEbitda: median(
        peerGroup
          .map((peer) => peer.evToEbitda)
          .filter((value): value is number => value !== null),
      ),
      revenueGrowth: median(
        peerGroup
          .map((peer) => peer.revenueGrowth)
          .filter((value): value is number => value !== null),
      ),
      grossMargin: median(
        peerGroup
          .map((peer) => peer.grossMargin)
          .filter((value): value is number => value !== null),
      ),
    },
    subjectVsMedian: buildFallbackSubjectVsMedian(context),
    modelingNote:
      context.metric?.label === "EV / Sales"
        ? "Growth-oriented names can screen more cleanly on revenue multiples than on earnings multiples when current profitability understates strategic position."
        : null,
  };
}

function buildHistoricalComparison(metric: ValuationMetricComparison | null): string {
  if (metric === null || metric.current === null) {
    return "Historical multiple context is unavailable in the current evidence set.";
  }

  if (metric.historicalLow === null && metric.historicalHigh === null) {
    return `Current ${metric.label} is ${formatMultiple(metric.current)}, but historical range data is unavailable.`;
  }

  const midpoint =
    metric.historicalLow !== null && metric.historicalHigh !== null
      ? (metric.historicalLow + metric.historicalHigh) / 2
      : null;
  const midpointText =
    midpoint === null ? "" : ` midpoint around ${formatMultiple(midpoint)}.`;

  return `Current ${metric.label} is ${formatMultiple(metric.current)} versus a historical range of ${formatMultiple(metric.historicalLow)} to ${formatMultiple(metric.historicalHigh)}.${midpointText}`;
}

function buildPeerComparison(metric: ValuationMetricComparison | null, peerMedian: number | null): string {
  if (metric === null || metric.current === null) {
    return "Peer multiple context is unavailable because no current public multiple was captured.";
  }

  if (peerMedian === null) {
    return `Current ${metric.label} is ${formatMultiple(metric.current)}, but peer-median context is unavailable for that metric.`;
  }

  return `Current ${metric.label} is ${formatMultiple(metric.current)} versus a peer median of ${formatMultiple(peerMedian)}.`;
}

function buildPricedInAnalysis(
  memo: InvestmentMemo,
  context: PrimaryValuationContext,
  synthesized: SynthesizedDepthFields["pricedInAnalysis"],
): PricedInAnalysis | null {
  if (memo.role === "Private diligence") {
    return null;
  }

  return {
    impliedGrowthRate:
      synthesized?.impliedGrowthRate ??
      "insufficient evidence: no structured growth-implied multiple bridge was generated on this run.",
    currentMultiple:
      context.metric === null || context.metric.current === null
        ? "Primary current multiple unavailable in the evidence set."
        : `${formatMultiple(context.metric.current)} ${context.metric.label}`,
    vsHistoricalAvg: buildHistoricalComparison(context.metric),
    vsPeerMedian: buildPeerComparison(context.metric, context.peerMedian),
    ourGrowthAssumption:
      synthesized?.ourGrowthAssumption ??
      "insufficient evidence: no explicit house growth bridge was generated on this run.",
    conclusion:
      synthesized?.conclusion ??
      "Current valuation context is available, but the memo did not complete a structured 'what's priced in' interpretation.",
    evidenceIds: context.evidenceIds,
  };
}

function buildMandateRationale(memo: InvestmentMemo): MandateRationale {
  if (memo.role === "Reference public comp") {
    return {
      fit: memo.mandateFit,
      reasoning:
        "The company is analytically useful because it carries high-quality public market evidence, but the memo treats it primarily as a benchmark rather than a direct target.",
      benchmarkValue:
        "Useful as a public-market benchmark for valuation, margin structure, and Street expectations.",
    };
  }

  if (memo.role === "Private diligence") {
    return {
      fit: memo.mandateFit,
      reasoning:
        memo.mandateFit === "Out of mandate"
          ? "The company may be strategically interesting, but the current evidence base and underwriting fit are too weak for a direct target classification."
          : "The company fits the thematic opportunity set, but the current case still depends on primary diligence before it becomes fully underwriteable.",
      benchmarkValue: null,
    };
  }

  return {
    fit: memo.mandateFit,
    reasoning:
      memo.mandateFit === "Aligned mandate"
        ? "The current evidence set supports treating the company as a live mandate-fit candidate rather than only a reference point."
        : "The company has some strategic relevance, but mandate fit remains conditional on stronger evidence or cleaner underwriting support.",
    benchmarkValue: null,
  };
}

function buildFallbackKillCriteria(
  memo: InvestmentMemo,
): readonly KillCriterion[] {
  return [
    {
      condition: memo.keyDisqualifier,
      thesisDriverIndex: null,
      newRecommendation: "avoid",
    },
  ];
}

function clampDriverIndex(
  index: number | null,
  driverCount: number,
): number | null {
  if (index === null || !Number.isInteger(index)) {
    return null;
  }

  if (index < 0 || index >= driverCount) {
    return null;
  }

  return index;
}

function sanitizeThesisDrivers(
  drivers: readonly ThesisDriver[] | null,
  anchors: readonly EvidenceAnchor[],
): readonly ThesisDriver[] | null {
  if (drivers === null || drivers.length === 0 || anchors.length === 0) {
    return null;
  }

  const allowedIds = new Set(anchors.map((anchor) => anchor.id));
  const fallbackId = anchors[0]?.id ?? null;

  if (fallbackId === null) {
    return null;
  }

  return drivers.slice(0, 5).map((driver) => ({
    ...driver,
    evidenceId: allowedIds.has(driver.evidenceId) ? driver.evidenceId : fallbackId,
  }));
}

function buildDepthSystemPrompt(isPrivateCompany: boolean): string {
  return [
    "You are writing structured buy-side memo fields for an investment analysis product.",
    "Return only valid JSON matching the provided schema.",
    "Do not mirror a metric into a sentence. Every interpretation must answer 'so what?' for an investor.",
    "Thesis drivers must be structured arguments for why the case works, not generic business descriptions.",
    "Every claim that cites evidence must use one of the provided evidenceIds exactly.",
    "If the company is public, pricedInAnalysis must not be null and must explain what the current multiple is already discounting.",
    "If the company is private, pricedInAnalysis must be null.",
    "Bear and bull cases must include a specific implied multiple when possible; otherwise explain that evidence is insufficient.",
    "Kill criteria must be measurable and investor-facing, not vague prose.",
    isPrivateCompany
      ? "This company should be treated as private or diligence-led, so stay conservative and explicit about evidence limits. Enumerate verified fields first, inferred fields second, and state unknowns third. Do not generate a thesis unless the diligence checklist has cleared its critical gates."
      : "This company should be treated as public, so prioritize valuation framing, consensus mismatch, and what is already priced in.",
  ].join(" ");
}

function buildDepthPromptPayload(
  input: MemoAgentInput,
  memo: InvestmentMemo,
  anchors: readonly EvidenceAnchor[],
  factLayer: NonNullable<InvestmentMemo["factLayer"]>,
  inferenceLayer: NonNullable<InvestmentMemo["inferenceLayer"]>,
  comparablesAnchor: ComparablesAnchor | null,
  pricedInAnalysis: PricedInAnalysis | null,
): string {
  const payload = {
    company: input.company,
    entityResolution: {
      canonicalName: input.entityResolution.canonicalName,
      note: input.entityResolution.note,
      primarySource: input.entityResolution.primarySource,
    },
    recommendationFrame: {
      recommendation: memo.recommendation,
      displayRecommendationLabel: memo.displayRecommendationLabel,
      role: memo.role,
      mandateFit: memo.mandateFit,
      conviction: memo.conviction,
    },
    legacyMemo: {
      verdict: memo.verdict,
      thesis: memo.thesis,
      antiThesis: memo.antiThesis,
      whyNow: memo.whyNow,
      valuationCase: memo.valuationCase,
      upsideCase: memo.upsideCase,
      downsideCase: memo.downsideCase,
      keyDisqualifier: memo.keyDisqualifier,
    },
    logic: {
      supportingReasons: memo.logic.supportingReasons,
      confidenceLimitingReasons: memo.logic.confidenceLimitingReasons,
      tensions: memo.logic.tensions,
    },
    evidenceAnchors: anchors,
    factLayer: {
      items: factLayer.items.slice(0, 30),
      primaryFilingCount: factLayer.primaryFilingCount,
      vendorDataCount: factLayer.vendorDataCount,
      synthesizedCount: factLayer.synthesizedCount,
    },
    inferenceLayer: {
      items: inferenceLayer.items.slice(0, 12),
    },
    valuationContext:
      pricedInAnalysis === null
        ? null
        : {
            currentMultiple: pricedInAnalysis.currentMultiple,
            vsHistoricalAvg: pricedInAnalysis.vsHistoricalAvg,
            vsPeerMedian: pricedInAnalysis.vsPeerMedian,
          },
    comparablesContext:
      comparablesAnchor === null
        ? null
        : {
            peerCount: comparablesAnchor.peerGroup.length,
            peerGroup: comparablesAnchor.peerGroup.slice(0, 8),
            medianRow: comparablesAnchor.medianRow,
            fallbackSubjectVsMedian: comparablesAnchor.subjectVsMedian,
            fallbackModelingNote: comparablesAnchor.modelingNote,
          },
    coverageGaps: input.coverageGaps.slice(0, 8),
    disagreementNotes: input.disagreementNotes.slice(0, 6),
    recentNews: input.newsHighlights.slice(0, 3).map((item) => ({
      headline: item.headline,
      summary: item.summary,
      source: item.source,
    })),
    sectionAudit: input.sectionAudit,
    driverTreeContext: memo.driverTree
      ? {
          archetype: memo.driverTree.archetype,
          archetypeLabel: archetypeLabel(memo.driverTree.archetype),
          criticalMissing: memo.driverTree.criticalMissing,
          drivers: memo.driverTree.drivers.map((d) => ({
            name: d.name,
            status: d.status,
            importance: d.importance,
          })),
        }
      : null,
    diligenceChecklistContext: memo.diligenceChecklist
      ? {
          passCount: memo.diligenceChecklist.passCount,
          totalCount: memo.diligenceChecklist.totalCount,
          blockThesis: memo.diligenceChecklist.blockThesis,
          underwritingReady: memo.diligenceChecklist.underwritingReady,
          items: memo.diligenceChecklist.items.map((i) => ({
            field: i.field,
            status: i.status,
            isCritical: i.isCritical,
          })),
        }
      : null,
  };

  return JSON.stringify(payload, null, 2);
}

async function synthesizeDepthFields(
  input: MemoAgentInput,
  memo: InvestmentMemo,
  sourceEvidenceAnchors: readonly EvidenceAnchor[],
  factLayer: NonNullable<InvestmentMemo["factLayer"]>,
  inferenceLayer: NonNullable<InvestmentMemo["inferenceLayer"]>,
): Promise<DepthMemoFields> {
  if (!isNewMemoSchemaEnabled()) {
    return {};
  }

  const evidenceAnchors = sourceEvidenceAnchors;
  const withheldSections = input.withheldSections ?? [];
  const isWithheld = (section: WithheldSection["section"]): boolean =>
    withheldSections.some((item) => item.section === section);
  const comparablePeers = buildComparablePeers(input);
  const primaryValuationContext = selectPrimaryValuationContext(
    input,
    evidenceAnchors,
    comparablePeers,
  );
  const comparablesAnchorBase = buildComparablesAnchor(input, primaryValuationContext);
  const pricedInBase = isWithheld("priced-in-analysis")
    ? null
    : buildPricedInAnalysis(memo, primaryValuationContext, null);
  const archetype = classifyArchetype(input.waterfallResult, input.metrics);
  const enrichedDriverTree: DriverTree = buildDriverTree(
    archetype,
    input.metrics,
    evidenceAnchors,
  );
  const baseDepthFields: DepthMemoFields = {
    evidenceAnchors,
    thesisDrivers: null,
    unitEconomics: null,
    bullCase: null,
    bearCase: null,
    pricedInAnalysis: pricedInBase,
    variantView: null,
    catalysts: null,
    whatWouldChangeTheCall: isWithheld("private-thesis")
      ? []
      : buildFallbackKillCriteria(memo),
    comparablesAnchor: comparablesAnchorBase,
    mandateRationale: buildMandateRationale(memo),
    amakorDepthIndex: null,
    driverTree: enrichedDriverTree,
  };

  if (memo.judgmentLayer?.blocked === true) {
    console.info(
      `[memo-agent] judgment layer blocks depth synthesis for ${input.company}: ${memo.judgmentLayer.blockReasons.join("; ")}`,
    );
    return baseDepthFields;
  }

  if (enrichedDriverTree.blocksConviction) {
    console.info(
      `[memo-agent] driver tree blocks conviction for ${input.company}: missing ${enrichedDriverTree.criticalMissing.join(", ")}`,
    );
    return baseDepthFields;
  }

  let client: Anthropic;

  try {
    client = new Anthropic();
  } catch (error: unknown) {
    console.error(
      `[memo-agent] depth synthesis unavailable for ${input.company}: ${JSON.stringify(
        serializeError(error),
      )}`,
    );
    return baseDepthFields;
  }

  const isPrivateCompany = memo.role === "Private diligence";
  const prompt = buildDepthPromptPayload(
    input,
    memo,
    evidenceAnchors,
    factLayer,
    inferenceLayer,
    comparablesAnchorBase,
    pricedInBase,
  );

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: DEPTH_FIELDS_MAX_TOKENS,
        system: buildDepthSystemPrompt(isPrivateCompany),
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        tool_choice: {
          type: "tool",
          name: "emit_depth_fields",
        },
        tools: [
          {
            name: "emit_depth_fields",
            description:
              "Emit the structured memo depth fields as a single JSON-schema-valid tool input object.",
            input_schema: DEPTH_FIELDS_OUTPUT_SCHEMA,
          },
        ],
      });

      const toolBlock = response.content.find(
        (block) => block.type === "tool_use" && block.name === "emit_depth_fields",
      );
      const parsed = toolBlock?.type === "tool_use"
        ? (toolBlock.input as SynthesizedDepthFields)
        : null;

      if (parsed === null) {
        continue;
      }

      const sanitizedDrivers = sanitizeThesisDrivers(parsed.thesisDrivers, evidenceAnchors);
      const driverCount = sanitizedDrivers?.length ?? 0;
      const sanitizedKillCriteria =
        parsed.whatWouldChangeTheCall === null
          ? baseDepthFields.whatWouldChangeTheCall
          : parsed.whatWouldChangeTheCall.map((item) => ({
              ...item,
              thesisDriverIndex: clampDriverIndex(item.thesisDriverIndex, driverCount),
            }));
      const modelInferenceAnchors = buildModelInferenceAnchors(parsed, evidenceAnchors);

      return {
        ...baseDepthFields,
        evidenceAnchors: [...evidenceAnchors, ...modelInferenceAnchors],
        thesisDrivers: isWithheld("private-thesis") ? null : sanitizedDrivers,
        bullCase: isWithheld("scenario-range") ? null : parsed.bullCase,
        bearCase: isWithheld("scenario-range") ? null : parsed.bearCase,
        pricedInAnalysis: isWithheld("priced-in-analysis")
          ? null
          : buildPricedInAnalysis(
              memo,
              primaryValuationContext,
              parsed.pricedInAnalysis,
            ),
        comparablesAnchor:
          comparablesAnchorBase === null
            ? null
            : {
                ...comparablesAnchorBase,
                subjectVsMedian:
                  parsed.comparablesAnchor?.subjectVsMedian ??
                  comparablesAnchorBase.subjectVsMedian,
                modelingNote:
                  parsed.comparablesAnchor?.modelingNote ??
                  comparablesAnchorBase.modelingNote,
              },
        whatWouldChangeTheCall: sanitizedKillCriteria,
        driverTree: enrichedDriverTree,
      };
    } catch (error: unknown) {
      console.error(
        `[memo-agent] depth synthesis failed for ${input.company} on ${model}: ${JSON.stringify(
          serializeError(error),
        )}`,
      );
    }
  }

  return {
    ...baseDepthFields,
    driverTree: enrichedDriverTree,
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

  const challengerItems =
    challengerReport === null
      ? []
      : [
          ...challengerReport.unstatedAssumptions,
          ...challengerReport.evidenceGaps,
          ...challengerReport.counterScenarios,
        ];
  const highSeverityCount = challengerItems.filter((item) => item.severity === "high").length;
  const mediumSeverityCount = challengerItems.filter((item) => item.severity === "medium").length;
  const convictionDowngraded = highSeverityCount > 0 || mediumSeverityCount >= 3;
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
  const sourceEvidenceAnchors = buildEvidenceAnchors(input);
  const factLayer = buildFactLayer(
    input.waterfallResult,
    input.metrics,
    sourceEvidenceAnchors,
  );
  const inferenceLayer = buildInferenceLayer(
    factLayer,
    input.metrics,
    input.valuationView,
  );
  const preliminaryMemo: InvestmentMemo = {
    ...finalMemo,
    evidenceAnchors: sourceEvidenceAnchors,
    factLayer,
    inferenceLayer,
  };
  const preliminaryJudgmentLayer = buildJudgmentLayer(
    preliminaryMemo,
    input.confidence,
    input.withheldSections ?? [],
  );
  const memoForDepth: InvestmentMemo = {
    ...preliminaryMemo,
    judgmentLayer: preliminaryJudgmentLayer,
  };
  const depthFields = await synthesizeDepthFields(
    input,
    memoForDepth,
    sourceEvidenceAnchors,
    factLayer,
    inferenceLayer,
  );
  const schemaMemoBase: InvestmentMemo = {
    ...finalMemo,
    ...depthFields,
    factLayer,
    inferenceLayer,
  };
  const schemaMemo: InvestmentMemo = {
    ...schemaMemoBase,
    judgmentLayer: buildJudgmentLayer(
      schemaMemoBase,
      input.confidence,
      input.withheldSections ?? [],
    ),
  };
  const nebiusOverrides = await synthesizeNebiusMemo({
    company: input.company,
    memo: schemaMemo,
    confidence: input.confidence,
    entityResolution: input.entityResolution,
    metrics: input.metrics,
    streetView: input.streetView,
    valuationView: input.valuationView,
    earningsHighlights: input.earningsHighlights,
    newsHighlights: input.newsHighlights,
    evidenceSignals: input.evidenceSignals,
    coverageGaps: augmentedCoverageGaps,
    disagreementNotes: augmentedDisagreementNotes,
    sources: input.waterfallResult.activeSources,
  });
  const enrichedMemo = applyNebiusMemoOverrides(schemaMemo, nebiusOverrides);
  const narrativeResult = await generateNarrative({
    company: input.company,
    entityResolution: input.entityResolution,
    investmentMemo: enrichedMemo,
    waterfallResult: input.waterfallResult,
    confidence: input.confidence,
    evidenceSignals: input.evidenceSignals,
    coverageGaps: augmentedCoverageGaps,
    disagreementNotes: augmentedDisagreementNotes,
    sectionAudit: input.sectionAudit,
  });

  console.info(
    `[memo-agent] completed ${JSON.stringify({
      company: input.company,
      configuredModel:
        process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514",
      nebiusMemoApplied: nebiusOverrides !== null,
      nebiusModel: process.env.NEBIUS_LLM_MODEL?.trim() || null,
      challengerApplied: challengerReport !== null,
      newMemoSchemaEnabled: isNewMemoSchemaEnabled(),
      originalConviction: baseMemo.conviction,
      finalConviction,
      convictionDowngraded,
      thesisDriverCount: enrichedMemo.thesisDrivers?.length ?? 0,
      validationCoverage: input.validationReport.coverageLabel,
    })}`,
  );

  return {
    investmentMemo: enrichedMemo,
    narrative: narrativeResult.narrative,
    sections: narrativeResult.sections,
  };
}
