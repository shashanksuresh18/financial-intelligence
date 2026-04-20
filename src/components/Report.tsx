import type { JSX } from "react";

import type {
  AnalysisReport,
  DataSource,
  FinancialMetric,
  ResearchNoteSection,
  SectionAuditItem,
} from "@/lib/types";

import AnalystConsensus from "./AnalystConsensus";
import ConfidenceBreakdown from "./ConfidenceBreakdown";
import EntityResolutionPanel from "./EntityResolutionPanel";
import EarningsHighlightsPanel from "./EarningsHighlightsPanel";
import InsiderActivityPanel from "./InsiderActivityPanel";
import InvestmentMemoPanel from "./InvestmentMemoPanel";
import PeerComparisonPanel from "./PeerComparisonPanel";
import RecentNewsPanel from "./RecentNewsPanel";
import ResearchOpsPanel from "./ResearchOpsPanel";
import ReportDeltaPanel from "./ReportDeltaPanel";
import SectionAuditPanel from "./SectionAuditPanel";
import StreetViewPanel from "./StreetViewPanel";
import ValuationOverviewPanel from "./ValuationOverviewPanel";

type ReportProps = {
  readonly report: AnalysisReport;
  readonly onRefresh?: () => void;
  readonly isRefreshing?: boolean;
};

type MetricCard = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly period: string | null;
  readonly sourceLabel: string;
  readonly deltaPercent: number | null;
};

const SECTION_AUDIT_STYLES: Record<SectionAuditItem["status"], string> = {
  supported: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  partial: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  limited: "border-rose-400/20 bg-rose-400/10 text-rose-300",
};

const NOTE_SECTION_TO_AUDIT_SECTION: Partial<
  Record<ResearchNoteSection["title"], SectionAuditItem["section"]>
> = {
  "Company Overview": "Company Overview",
  "Financial Analysis": "Financial Analysis",
  Valuation: "Valuation",
  "Street Consensus": "Street Consensus",
  "Risk Factors": "Risk Factors",
  "Catalysts & Outlook": "Catalysts & Outlook",
};

const SOURCE_DETAILS: Record<
  DataSource,
  { readonly label: string; readonly note: string }
> = {
  finnhub: {
    label: "Finnhub",
    note: "Market pricing, valuation metrics, analyst recommendation data, earnings history, and insider activity.",
  },
  fmp: {
    label: "FMP",
    note: "Historical multiples, forward estimates, peer comparison, enterprise values, and price-target consensus.",
  },
  "sec-edgar": {
    label: "SEC EDGAR",
    note: "Primary US filing data and XBRL financial facts.",
  },
  "companies-house": {
    label: "Companies House",
    note: "UK registry records, corporate status, company-profile metadata, and recent accounts filing history.",
  },
  gleif: {
    label: "GLEIF",
    note: "Global entity identity and legal registration metadata.",
  },
  "exa-deep": {
    label: "Exa Deep",
    note: "Private-company web research synthesized into structured company, funding, valuation, investor, competitor, and recent-news fields.",
  },
  "claude-fallback": {
    label: "Claude Fallback",
    note: "AI web-search enrichment for public-web company facts and hard-to-source private-company metrics. Verify figures against primary filings.",
  },
};

const SOURCE_ORDER: readonly DataSource[] = [
  "sec-edgar",
  "finnhub",
  "fmp",
  "companies-house",
  "gleif",
  "exa-deep",
  "claude-fallback",
];

const SOURCE_LABELS: Record<DataSource, string> = {
  finnhub: "Finnhub",
  fmp: "FMP",
  "sec-edgar": "SEC EDGAR",
  "companies-house": "Companies House",
  gleif: "GLEIF",
  "exa-deep": "Exa Deep",
  "claude-fallback": "Claude Fallback",
};

const RECOMMENDATION_STYLES: Record<
  AnalysisReport["investmentMemo"]["recommendation"],
  string
> = {
  buy: "border-emerald-400/25 bg-emerald-950/40 text-emerald-200",
  watch: "border-blue-400/25 bg-blue-950/40 text-blue-200",
  hold: "border-amber-400/25 bg-amber-950/40 text-amber-200",
  avoid: "border-rose-400/25 bg-rose-950/40 text-rose-200",
};

const COVERAGE_STYLES: Record<string, string> = {
  "Strong Public":
    "border-emerald-400/25 bg-gradient-to-r from-emerald-500/25 via-emerald-400/20 to-emerald-300/10 text-emerald-100",
  "Registry-led":
    "border-amber-400/25 bg-gradient-to-r from-amber-500/25 via-amber-400/20 to-amber-300/10 text-amber-100",
  "Limited Private":
    "border-amber-500/25 bg-gradient-to-r from-amber-950/75 via-amber-900/55 to-zinc-900 text-amber-100",
  Thin: "border-zinc-700 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-zinc-100",
  "Ambiguous Entity":
    "border-rose-400/25 bg-gradient-to-r from-rose-950/75 via-rose-900/55 to-zinc-900 text-rose-100",
};

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

const DECIMAL_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const CURRENCY_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  style: "currency",
});

const COMPACT_CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

function getNarrativeParagraphs(narrative: string): readonly string[] {
  const paragraphs = narrative
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return paragraphs.length > 0 ? paragraphs : ["No narrative is available for this company yet."];
}

function formatUpdatedAt(updatedAt: string): string {
  const parsed = new Date(updatedAt);

  if (Number.isNaN(parsed.getTime())) {
    return updatedAt;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function normalizeSectionLabel(value: string): string {
  return value.trim().toUpperCase();
}

function getSectionAuditMatch(
  title: ResearchNoteSection["title"],
  items: readonly SectionAuditItem[],
): SectionAuditItem | null {
  const mappedSection = NOTE_SECTION_TO_AUDIT_SECTION[title];

  if (mappedSection === undefined) {
    return null;
  }

  return (
    items.find(
      (item) => normalizeSectionLabel(item.section) === normalizeSectionLabel(mappedSection),
    ) ?? null
  );
}

function getIdentifierValue(
  report: AnalysisReport,
  label: "Ticker" | "Exchange",
): string | null {
  return (
    report.entityResolution.identifiers.find((identifier) => identifier.label === label)?.value ??
    null
  );
}

function formatPercentValue(value: number): string {
  if (Math.abs(value) <= 1) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 1,
      style: "percent",
    }).format(value);
  }

  return `${DECIMAL_NUMBER_FORMATTER.format(value)}%`;
}

function formatMetricValue(metric: FinancialMetric): string {
  const { format, value } = metric;

  if (value === null) {
    return "-";
  }

  if (typeof value === "string") {
    return value;
  }

  if (format === "percent") {
    return formatPercentValue(value);
  }

  if (format === "currency") {
    if (Math.abs(value) >= 1000) {
      return COMPACT_CURRENCY_FORMATTER.format(value);
    }

    return CURRENCY_NUMBER_FORMATTER.format(value);
  }

  if (Math.abs(value) >= 1000) {
    return COMPACT_NUMBER_FORMATTER.format(value);
  }

  return DECIMAL_NUMBER_FORMATTER.format(value);
}

function formatMarketCap(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return COMPACT_CURRENCY_FORMATTER.format(value);
}

function buildMetricCards(metrics: readonly FinancialMetric[]): readonly MetricCard[] {
  const groupedMetrics = new Map<string, FinancialMetric[]>();

  for (const metric of metrics) {
    const existing = groupedMetrics.get(metric.label) ?? [];
    groupedMetrics.set(metric.label, [...existing, metric]);
  }

  return Array.from(groupedMetrics.entries()).map(([label, metricGroup]) => {
    const primaryMetric = metricGroup[0];
    const numericMetrics = metricGroup.filter(
      (metric): metric is FinancialMetric & { readonly value: number } =>
        typeof metric.value === "number",
    );

    const currentMetric = numericMetrics[0] ?? null;
    const priorMetric = numericMetrics[1] ?? null;
    const deltaPercent =
      currentMetric !== null &&
      priorMetric !== null &&
      priorMetric.value !== 0
        ? ((currentMetric.value - priorMetric.value) / Math.abs(priorMetric.value)) * 100
        : null;

    return {
      key: `${label}-${primaryMetric.period ?? "na"}-${primaryMetric.source ?? "unknown"}`,
      label,
      value: formatMetricValue(primaryMetric),
      period: primaryMetric.period ?? null,
      sourceLabel: primaryMetric.source ? SOURCE_LABELS[primaryMetric.source] : "Unattributed",
      deltaPercent,
    };
  });
}

function renderConfidenceStars(level: AnalysisReport["confidence"]["level"]): readonly JSX.Element[] {
  const filledCount = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const filledClass =
    level === "high" ? "text-emerald-300" : level === "medium" ? "text-amber-300" : "text-zinc-300";

  return Array.from({ length: 3 }, (_, index) => (
    <span
      aria-hidden="true"
      className={index < filledCount ? filledClass : "text-zinc-700"}
      key={`${level}-${index}`}
    >
      {index < filledCount ? "★" : "☆"}
    </span>
  ));
}

export function Report({
  report,
  onRefresh,
  isRefreshing = false,
}: ReportProps) {
  const narrativeParagraphs = getNarrativeParagraphs(report.narrative);
  const ticker = getIdentifierValue(report, "Ticker");
  const exchange = getIdentifierValue(report, "Exchange");
  const marketCap = formatMarketCap(report.valuationView?.marketCap ?? null);
  const metricCards = buildMetricCards(report.metrics);
  const coverageStyle =
    COVERAGE_STYLES[report.validationReport.coverageLabel] ?? COVERAGE_STYLES.Thin;

  return (
    <section className="fi-fade-in overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950/78 shadow-[0_32px_120px_-60px_rgba(15,23,42,1)]">
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-950 to-emerald-950/20 px-6 py-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Company Report</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-100">
              {report.company}
            </h2>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {ticker ? (
                <span className="rounded-full border border-blue-400/20 bg-blue-950/40 px-3 py-1 text-xs uppercase tracking-[0.18em] text-blue-200">
                  {ticker}
                </span>
              ) : null}
              {exchange ? (
                <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-300">
                  {exchange}
                </span>
              ) : null}
              {marketCap ? (
                <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-300">
                  Market Cap {marketCap}
                </span>
              ) : null}
            </div>

            <p className="mt-5 max-w-3xl text-sm font-light leading-relaxed text-zinc-300">
              {report.summary}
            </p>
          </div>

          <div className="xl:max-w-md xl:text-right">
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <span
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${RECOMMENDATION_STYLES[report.investmentMemo.recommendation]}`}
              >
                {report.investmentMemo.recommendation[0]?.toUpperCase()}
                {report.investmentMemo.recommendation.slice(1)}
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-300">
                {report.investmentMemo.conviction} conviction
              </span>
            </div>

            <div className="mt-5">
              <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Confidence</p>
              <div
                aria-label={`${report.confidence.level} confidence`}
                className="mt-2 flex items-center gap-1 text-xl xl:justify-end"
              >
                {renderConfidenceStars(report.confidence.level)}
              </div>
              <p className="mt-2 text-sm font-light text-zinc-400">
                {report.confidence.score}/100 confidence score
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-zinc-800/80 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${coverageStyle}`}>
              {report.validationReport.coverageLabel}
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
              {report.sources.length} active sources
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
              {report.validationReport.dataQualityScore} data quality
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Last refreshed {formatUpdatedAt(report.updatedAt)}
            </p>
            {onRefresh ? (
              <button
                className="fi-focus-ring fi-interactive rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-emerald-200 hover:border-emerald-300/35 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRefreshing}
                onClick={onRefresh}
                type="button"
              >
                {isRefreshing ? "Refreshing..." : "Refresh Analysis"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        <InvestmentMemoPanel memo={report.investmentMemo} />

        <details
          className="group rounded-[2rem] border border-zinc-800 bg-zinc-900/45 p-6"
          open
        >
          <summary className="fi-interactive flex cursor-pointer list-none flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Supporting Evidence</p>
              <h3 className="mt-3 text-2xl font-semibold text-zinc-100">
                Audit Trail And Evidence Stack
              </h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
                Auditability, valuation context, Street detail, entity resolution, and confidence mechanics.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
              <span>{report.metrics.length} metrics</span>
              <span>{report.sources.length} sources</span>
              <span className="transition group-open:rotate-180">v</span>
            </div>
          </summary>

          <div className="mt-6 space-y-6">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${coverageStyle}`}>
                    {report.validationReport.coverageLabel}
                  </span>
                  <h4 className="mt-4 text-2xl font-semibold text-zinc-100">Financial And Source Coverage</h4>
                  <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
                    Evidence quality score {report.validationReport.dataQualityScore}/100 with a current memo assembled from {report.sources.length} active source
                    {report.sources.length === 1 ? "" : "s"}.
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Refreshed</p>
                  <p className="mt-2 text-sm font-medium text-zinc-100">
                    {formatUpdatedAt(report.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {metricCards.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-8 text-sm font-light text-zinc-500 md:col-span-2 xl:col-span-3">
                    No financial metrics are available for this company yet.
                  </div>
                ) : (
                  metricCards.map((metricCard) => {
                    const isPositive = (metricCard.deltaPercent ?? 0) >= 0;

                    return (
                      <article
                        className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4"
                        key={metricCard.key}
                      >
                        <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
                          {metricCard.label}
                        </p>
                        <p className="mt-3 text-2xl font-semibold text-zinc-100">
                          {metricCard.value}
                        </p>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                              {metricCard.period ?? "Current"}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-600">
                              {metricCard.sourceLabel}
                            </p>
                          </div>
                          {metricCard.deltaPercent !== null ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                isPositive ? "text-emerald-300" : "text-rose-300"
                              }`}
                            >
                              {isPositive ? "↑" : "↓"} {DECIMAL_NUMBER_FORMATTER.format(Math.abs(metricCard.deltaPercent))}%
                            </span>
                          ) : (
                            <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                              No YoY delta
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              <div className="mt-6">
                <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Data Source Attribution</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SOURCE_ORDER.map((source) => {
                    const isActive = report.sources.includes(source);

                    return (
                      <div className="group relative" key={source}>
                        <button
                          aria-label={`${SOURCE_DETAILS[source].label} ${isActive ? "active" : "inactive"} source`}
                          className={`fi-focus-ring fi-interactive rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.18em] ${
                            isActive
                              ? "border-emerald-400/25 text-emerald-200"
                              : "border-zinc-800 text-zinc-500 opacity-60"
                          }`}
                          title={`${SOURCE_DETAILS[source].label} • ${isActive ? "Active" : "Inactive"} • ${formatUpdatedAt(report.updatedAt)}`}
                          type="button"
                        >
                          {SOURCE_DETAILS[source].label}
                        </button>
                        <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3 text-left opacity-0 shadow-[0_20px_50px_-35px_rgba(0,0,0,0.95)] transition group-hover:opacity-100 group-focus-within:opacity-100">
                          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                            {isActive ? "Active in current memo" : "Inactive this run"}
                          </p>
                          <p className="mt-2 text-xs font-light leading-relaxed text-zinc-300">
                            {SOURCE_DETAILS[source].note}
                          </p>
                          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                            Freshness {formatUpdatedAt(report.updatedAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(24rem,1fr)]">
              <div className="space-y-6">
                <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
                        Supporting Analyst Note
                      </p>
                      <h4 className="mt-3 text-2xl font-semibold text-zinc-100">
                        Narrative Synthesis
                      </h4>
                      <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
                        Narrative synthesis from the grounded evidence stack.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {report.sections.length > 0 ? (
                      report.sections.map((section) => {
                        const audit = getSectionAuditMatch(section.title, report.sectionAudit);

                        return (
                          <div key={`${section.title}-${section.body}`}>
                            <div className="flex items-center justify-between gap-3">
                              <h5 className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                                {section.title}
                              </h5>
                              {audit !== null ? (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${SECTION_AUDIT_STYLES[audit.status]}`}
                                  title={audit.note}
                                >
                                  {audit.status}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 space-y-4 text-sm font-light leading-relaxed text-zinc-300">
                              {getNarrativeParagraphs(section.body).map((paragraph, index) => (
                                <p key={`${section.title}-${index}-${paragraph}`}>{paragraph}</p>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="space-y-4 text-sm font-light leading-relaxed text-zinc-300">
                        {narrativeParagraphs.map((paragraph, index) => (
                          <p key={`${index}-${paragraph}`}>{paragraph}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <ResearchOpsPanel
                  coverageGaps={report.coverageGaps}
                  disagreementNotes={report.disagreementNotes}
                  evidenceSignals={report.evidenceSignals}
                />
                <ValuationOverviewPanel valuationView={report.valuationView} />
                <PeerComparisonPanel items={report.peerComparison} />
                <ReportDeltaPanel items={report.deltas} />
                <RecentNewsPanel items={report.newsHighlights} />
              </div>

              <div className="space-y-6">
                <StreetViewPanel streetView={report.streetView} />
                <AnalystConsensus items={report.analystConsensus} />
                <EarningsHighlightsPanel items={report.earningsHighlights} />
                <InsiderActivityPanel items={report.insiderActivity} />
                <EntityResolutionPanel entityResolution={report.entityResolution} />
                <ConfidenceBreakdown confidence={report.confidence} />
                <SectionAuditPanel items={report.sectionAudit} />
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

export default Report;
