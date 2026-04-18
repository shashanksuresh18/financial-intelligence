import { runAnalysis } from "@/lib/agents/orchestrator";
import { runWaterfall } from "@/lib/agents/market-data-agent";
import type { AnalysisReport, ReportDelta, SectionAuditItem } from "@/lib/types";

export { runWaterfall };

function getSectionStatusScore(status: SectionAuditItem["status"]): number {
  switch (status) {
    case "supported":
      return 2;
    case "partial":
      return 1;
    case "limited":
      return 0;
    default:
      return 0;
  }
}

function getSectionAuditSummary(
  items: readonly SectionAuditItem[],
): { supported: number; partial: number; limited: number; score: number } {
  return items.reduce(
    (summary, item) => ({
      supported: summary.supported + (item.status === "supported" ? 1 : 0),
      partial: summary.partial + (item.status === "partial" ? 1 : 0),
      limited: summary.limited + (item.status === "limited" ? 1 : 0),
      score: summary.score + getSectionStatusScore(item.status),
    }),
    { supported: 0, partial: 0, limited: 0, score: 0 },
  );
}

function deltaToneFromChange(change: number): ReportDelta["tone"] {
  if (change > 0) {
    return "positive";
  }
  if (change < 0) {
    return "negative";
  }
  return "neutral";
}

function compareReports(
  previousReport: AnalysisReport | null | undefined,
  currentReport: AnalysisReport,
): readonly ReportDelta[] {
  if (previousReport === null || previousReport === undefined) {
    return [
      {
        title: "First structured run",
        detail:
          "No previous cached report was available, so this run establishes the baseline evidence set.",
        tone: "neutral",
      },
    ];
  }

  const deltas: ReportDelta[] = [];
  const confidenceChange =
    currentReport.confidence.score - previousReport.confidence.score;

  if (confidenceChange !== 0) {
    deltas.push({
      title: "Confidence changed",
      detail: `Confidence moved from ${previousReport.confidence.score}/100 to ${currentReport.confidence.score}/100.`,
      tone: deltaToneFromChange(confidenceChange),
    });
  }

  const metricChange = currentReport.metrics.length - previousReport.metrics.length;

  if (metricChange !== 0) {
    deltas.push({
      title: "Metric coverage changed",
      detail: `Structured metric count moved from ${previousReport.metrics.length} to ${currentReport.metrics.length}.`,
      tone: deltaToneFromChange(metricChange),
    });
  }

  const peerCoverageChange =
    currentReport.peerComparison.length - previousReport.peerComparison.length;

  if (peerCoverageChange !== 0) {
    deltas.push({
      title: "Peer coverage changed",
      detail: `Comparable-company rows moved from ${previousReport.peerComparison.length} to ${currentReport.peerComparison.length}.`,
      tone: deltaToneFromChange(peerCoverageChange),
    });
  }

  const currentStreet = currentReport.streetView?.latest;
  const previousStreet = previousReport.streetView?.latest;

  if (currentStreet !== null && currentStreet !== undefined) {
    const bullishChange = currentStreet.bullish - (previousStreet?.bullish ?? 0);
    const neutralChange = currentStreet.neutral - (previousStreet?.neutral ?? 0);
    const bearishChange = currentStreet.bearish - (previousStreet?.bearish ?? 0);

    if (
      previousStreet === undefined ||
      bullishChange !== 0 ||
      neutralChange !== 0 ||
      bearishChange !== 0
    ) {
      deltas.push({
        title: "Street stance shifted",
        detail:
          previousStreet === undefined
            ? `Street consensus is now available for ${currentStreet.period}: ${currentStreet.bullish} bullish / ${currentStreet.neutral} hold / ${currentStreet.bearish} bearish.`
            : `Vs prior run, bullish ${bullishChange >= 0 ? "+" : ""}${bullishChange}, hold ${neutralChange >= 0 ? "+" : ""}${neutralChange}, bearish ${bearishChange >= 0 ? "+" : ""}${bearishChange}.`,
        tone:
          bullishChange > bearishChange
            ? "positive"
            : bearishChange > bullishChange
              ? "negative"
              : "neutral",
      });
    }
  }

  const currentTarget = currentReport.streetView?.priceTarget?.targetMean ?? null;
  const previousTarget = previousReport.streetView?.priceTarget?.targetMean ?? null;

  if (currentTarget !== previousTarget) {
    deltas.push({
      title: "Target-price context changed",
      detail:
        currentTarget === null
          ? "Mean target-price coverage is no longer available."
          : previousTarget === null
            ? `Mean target-price coverage is now available at ${currentTarget.toFixed(2)}.`
            : `Mean target moved from ${previousTarget.toFixed(2)} to ${currentTarget.toFixed(2)}.`,
      tone:
        currentTarget === null || previousTarget === null
          ? "neutral"
          : deltaToneFromChange(currentTarget - previousTarget),
    });
  }

  const currentEarnings = currentReport.earningsHighlights[0];
  const previousEarnings = previousReport.earningsHighlights[0];

  if (
    currentEarnings !== undefined &&
    (previousEarnings === undefined ||
      currentEarnings.period !== previousEarnings.period ||
      currentEarnings.surprisePercent !== previousEarnings.surprisePercent)
  ) {
    deltas.push({
      title: "Latest earnings signal updated",
      detail:
        currentEarnings.surprisePercent === null
          ? `Latest earnings period is ${currentEarnings.period}, but the surprise percentage is unavailable.`
          : `Latest earnings period ${currentEarnings.period} carries a ${currentEarnings.surprisePercent.toFixed(
              1,
            )}% surprise.`,
      tone:
        currentEarnings.surprisePercent === null
          ? "neutral"
          : deltaToneFromChange(currentEarnings.surprisePercent),
    });
  }

  const currentValuationRows =
    currentReport.valuationView?.metrics.filter(
      (item) =>
        item.current !== null ||
        item.historicalLow !== null ||
        item.historicalHigh !== null ||
        item.forward !== null,
    ).length ?? 0;
  const previousValuationRows =
    previousReport.valuationView?.metrics.filter(
      (item) =>
        item.current !== null ||
        item.historicalLow !== null ||
        item.historicalHigh !== null ||
        item.forward !== null,
    ).length ?? 0;

  if (currentValuationRows !== previousValuationRows) {
    deltas.push({
      title: "Valuation coverage changed",
      detail: `Valuation rows with usable data moved from ${previousValuationRows} to ${currentValuationRows}.`,
      tone: deltaToneFromChange(currentValuationRows - previousValuationRows),
    });
  }

  const currentAuditSummary = getSectionAuditSummary(currentReport.sectionAudit);
  const previousAuditSummary = getSectionAuditSummary(previousReport.sectionAudit);

  if (currentAuditSummary.score !== previousAuditSummary.score) {
    deltas.push({
      title: "Section support quality changed",
      detail:
        `Audit score moved from ${previousAuditSummary.score} to ${currentAuditSummary.score}; ` +
        `${currentAuditSummary.supported} supported / ${currentAuditSummary.partial} partial / ${currentAuditSummary.limited} limited sections on the latest run.`,
      tone: deltaToneFromChange(currentAuditSummary.score - previousAuditSummary.score),
    });
  }

  const sectionStatusChanges = currentReport.sectionAudit
    .map((item) => {
      const previousItem = previousReport.sectionAudit.find(
        (candidate) => candidate.section === item.section,
      );

      if (previousItem === undefined || previousItem.status === item.status) {
        return null;
      }

      return {
        section: item.section,
        previousStatus: previousItem.status,
        currentStatus: item.status,
        scoreChange:
          getSectionStatusScore(item.status) -
          getSectionStatusScore(previousItem.status),
      };
    })
    .filter(
      (
        item,
      ): item is {
        section: SectionAuditItem["section"];
        previousStatus: SectionAuditItem["status"];
        currentStatus: SectionAuditItem["status"];
        scoreChange: number;
      } => item !== null,
    );

  if (sectionStatusChanges.length > 0) {
    const detail = sectionStatusChanges
      .slice(0, 3)
      .map(
        (item) =>
          `${item.section}: ${item.previousStatus} -> ${item.currentStatus}`,
      )
      .join("; ");
    const netChange = sectionStatusChanges.reduce(
      (total, item) => total + item.scoreChange,
      0,
    );

    deltas.push({
      title: "Section audit statuses shifted",
      detail:
        sectionStatusChanges.length > 3
          ? `${detail}; plus ${sectionStatusChanges.length - 3} more section changes.`
          : detail,
      tone: deltaToneFromChange(netChange),
    });
  }

  return deltas.length > 0
    ? deltas
    : [
        {
          title: "No material change detected",
          detail:
            "The latest run is broadly consistent with the previous cached report.",
          tone: "neutral",
        },
      ];
}

export async function analyzeCompany(query: string): Promise<AnalysisReport> {
  return runAnalysis(query);
}

export function attachReportDeltas(
  previousReport: AnalysisReport | null | undefined,
  currentReport: AnalysisReport,
): AnalysisReport {
  return {
    ...currentReport,
    deltas: compareReports(previousReport, currentReport),
  };
}
