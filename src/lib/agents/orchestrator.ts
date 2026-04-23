import { runChallengerAgent } from "@/lib/agents/challenger-agent";
import { buildEntityResolution } from "@/lib/agents/entity-agent";
import { runWaterfall } from "@/lib/agents/market-data-agent";
import { runMemoAgent } from "@/lib/agents/memo-agent";
import { validateWaterfall } from "@/lib/agents/validation-agent";
import { computeConfidence } from "@/lib/confidence";
import {
  assembleMetrics,
  buildNewsSentimentSummary,
  buildPeerComparison,
  buildStreetView,
  summarizeMeaningfulInsiderFlow,
  buildValuationView,
  extractConsensus,
  extractEarningsHighlights,
  extractInsiderActivity,
  extractNewsHighlights,
} from "@/lib/report-assembly";
import {
  buildPrivateResearchDevelopments,
  buildRecentDevelopments,
} from "@/lib/recent-developments";
import { placeholderAnalysisReport } from "@/lib/types";
import type { AnalysisReport, ChallengerReport, CoverageGap, DisagreementNote, EntityResolution, EarningsHighlight, EvidenceSignal, FinancialMetric, InsiderActivityItem, NewsHighlight, NewsSentimentSummary, PeerComparisonItem, SectionAuditItem, StreetView, ValidationReport, ValuationView, WaterfallResult } from "@/lib/types";

type StepResult<T> = { data: T; ms: number };
type EvidenceSignalParams = { waterfallResult: WaterfallResult; metrics: readonly FinancialMetric[]; streetView: StreetView | null; valuationView: ValuationView | null; earningsHighlights: readonly EarningsHighlight[]; newsSentiment: NewsSentimentSummary | null; peerComparison: readonly PeerComparisonItem[]; insiderActivity: readonly InsiderActivityItem[] };
type CoverageGapParams = { waterfallResult: WaterfallResult; streetView: StreetView | null; valuationView: ValuationView | null; peerComparison: readonly PeerComparisonItem[]; earningsHighlights: readonly EarningsHighlight[]; insiderActivity: readonly InsiderActivityItem[] };
type DisagreementNoteParams = { metrics: readonly FinancialMetric[]; streetView: StreetView | null; valuationView: ValuationView | null; earningsHighlights: readonly EarningsHighlight[]; newsSentiment: NewsSentimentSummary | null; insiderActivity: readonly InsiderActivityItem[] };
type SectionAuditParams = { entityResolution: EntityResolution; waterfallResult: WaterfallResult; metrics: readonly FinancialMetric[]; streetView: StreetView | null; valuationView: ValuationView | null; earningsHighlights: readonly EarningsHighlight[]; newsHighlights: readonly NewsHighlight[]; coverageGaps: readonly CoverageGap[]; disagreementNotes: readonly DisagreementNote[] };

const EMPTY_WATERFALL_RESULT: WaterfallResult = { query: "", finnhub: null, fmp: null, secEdgar: null, companiesHouse: null, gleif: null, exaDeep: null, claudeFallback: null, activeSources: [] };
const EMPTY_VALIDATION_REPORT: ValidationReport = { coverageLabel: "Thin", dataQualityScore: 0, tensions: [], gaps: [], crossChecks: [] };
const EMPTY_MEMO_RESULT: Awaited<ReturnType<typeof runMemoAgent>> = {
  investmentMemo: placeholderAnalysisReport.investmentMemo,
  narrative: placeholderAnalysisReport.narrative,
  sections: placeholderAnalysisReport.sections,
};
const EMPTY_CHALLENGER_REPORT: Awaited<ReturnType<typeof runChallengerAgent>> = { unstatedAssumptions: [], evidenceGaps: [], counterScenarios: [] };

function emptyChallengerReport(): Awaited<ReturnType<typeof runChallengerAgent>> {
  return { ...EMPTY_CHALLENGER_REPORT };
}

async function runStep<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<StepResult<T>> {
  const t0 = Date.now();
  try {
    const data = await fn();
    const ms = Date.now() - t0;
    console.info(`[orchestrator] ${name} ok`, { ms });
    return { data, ms };
  } catch (error) {
    const ms = Date.now() - t0;
    console.error(`[orchestrator] ${name} failed`, { ms, error });
    return { data: fallback, ms };
  }
}

function findMetricValue(metrics: readonly FinancialMetric[], label: string): number | null {
  const item = metrics.find((metric) => metric.label === label);
  return item !== undefined && typeof item.value === "number" ? item.value : null;
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function stripSourceTags(text: string): string {
  return text.replace(/\s*\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
}

function firstSentence(text: string): string {
  const normalized = stripSourceTags(text);
  const match = normalized.match(/.*?[.!?](?:\s|$)/);
  return match?.[0]?.trim() ?? normalized;
}

function signal(title: string, detail: string, tone: EvidenceSignal["tone"], sources: EvidenceSignal["sources"]): EvidenceSignal {
  return { title, detail, tone, sources };
}

function gap(title: string, detail: string, severity: CoverageGap["severity"]): CoverageGap {
  return { title, detail, severity };
}

function note(title: string, detail: string, sources: DisagreementNote["sources"]): DisagreementNote {
  return { title, detail, sources };
}

function isPrivateResearchOnly(waterfallResult: WaterfallResult): boolean {
  return (
    (
      waterfallResult.companiesHouse !== null ||
      waterfallResult.exaDeep !== null ||
      waterfallResult.claudeFallback !== null
    ) &&
    waterfallResult.finnhub === null &&
    waterfallResult.fmp === null &&
    waterfallResult.secEdgar === null
  );
}

function audit(
  section: SectionAuditItem["section"],
  status: SectionAuditItem["status"],
  noteText: string,
  sources: SectionAuditItem["sources"],
): SectionAuditItem {
  return { section, status, note: noteText, sources };
}

function appendChallengerCoverageGaps(
  gaps: readonly CoverageGap[],
  challengerReport: ChallengerReport,
): readonly CoverageGap[] {
  if (challengerReport.evidenceGaps.length === 0) {
    return gaps;
  }

  return [
    ...gaps,
    ...challengerReport.evidenceGaps.map((item) => ({
      title:
        item.citedSource !== "none"
          ? `Challenger: ${item.citedSource}`
          : "Challenger: data gap",
      detail: item.claim,
      severity: item.severity,
    })),
  ];
}

function appendChallengerDisagreementNotes(
  notes: readonly DisagreementNote[],
  challengerReport: ChallengerReport,
): readonly DisagreementNote[] {
  if (challengerReport.counterScenarios.length === 0) {
    return notes;
  }

  return [
    ...notes,
    ...challengerReport.counterScenarios.map((item) => ({
      title: "Counter-scenario",
      detail: item.claim,
      sources: [] as const,
    })),
  ];
}

function buildEvidenceSignals({
  waterfallResult,
  metrics,
  streetView,
  valuationView,
  earningsHighlights,
  newsSentiment,
  peerComparison,
  insiderActivity,
}: EvidenceSignalParams): readonly EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];
  const privateResearchOnly = isPrivateResearchOnly(waterfallResult);
  const companiesHouseProfile = waterfallResult.companiesHouse?.data.profile ?? null;
  const latestAccountsFiling = waterfallResult.companiesHouse?.data.accountsFilings[0] ?? null;
  const lastAccountsMadeUpTo =
    companiesHouseProfile?.accounts?.last_accounts?.made_up_to ?? null;
  const lastAccountsType = companiesHouseProfile?.accounts?.last_accounts?.type ?? null;
  const nextAccountsDue =
    companiesHouseProfile?.accounts?.next_accounts?.due_on ??
    companiesHouseProfile?.accounts?.next_due ??
    null;
  const accountsOverdue = companiesHouseProfile?.accounts?.next_accounts?.overdue ?? null;
  const revenueGrowth = findMetricValue(metrics, "Revenue Growth");
  const netMargin = findMetricValue(metrics, "Net Margin");
  const currentPe =
    valuationView?.metrics.find((item) => item.label === "P/E")?.current ?? null;
  const forwardPe =
    valuationView?.metrics.find((item) => item.label === "P/E")?.forward ?? null;
  const latestEarnings = earningsHighlights[0];
  const latestTarget = streetView?.priceTarget;
  const meaningfulInsiderFlow = summarizeMeaningfulInsiderFlow(insiderActivity);
  const exaDeep = waterfallResult.exaDeep?.data ?? null;
  const fallbackNarrative =
    waterfallResult.claudeFallback?.data.narrative.trim() ?? "";

  if (exaDeep !== null) {
    if (exaDeep.estimatedRevenue !== null) {
      signals.push(signal(
        "Private revenue evidence is available",
        `Exa Deep Research surfaced estimated revenue of ${exaDeep.estimatedRevenue}.`,
        "positive",
        ["exa-deep"],
      ));
    }

    if (exaDeep.fundingTotal !== null || exaDeep.lastValuation !== null) {
      const capitalBits = [
        exaDeep.fundingTotal !== null
          ? `funding totals ${exaDeep.fundingTotal}`
          : null,
        exaDeep.lastValuation !== null
          ? `last known valuation is ${exaDeep.lastValuation}`
          : null,
      ].filter((value): value is string => value !== null);

      signals.push(signal(
        "Private capital context is available",
        `Exa Deep Research indicates ${capitalBits.join(" and ")}.`,
        "neutral",
        ["exa-deep"],
      ));
    }

    if (exaDeep.keyInvestors.length > 0) {
      signals.push(signal(
        "Investor base is identifiable",
        `Named investors include ${exaDeep.keyInvestors.slice(0, 3).join(", ")}.`,
        "neutral",
        ["exa-deep"],
      ));
    }

    if (exaDeep.recentNews.trim().length > 0) {
      signals.push(signal(
        "Recent private-company developments are available",
        firstSentence(stripSourceTags(exaDeep.recentNews)),
        "neutral",
        ["exa-deep"],
      ));
    }
  }

  if (
    privateResearchOnly &&
    signals.length === 0 &&
    fallbackNarrative.length > 0
  ) {
    signals.push(signal(
      "Web-research narrative is available",
      firstSentence(stripSourceTags(fallbackNarrative)),
      "neutral",
      ["claude-fallback"],
    ));
  }

  if (revenueGrowth !== null) {
    signals.push(signal(
      revenueGrowth >= 0 ? "Revenue momentum is positive" : "Revenue momentum is under pressure",
      `Latest reported revenue growth is ${formatSignedNumber(revenueGrowth)}% on the current evidence set.`,
      revenueGrowth >= 0 ? "positive" : "negative",
      ["finnhub"],
    ));
  }
  if (newsSentiment !== null && newsSentiment.articleCount >= 2) {
    signals.push(signal(
      newsSentiment.label === "positive"
        ? "Recent news tone is constructive"
        : newsSentiment.label === "negative"
          ? "Recent news tone is deteriorating"
          : "Recent news tone is mixed",
      `${newsSentiment.rationale} Aggregate finance-news score is ${newsSentiment.score.toFixed(2)}.`,
      newsSentiment.label,
      ["finnhub"],
    ));
  }
  if (accountsOverdue === true) {
    signals.push(signal(
      "Next UK accounts appear overdue",
      nextAccountsDue === null
        ? "Companies House marks the next accounts as overdue, which weakens filing timeliness."
        : `Companies House shows the next accounts due on ${nextAccountsDue} as overdue, which weakens filing timeliness.`,
      "negative",
      ["companies-house"],
    ));
  } else if (lastAccountsMadeUpTo !== null) {
    signals.push(signal(
      "UK accounts metadata is available",
      `Companies House shows latest accounts made up to ${lastAccountsMadeUpTo}` +
        (lastAccountsType === null ? "" : ` (${lastAccountsType})`) +
        (latestAccountsFiling === null ? "." : `, with the latest accounts filing dated ${latestAccountsFiling.date}.`),
      "neutral",
      ["companies-house"],
    ));
  } else if (latestAccountsFiling !== null) {
    signals.push(signal(
      "A recent UK accounts filing is attached",
      `Companies House filing history includes an accounts filing dated ${latestAccountsFiling.date} (${latestAccountsFiling.type}).`,
      "neutral",
      ["companies-house"],
    ));
  }
  if (netMargin !== null) {
    signals.push(signal(
      netMargin >= 0 ? "Net margins remain positive" : "Net margins are negative",
      `Latest net margin reads ${formatSignedNumber(netMargin)}% from structured market data.`,
      netMargin >= 0 ? "positive" : "negative",
      ["finnhub"],
    ));
  }
  if (currentPe !== null && forwardPe !== null && forwardPe !== 0) {
    const compression = currentPe - forwardPe;
    signals.push(signal(
      "Forward multiple sits below the current market multiple",
      `Current P/E is ${currentPe.toFixed(1)}x versus forward P/E at ${forwardPe.toFixed(1)}x, a spread of ${compression.toFixed(1)} turns.`,
      compression >= 0 ? "positive" : "neutral",
      ["fmp", "finnhub"],
    ));
  }
  if (latestTarget?.upsidePercent !== null && latestTarget?.upsidePercent !== undefined) {
    signals.push(signal(
      latestTarget.upsidePercent >= 0 ? "Street target still implies upside" : "Street target implies downside",
      `Consensus target implies ${formatSignedNumber(latestTarget.upsidePercent)}% versus the current price.`,
      latestTarget.upsidePercent >= 0 ? "positive" : "negative",
      [latestTarget.source],
    ));
  }
  if (latestEarnings?.surprisePercent !== null && latestEarnings?.surprisePercent !== undefined) {
    signals.push(signal(
      latestEarnings.surprisePercent >= 0 ? "Latest earnings beat estimates" : "Latest earnings missed estimates",
      `${latestEarnings.period} posted a ${formatSignedNumber(latestEarnings.surprisePercent)}% earnings surprise.`,
      latestEarnings.surprisePercent >= 0 ? "positive" : "negative",
      ["finnhub"],
    ));
  }
  if (peerComparison.length > 0) {
    signals.push(signal(
      "Peer frame is now available",
      `Comparable names include ${peerComparison.slice(0, 3).map((peer) => peer.symbol).join(", ")}.`,
      "neutral",
      ["fmp"],
    ));
  }
  if (meaningfulInsiderFlow !== null) {
    signals.push(signal(
      meaningfulInsiderFlow.direction === "buy"
        ? "Meaningful insider buying is present"
        : "Meaningful insider selling is present",
      `Directional insider activity totals ${Math.abs(meaningfulInsiderFlow.totalShareChange).toLocaleString("en-US")} shares ${meaningfulInsiderFlow.direction === "buy" ? "bought" : "sold"} across ${meaningfulInsiderFlow.transactionCount} priced open-market filings, representing about ${Math.abs(meaningfulInsiderFlow.totalNotional).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`,
      meaningfulInsiderFlow.direction === "buy" ? "positive" : "negative",
      ["finnhub"],
    ));
  }
  return signals.slice(0, 6);
}

function buildCoverageGaps({
  waterfallResult,
  streetView,
  valuationView,
  peerComparison,
  earningsHighlights,
  insiderActivity,
}: CoverageGapParams): readonly CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const privateResearchOnly = isPrivateResearchOnly(waterfallResult);
  const companiesHouseProfile = waterfallResult.companiesHouse?.data.profile ?? null;
  const accountsFilings = waterfallResult.companiesHouse?.data.accountsFilings ?? [];
  const lastAccountsMadeUpTo =
    companiesHouseProfile?.accounts?.last_accounts?.made_up_to ?? null;
  const lastAccountsType = companiesHouseProfile?.accounts?.last_accounts?.type ?? null;
  const hasUkAccountsMetadata = lastAccountsMadeUpTo !== null || lastAccountsType !== null;
  const hasUkAccountsFiling = accountsFilings.length > 0;
  const exaDeep = waterfallResult.exaDeep?.data ?? null;
  const hasPrivateCapitalContext =
    exaDeep?.fundingTotal !== null || exaDeep?.lastValuation !== null;

  if (privateResearchOnly) {
    gaps.push(gap(
      "Primary private-company disclosure is limited",
      "The current read relies mainly on synthesized public-web research rather than management materials, primary company disclosures, or audited private-company reporting.",
      "high",
    ));

    if (exaDeep === null || exaDeep.estimatedRevenue === null) {
      gaps.push(gap(
        "Revenue scale is not yet verified",
        "No recent public revenue figure or estimate was attached, so mandate-fit and commercial scale cannot be underwritten cleanly.",
        "high",
      ));
    }

    if (!hasPrivateCapitalContext) {
      gaps.push(gap(
        "Valuation and financing context is thin",
        "Recent funding-round or valuation evidence is missing, which limits private-market downside framing.",
        "medium",
      ));
    }

    if (exaDeep === null || exaDeep.keyInvestors.length === 0) {
      gaps.push(gap(
        "Investor base is not yet corroborated",
        "The current evidence set does not clearly identify the investor syndicate, which reduces confidence in sponsorship quality and financing context.",
        "medium",
      ));
    }

    return gaps.slice(0, 6);
  }

  if (waterfallResult.secEdgar?.data.xbrlFacts === null || waterfallResult.secEdgar === null) {
    gaps.push(gap(
      "Primary filing detail is limited",
      waterfallResult.companiesHouse !== null
        ? hasUkAccountsMetadata || hasUkAccountsFiling
          ? "No structured SEC XBRL fact set was attached, and the UK registry currently supplies accounts metadata rather than parsed filing facts, so filing-backed financial analysis remains limited."
          : "No structured SEC XBRL fact set was attached, and UK registry evidence has not yet surfaced enough accounts metadata to support deeper filing-backed analysis."
        : "No structured SEC XBRL fact set was attached, so the note relies more heavily on market-data vendors than filing-backed financial statements.",
      "high",
    ));
  }
  if (waterfallResult.companiesHouse !== null && !hasUkAccountsMetadata) {
    gaps.push(gap(
      "UK accounts metadata is limited",
      "Companies House did not return a last-accounts made-up date or accounts type, so registry evidence is thinner than expected for a UK private-company read.",
      "medium",
    ));
  }
  if (waterfallResult.companiesHouse !== null && !hasUkAccountsFiling) {
    gaps.push(gap(
      "No recent UK accounts filing was attached",
      "Accounts filing history did not return a recent accounts entry, so deeper UK filing analysis would require document-level retrieval.",
      "low",
    ));
  }
  if (streetView?.priceTarget === null || streetView === null) {
    gaps.push(gap(
      "Target-price coverage is incomplete",
      "The report could not surface a live target-price range from the available analyst feeds.",
      "medium",
    ));
  }
  if (valuationView === null || valuationView.forwardEstimates.length === 0) {
    gaps.push(gap(
      "Forward estimate coverage is thin",
      "Forward revenue and EPS estimates were not available, which limits projected-multiple analysis.",
      "medium",
    ));
  }
  if (peerComparison.length === 0) {
    gaps.push(gap(
      "Peer comparison is unavailable",
      "No comparable-company set was returned, so relative valuation context is limited.",
      "medium",
    ));
  }
  if (earningsHighlights.length === 0) {
    gaps.push(gap(
      "No recent earnings signal set",
      "The earnings-surprise panel is empty, so near-term expectation tracking is weaker.",
      "low",
    ));
  }
  if (insiderActivity.length === 0) {
    gaps.push(gap(
      "Insider-activity coverage is absent",
      "No recent insider transactions were attached, so management-trading context is limited.",
      "low",
    ));
  }
  return gaps.slice(0, 6);
}

function buildDisagreementNotes({
  metrics,
  streetView,
  valuationView,
  earningsHighlights,
  newsSentiment,
  insiderActivity,
}: DisagreementNoteParams): readonly DisagreementNote[] {
  const notes: DisagreementNote[] = [];
  const latestEarnings = earningsHighlights[0];
  const consensusRating = streetView?.consensusRating?.toLowerCase() ?? null;
  const revenueGrowth = findMetricValue(metrics, "Revenue Growth");
  const currentPe =
    valuationView?.metrics.find((item) => item.label === "P/E")?.current ?? null;
  const historicalHigh =
    valuationView?.metrics.find((item) => item.label === "P/E")?.historicalHigh ?? null;
  const upsidePercent = streetView?.priceTarget?.upsidePercent ?? null;
  const meaningfulInsiderFlow = summarizeMeaningfulInsiderFlow(insiderActivity);

  if (
    latestEarnings?.surprisePercent !== null &&
    latestEarnings?.surprisePercent !== undefined &&
    latestEarnings.surprisePercent < 0 &&
    consensusRating === "buy"
  ) {
    notes.push(note(
      "Street optimism is surviving a recent miss",
      `Consensus remains Buy even though ${latestEarnings.period} missed by ${Math.abs(latestEarnings.surprisePercent).toFixed(1)}%.`,
      ["finnhub"],
    ));
  }
  if (revenueGrowth !== null && revenueGrowth < 0 && consensusRating === "buy") {
    notes.push(note(
      "Consensus is constructive despite weaker growth",
      `Revenue growth is running at ${revenueGrowth.toFixed(1)}%, yet recommendation data still skews bullish.`,
      ["finnhub"],
    ));
  }
  if (
    currentPe !== null &&
    historicalHigh !== null &&
    upsidePercent !== null &&
    upsidePercent > 0 &&
    currentPe >= historicalHigh * 0.95
  ) {
    notes.push(note(
      "Upside target coexists with a rich multiple",
      `Shares trade near the top of the observed P/E range (${currentPe.toFixed(1)}x versus historical high ${historicalHigh.toFixed(1)}x) while the Street still implies upside.`,
      ["fmp", "finnhub"],
    ));
  }
  if (meaningfulInsiderFlow?.direction === "sell" && consensusRating === "buy") {
    notes.push(note(
      "Insider flow is softer than Street sentiment",
      `Meaningful priced insider selling totals about ${Math.abs(meaningfulInsiderFlow.totalNotional).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} even as consensus remains constructive.`,
      ["finnhub"],
    ));
  }
  if (newsSentiment !== null && newsSentiment.label === "negative" && consensusRating === "buy") {
    notes.push(note(
      "News tone is weaker than Street positioning",
      `${newsSentiment.rationale} That sits awkwardly beside a Buy consensus.`,
      ["finnhub"],
    ));
  }
  return notes.slice(0, 4);
}

function buildSectionAudit({
  entityResolution,
  waterfallResult,
  metrics,
  streetView,
  valuationView,
  earningsHighlights,
  newsHighlights,
  coverageGaps,
  disagreementNotes,
}: SectionAuditParams): readonly SectionAuditItem[] {
  const valuationCoverage =
    valuationView?.metrics.filter(
      (item) =>
        item.current !== null ||
        item.historicalLow !== null ||
        item.historicalHigh !== null ||
        item.forward !== null,
    ).length ?? 0;
  const hasForwardEstimates = (valuationView?.forwardEstimates.length ?? 0) > 0;
  const financialMetricCount = metrics.length;
  const hasStreetConsensus = streetView?.latest !== null && streetView !== null;
  const hasStreetTarget = streetView?.priceTarget !== null && streetView !== null;
  const hasPrimaryFilings =
    waterfallResult.secEdgar?.data.xbrlFacts !== null &&
    waterfallResult.secEdgar !== null;
  const hasCompaniesHouseAccountsMetadata =
    waterfallResult.companiesHouse?.data.profile?.accounts?.last_accounts?.made_up_to !==
      undefined ||
    waterfallResult.companiesHouse?.data.profile?.accounts?.last_accounts?.type !==
      undefined ||
    (waterfallResult.companiesHouse?.data.accountsFilings.length ?? 0) > 0;
  const hasSecIdentityTriad = ["Ticker", "CIK", "Exchange"].every((label) =>
    entityResolution.identifiers.some((item) => item.label === label && item.source === "sec-edgar"),
  );

  const sectionAudit: SectionAuditItem[] = [
    audit(
      "Entity Resolution",
      entityResolution.primarySource === null
        ? "limited"
        : hasSecIdentityTriad
          ? "supported"
        : entityResolution.primarySource === "exa-deep"
          ? "partial"
          : entityResolution.matchedSources.length >= 2
            ? "supported"
            : "partial",
      hasSecIdentityTriad
        ? "SEC filing metadata provides a canonical company identity with ticker, CIK, and exchange alignment."
        : entityResolution.primarySource === "exa-deep"
        ? "Entity resolution is anchored by private-company research synthesis, but registry or filing corroboration is still limited."
        : entityResolution.matchedSources.length >= 2
        ? `Canonical entity is backed by ${entityResolution.matchedSources.length} corroborating sources.`
        : entityResolution.note,
      entityResolution.matchedSources,
    ),
    audit(
      "Company Overview",
      entityResolution.identifiers.length >= 4 ? "supported" : entityResolution.identifiers.length >= 2 ? "partial" : "limited",
      entityResolution.identifiers.length >= 4
        ? "Overview is anchored by multiple identifiers and legal-entity references."
        : "Overview relies on a thinner identifier set than the strongest cases.",
      entityResolution.matchedSources,
    ),
    audit(
      "Financial Analysis",
      hasPrimaryFilings || financialMetricCount >= 8
        ? "supported"
        : financialMetricCount >= 4 || (isPrivateResearchOnly(waterfallResult) && financialMetricCount >= 3)
          ? "partial"
          : "limited",
      hasPrimaryFilings
        ? "Primary filing facts and structured metrics support the financial-analysis section."
        : isPrivateResearchOnly(waterfallResult)
          ? `Financial analysis currently rests on ${financialMetricCount} structured private-company profile and funding metrics without filing-backed statements.`
          : `Financial analysis currently rests on ${financialMetricCount} structured metrics without full filing depth.`,
      [
        ...(waterfallResult.secEdgar !== null ? (["sec-edgar"] as const) : []),
        ...(waterfallResult.finnhub !== null ? (["finnhub"] as const) : []),
        ...(waterfallResult.fmp !== null ? (["fmp"] as const) : []),
        ...(hasCompaniesHouseAccountsMetadata ? (["companies-house"] as const) : []),
        ...(waterfallResult.exaDeep !== null ? (["exa-deep"] as const) : []),
        ...(waterfallResult.claudeFallback !== null ? (["claude-fallback"] as const) : []),
      ],
    ),
    audit(
      "Valuation",
      valuationCoverage >= 2 && hasForwardEstimates ? "supported" : valuationCoverage >= 1 || valuationView?.priceTargetFallback !== null ? "partial" : "limited",
      valuationCoverage >= 2 && hasForwardEstimates
        ? "Valuation has current, historical, and forward context."
        : valuationCoverage >= 1
          ? "Valuation has some structured coverage, but the historical/forward frame is incomplete."
          : "Valuation coverage is limited for this company.",
      [
        ...(waterfallResult.fmp !== null ? (["fmp"] as const) : []),
        ...(waterfallResult.finnhub !== null ? (["finnhub"] as const) : []),
      ],
    ),
    audit(
      "Street Consensus",
      hasStreetConsensus && (hasStreetTarget || hasForwardEstimates) ? "supported" : streetView !== null || earningsHighlights.length > 0 ? "partial" : "limited",
      hasStreetConsensus && (hasStreetTarget || hasForwardEstimates)
        ? "Consensus combines recommendations with target or forward-estimate context."
        : isPrivateResearchOnly(waterfallResult)
          ? "Street-consensus coverage is not expected for a private-company read; the section remains limited by design."
        : streetView !== null || earningsHighlights.length > 0
          ? "Street view is present, but some target/estimate detail is still thin."
          : "Street-consensus coverage is limited.",
      [
        ...(waterfallResult.finnhub !== null ? (["finnhub"] as const) : []),
        ...(waterfallResult.fmp !== null ? (["fmp"] as const) : []),
      ],
    ),
    audit(
      "Risk Factors",
      coverageGaps.length >= 2 || disagreementNotes.length > 0 ? "supported" : newsHighlights.length > 0 ? "partial" : "limited",
      coverageGaps.length >= 2 || disagreementNotes.length > 0
        ? "Risk factors are grounded in explicit data gaps and evidence tensions."
        : newsHighlights.length > 0
          ? "Risk framing is supported by recent news, but structured tensions are limited."
          : "Risk factors rely mostly on general narrative framing.",
      [
        ...(newsHighlights.length > 0 ? (["finnhub"] as const) : []),
        ...new Set(disagreementNotes.flatMap((item) => item.sources)),
      ],
    ),
    audit(
      "Catalysts & Outlook",
      earningsHighlights.length > 0 && (hasForwardEstimates || newsHighlights.length > 0)
        ? "supported"
        : earningsHighlights.length > 0 || hasForwardEstimates || newsHighlights.length > 0
          ? "partial"
          : "limited",
      earningsHighlights.length > 0 && (hasForwardEstimates || newsHighlights.length > 0)
        ? "Outlook has both event-driven and forward-estimate support."
        : earningsHighlights.length > 0 || hasForwardEstimates || newsHighlights.length > 0
          ? "Outlook has partial support from earnings, estimates, or recent headlines."
          : "Catalysts are thin because both event and estimate coverage are limited.",
      [
        ...(earningsHighlights.length > 0 ? (["finnhub"] as const) : []),
        ...(hasForwardEstimates ? (["fmp"] as const) : []),
        ...(newsHighlights.length > 0 ? (["finnhub"] as const) : []),
      ],
    ),
  ];
  return sectionAudit.map((item) => ({ ...item, sources: [...new Set(item.sources)] }));
}

export async function runAnalysis(query: string): Promise<AnalysisReport> {
  const marketStep = await runStep(
    "fetchMarketData",
    () => runWaterfall({ query }),
    EMPTY_WATERFALL_RESULT,
  );
  const waterfallResult = marketStep.data;
  const entityStep = await runStep(
    "resolveEntity",
    async () => buildEntityResolution(query, waterfallResult),
    buildEntityResolution(query, EMPTY_WATERFALL_RESULT),
  );
  const entityResolution = entityStep.data;
  const validationStep = await runStep(
    "validateResults",
    async () => validateWaterfall(waterfallResult),
    EMPTY_VALIDATION_REPORT,
  );
  const validationReport = validationStep.data;

  const confidence = computeConfidence(
    waterfallResult,
    entityResolution,
    validationReport,
  );
  const metrics = assembleMetrics(waterfallResult);
  const analystConsensus = extractConsensus(waterfallResult);
  const streetView = buildStreetView(waterfallResult);
  const valuationView = buildValuationView(waterfallResult);
  const peerComparison = buildPeerComparison(waterfallResult);
  const earningsHighlights = extractEarningsHighlights(waterfallResult);
  const insiderActivity = extractInsiderActivity(waterfallResult);
  const newsHighlights = extractNewsHighlights(waterfallResult);
  const newsSentiment = buildNewsSentimentSummary(newsHighlights);
  const recentDevelopments =
    newsHighlights.length > 0
      ? buildRecentDevelopments(entityResolution.displayName, newsHighlights)
      : buildPrivateResearchDevelopments(
          entityResolution.displayName,
          waterfallResult.exaDeep?.data.recentNews ?? null,
          new Date().toISOString(),
        );
  const evidenceSignals = buildEvidenceSignals({
    waterfallResult,
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    newsSentiment,
    peerComparison,
    insiderActivity,
  });
  const coverageGaps = buildCoverageGaps({
    waterfallResult,
    streetView,
    valuationView,
    peerComparison,
    earningsHighlights,
    insiderActivity,
  });
  const disagreementNotes = buildDisagreementNotes({
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    newsSentiment,
    insiderActivity,
  });
  const sectionAudit = buildSectionAudit({
    entityResolution,
    waterfallResult,
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    newsHighlights,
    coverageGaps,
    disagreementNotes,
  });
  const memoContext = {
    company: entityResolution.displayName,
    entityResolution,
    waterfallResult,
    validationReport,
    confidence,
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    newsHighlights,
    evidenceSignals,
    coverageGaps,
    disagreementNotes,
    sectionAudit,
  } as const;
  const draftStep = await runStep(
    "generateDraftMemo",
    () => runMemoAgent(memoContext),
    EMPTY_MEMO_RESULT,
  );
  const challengeStep = await runStep(
    "challengeMemo",
    () =>
      runChallengerAgent({
        company: entityResolution.displayName,
        draftMemo: draftStep.data.investmentMemo,
        waterfallResult,
        validationReport,
        metrics,
        evidenceSignals,
        coverageGaps,
        disagreementNotes,
        sectionAudit,
      }),
    emptyChallengerReport(),
  );
  const finalStep = await runStep(
    "generateFinalMemo",
    () => runMemoAgent({ ...memoContext, challengerReport: challengeStep.data }),
    EMPTY_MEMO_RESULT,
  );

  const totalMs =
    marketStep.ms +
    entityStep.ms +
    validationStep.ms +
    draftStep.ms +
    challengeStep.ms +
    finalStep.ms;
  console.info("[orchestrator] runAnalysis complete", { query, totalMs });

  const finalCoverageGaps = appendChallengerCoverageGaps(
    coverageGaps,
    challengeStep.data,
  );
  const finalDisagreementNotes = appendChallengerDisagreementNotes(
    disagreementNotes,
    challengeStep.data,
  );
  const finalSectionAudit = buildSectionAudit({
    entityResolution,
    waterfallResult,
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    newsHighlights,
    coverageGaps: finalCoverageGaps,
    disagreementNotes: finalDisagreementNotes,
  });
  const investmentMemo = finalStep.data.investmentMemo;
  const summary =
    investmentMemo.verdict.trim().length === 0
      ? "No analysis data available."
      : investmentMemo.verdict;

  return {
    company: entityResolution.displayName,
    entityResolution,
    summary,
    investmentMemo,
    narrative: finalStep.data.narrative,
    sections: finalStep.data.sections,
    confidence,
    metrics,
    analystConsensus,
    streetView,
    valuationView,
    peerComparison,
    earningsHighlights,
    insiderActivity,
    deltas: [],
    evidenceSignals,
    coverageGaps: finalCoverageGaps,
    disagreementNotes: finalDisagreementNotes,
    sectionAudit: finalSectionAudit,
    validationReport,
    newsHighlights,
    newsSentiment,
    recentDevelopments,
    sources: waterfallResult.activeSources,
    isAmbiguous: waterfallResult.finnhub?.data.isAmbiguous ?? false,
    updatedAt: new Date().toISOString(),
  };
}
