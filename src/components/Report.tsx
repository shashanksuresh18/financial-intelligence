"use client";

import { type JSX, type ReactNode, useState } from "react";

import type {
  AnalysisReport,
  DataSource,
  FinancialMetric,
  InvestmentMemo,
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
import RecentDevelopmentsPanel from "./RecentDevelopmentsPanel";
import RecentNewsPanel from "./RecentNewsPanel";
import RecommendationLegendInfo from "./RecommendationLegendInfo";
import ResearchOpsPanel from "./ResearchOpsPanel";
import ReportDeltaPanel from "./ReportDeltaPanel";
import SectionInfoTooltip from "./SectionInfoTooltip";
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

const ROLE_STYLES: Record<AnalysisReport["investmentMemo"]["role"], string> = {
  "Core target": "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  "Reference public comp": "border-sky-400/20 bg-sky-400/10 text-sky-200",
  "Private diligence": "border-violet-400/20 bg-violet-400/10 text-violet-200",
  "Watchlist candidate": "border-zinc-700 bg-zinc-900 text-zinc-300",
  "Entity resolution case": "border-rose-400/20 bg-rose-400/10 text-rose-200",
};

const MANDATE_FIT_STYLES: Record<
  AnalysisReport["investmentMemo"]["mandateFit"],
  string
> = {
  "Aligned mandate": "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  "Borderline mandate fit": "border-amber-400/20 bg-amber-400/10 text-amber-200",
  "Out of mandate": "border-sky-400/20 bg-sky-400/10 text-sky-200",
  "n/a â€” benchmark territory": "border-sky-400/20 bg-sky-400/10 text-sky-200",
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

  if (metric.label === "Market Cap (USDm)" || metric.label === "Enterprise Value (USDm)") {
    return COMPACT_CURRENCY_FORMATTER.format(value * 1_000_000);
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

function titleCase(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function getSourceStatusLabel(isActive: boolean): string {
  return isActive ? "Active in current memo" : "Inactive this run";
}

function hasDepthMemoView(memo: InvestmentMemo): boolean {
  return [
    "thesisDrivers",
    "pricedInAnalysis",
    "comparablesAnchor",
    "bullCase",
    "bearCase",
    "whatWouldChangeTheCall",
  ].some((key) => Object.prototype.hasOwnProperty.call(memo, key));
}

function MemoSectionCard({
  eyebrow,
  title,
  children,
  className = "",
  infoText,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly infoText?: string;
}) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">{eyebrow}</p>
        {infoText ? <SectionInfoTooltip content={infoText} /> : null}
      </div>
      <h4 className="mt-3 text-2xl font-semibold text-zinc-100">{title}</h4>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MemoStringList({
  emptyText,
  items,
}: {
  readonly emptyText: string;
  readonly items: readonly string[];
}) {
  if (items.length === 0) {
    return <p className="text-sm font-light leading-relaxed text-zinc-500">{emptyText}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm font-light leading-relaxed text-zinc-300"
          key={item}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function formatOptionalMultiple(value: number | null): string {
  return value === null ? "-" : `${DECIMAL_NUMBER_FORMATTER.format(value)}x`;
}

function formatOptionalPercent(value: number | null): string {
  return value === null ? "-" : formatPercentValue(value);
}

function renderDepthMemoPanel(memo: InvestmentMemo): JSX.Element {
  const thesisDrivers = memo.thesisDrivers ?? [];
  const bullCase = memo.bullCase;
  const bearCase = memo.bearCase;
  const changeCriteria = memo.whatWouldChangeTheCall ?? [];
  const comparablesAnchor = memo.comparablesAnchor ?? null;
  const pricedInAnalysis = memo.pricedInAnalysis ?? null;

  return (
    <section className="fi-fade-in space-y-6">
      <section className="rounded-[2rem] border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900/80 to-emerald-950/10 p-6 shadow-[0_26px_80px_-44px_rgba(0,0,0,0.98)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Investment Memo</p>
              <SectionInfoTooltip
                content="The new memo schema turns the output into driver-based arguments, priced-in framing, and typed change-of-view criteria rather than only prose sections."
              />
            </div>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
              {memo.verdict}
            </h3>
            <p className="mt-4 text-sm font-light leading-relaxed text-zinc-400">
              {memo.convictionSummary}
            </p>
          </div>

          {memo.mandateRationale ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 xl:max-w-md">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Mandate rationale</p>
                <SectionInfoTooltip
                  align="end"
                  content="Why the memo assigned this mandate-fit label, and when relevant, what benchmark value the name still has."
                />
              </div>
              <p className="mt-3 text-sm font-light leading-relaxed text-zinc-300">
                {memo.mandateRationale.reasoning}
              </p>
              {memo.mandateRationale.benchmarkValue ? (
                <p className="mt-3 text-sm font-light leading-relaxed text-sky-200">
                  {memo.mandateRationale.benchmarkValue}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <MemoSectionCard
          className="border-l-4 border-l-emerald-400/45"
          eyebrow="Timing"
          infoText="Why the name matters now based on the current evidence stack. This should be timing context, not a restatement of the company description."
          title="Why Now"
        >
          <MemoStringList
            emptyText="No time-sensitive setup was extracted on this run."
            items={memo.whyNow}
          />
        </MemoSectionCard>

        <MemoSectionCard
          eyebrow="What's Priced In?"
          infoText="How the current multiple compares with history and peers, and what level of growth or durability the market appears to be assuming."
          title="Priced-In Analysis"
        >
          {pricedInAnalysis === null ? (
            <p className="text-sm font-light leading-relaxed text-zinc-500">
              This company is currently being treated as a private or diligence-led name, so a public-market priced-in analysis is intentionally not shown.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Current multiple</p>
                <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                  {pricedInAnalysis.currentMultiple}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Historical context</p>
                <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                  {pricedInAnalysis.vsHistoricalAvg}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Peer context</p>
                <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                  {pricedInAnalysis.vsPeerMedian}
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Implied growth</p>
                  <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                    {pricedInAnalysis.impliedGrowthRate}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">House assumption</p>
                  <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                    {pricedInAnalysis.ourGrowthAssumption}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-950/25 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">So what?</p>
                <p className="mt-2 text-sm font-light leading-relaxed text-emerald-100">
                  {pricedInAnalysis.conclusion}
                </p>
              </div>
            </div>
          )}
        </MemoSectionCard>
      </div>

      <MemoSectionCard
        eyebrow="Driver-Based Narrative"
        infoText="Each driver is meant to explain why the case works, what evidence supports it, and what breaks if the driver fails."
        title="Thesis Drivers"
      >
        {thesisDrivers.length === 0 ? (
          <p className="text-sm font-light leading-relaxed text-zinc-500">
            The driver-based thesis could not be generated on this run, so the memo is falling back to the legacy narrative view inside the stored evidence.
          </p>
        ) : (
          <div className="space-y-4">
            {thesisDrivers.map((driver, index) => (
              <article
                className="rounded-2xl border border-zinc-800 bg-zinc-950/75 p-5"
                key={`${driver.claim}-${driver.evidenceId}-${index}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-emerald-200">
                    Driver {index + 1}
                  </span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-300">
                    {driver.confidence} confidence
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${
                      driver.currentlyHolds
                        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                        : "border-rose-400/20 bg-rose-400/10 text-rose-200"
                    }`}
                  >
                    {driver.currentlyHolds ? "Currently holds" : "At risk"}
                  </span>
                </div>
                <h5 className="mt-4 text-lg font-semibold text-zinc-100">{driver.claim}</h5>
                <p className="mt-3 text-sm font-light leading-relaxed text-zinc-300">
                  {driver.interpretation}
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Evidence anchor</p>
                    <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                      {driver.evidenceId}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">If this fails</p>
                    <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                      {driver.ifFails}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </MemoSectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <MemoSectionCard
          className="bg-emerald-400/5"
          eyebrow="Bull Case"
          infoText="What has to go right, what outcome that implies, and what multiple would support that upside."
          title="What Has To Go Right"
        >
          {bullCase == null ? (
            <p className="text-sm font-light leading-relaxed text-zinc-300">{memo.upsideCase}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-light leading-relaxed text-zinc-300">{bullCase.scenario}</p>
              <MemoStringList
                emptyText="No explicit upside assumptions were produced."
                items={bullCase.assumptions}
              />
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Quantified outcome</p>
                <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                  {bullCase.quantifiedOutcome}
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Implied multiple</p>
                  <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                    {bullCase.impliedMultiple ?? "Not specified"}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Probability hint</p>
                  <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                    {bullCase.probabilityHint}
                  </p>
                </div>
              </div>
            </div>
          )}
        </MemoSectionCard>

        <MemoSectionCard
          className="bg-rose-400/5"
          eyebrow="Bear Case"
          infoText="What can break, what downside it implies, and what multiple the market could reset to if the thesis weakens."
          title="What Can Break"
        >
          {bearCase == null ? (
            <p className="text-sm font-light leading-relaxed text-zinc-300">{memo.downsideCase}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-light leading-relaxed text-zinc-300">{bearCase.scenario}</p>
              <MemoStringList
                emptyText="No explicit downside assumptions were produced."
                items={bearCase.assumptions}
              />
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Quantified outcome</p>
                <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                  {bearCase.quantifiedOutcome}
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Implied multiple</p>
                  <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                    {bearCase.impliedMultiple ?? "Not specified"}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Probability hint</p>
                  <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                    {bearCase.probabilityHint}
                  </p>
                </div>
              </div>
            </div>
          )}
        </MemoSectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <MemoSectionCard
          eyebrow="Logic Support"
          infoText="The evidence doing the most analytical work in the memo."
          title="Supporting Reasons"
        >
          <MemoStringList
            emptyText="No explicit supporting reasons were generated."
            items={memo.logic.supportingReasons}
          />
        </MemoSectionCard>

        <MemoSectionCard
          eyebrow="Logic Limits"
          infoText="The main reasons conviction is still capped."
          title="Confidence-Limiting Reasons"
        >
          <MemoStringList
            emptyText="No explicit confidence limits were generated."
            items={memo.logic.confidenceLimitingReasons}
          />
        </MemoSectionCard>
      </div>

      <MemoSectionCard
        eyebrow="Kill Criteria"
        infoText="Specific conditions that would change the call rather than just weaken the narrative."
        title="What Would Change The Call"
      >
        {changeCriteria.length === 0 ? (
          <p className="text-sm font-light leading-relaxed text-zinc-500">
            No typed kill criteria were generated on this run.
          </p>
        ) : (
          <div className="space-y-4">
            {changeCriteria.map((criterion, index) => (
              <div
                className="rounded-2xl border border-zinc-800 bg-zinc-950/75 p-4"
                key={`${criterion.condition}-${index}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-300">
                    Driver{" "}
                    {criterion.thesisDriverIndex === null
                      ? "Unlinked"
                      : criterion.thesisDriverIndex + 1}
                  </span>
                  <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-rose-200">
                    {criterion.newRecommendation}
                  </span>
                </div>
                <p className="mt-3 text-sm font-light leading-relaxed text-zinc-300">
                  {criterion.condition}
                </p>
              </div>
            ))}
          </div>
        )}
      </MemoSectionCard>

      <MemoSectionCard
        eyebrow="Peer Benchmarking"
        infoText="Comparable public peers, median anchors, and the modeling lens used to interpret them."
        title="Comparables Anchor"
      >
        {comparablesAnchor === null ? (
          <p className="text-sm font-light leading-relaxed text-zinc-500">
            No peer anchor set was available for this company on the current run.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Subject vs median</p>
              <p className="mt-2 text-sm font-light leading-relaxed text-zinc-300">
                {comparablesAnchor.subjectVsMedian}
              </p>
            </div>
            {comparablesAnchor.modelingNote ? (
              <div className="rounded-2xl border border-sky-400/20 bg-sky-950/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-sky-200">Modeling note</p>
                <p className="mt-2 text-sm font-light leading-relaxed text-sky-100">
                  {comparablesAnchor.modelingNote}
                </p>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/70">
              <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
                <thead className="bg-zinc-900/80 text-xs uppercase tracking-[0.18em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Peer</th>
                    <th className="px-4 py-3 font-medium">Ticker</th>
                    <th className="px-4 py-3 font-medium">P/E</th>
                    <th className="px-4 py-3 font-medium">EV/EBITDA</th>
                    <th className="px-4 py-3 font-medium">Revenue Growth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {comparablesAnchor.peerGroup.map((peer) => (
                    <tr className="text-zinc-300" key={`${peer.name}-${peer.ticker ?? "na"}`}>
                      <td className="px-4 py-3">{peer.name}</td>
                      <td className="px-4 py-3">{peer.ticker ?? "-"}</td>
                      <td className="px-4 py-3">{formatOptionalMultiple(peer.peRatio)}</td>
                      <td className="px-4 py-3">{formatOptionalMultiple(peer.evToEbitda)}</td>
                      <td className="px-4 py-3">{formatOptionalPercent(peer.revenueGrowth)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-zinc-700 bg-zinc-900/75 text-zinc-100">
                    <td className="px-4 py-3 font-medium">Median</td>
                    <td className="px-4 py-3">-</td>
                    <td className="px-4 py-3">
                      {formatOptionalMultiple(comparablesAnchor.medianRow.peRatio)}
                    </td>
                    <td className="px-4 py-3">
                      {formatOptionalMultiple(comparablesAnchor.medianRow.evToEbitda)}
                    </td>
                    <td className="px-4 py-3">
                      {formatOptionalPercent(comparablesAnchor.medianRow.revenueGrowth)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </MemoSectionCard>
    </section>
  );
}

export function Report({
  report,
  onRefresh,
  isRefreshing = false,
}: ReportProps) {
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const narrativeParagraphs = getNarrativeParagraphs(report.narrative);
  const ticker = getIdentifierValue(report, "Ticker");
  const exchange = getIdentifierValue(report, "Exchange");
  const marketCap = formatMarketCap(report.valuationView?.marketCap ?? null);
  const metricCards = buildMetricCards(report.metrics);
  const coverageStyle =
    COVERAGE_STYLES[report.validationReport.coverageLabel] ?? COVERAGE_STYLES.Thin;
  const activeSources = SOURCE_ORDER.filter((source) => report.sources.includes(source));
  const inactiveSources = SOURCE_ORDER.filter((source) => !report.sources.includes(source));
  const orderedSources = [...activeSources, ...inactiveSources];
  const displayedSource = selectedSource ?? orderedSources[0] ?? null;
  const displayedSourceIsActive =
    displayedSource === null ? false : report.sources.includes(displayedSource);
  const useDepthMemoView = hasDepthMemoView(report.investmentMemo);

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
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${RECOMMENDATION_STYLES[report.investmentMemo.recommendation]}`}
                  >
                    {report.investmentMemo.displayRecommendationLabel}
                  </span>
                  <RecommendationLegendInfo />
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${ROLE_STYLES[report.investmentMemo.role]}`}
                >
                {report.investmentMemo.role}
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${MANDATE_FIT_STYLES[report.investmentMemo.mandateFit]}`}
              >
                {report.investmentMemo.mandateFit}
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <div className="flex items-center gap-2 xl:justify-end">
                  <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Data Confidence</p>
                  <SectionInfoTooltip
                    align="end"
                    content="How strong the evidence base is: entity match, source quality, freshness, filing depth, and valuation support."
                  />
                </div>
                <div
                  aria-label={`${report.confidence.level} data confidence`}
                  className="mt-2 flex items-center gap-1 text-xl xl:justify-end"
                >
                  {renderConfidenceStars(report.confidence.level)}
                </div>
                <p className="mt-2 text-sm font-light text-zinc-400">
                  {report.confidence.score}/100 data confidence
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Investment Conviction</p>
                  <SectionInfoTooltip
                    align="end"
                    content="How strong the actual investment case is. High evidence quality can still lead to low conviction."
                  />
                </div>
                <p className="mt-2 text-sm font-medium text-zinc-100">
                  {titleCase(report.investmentMemo.conviction)}
                </p>
                <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
                  {report.investmentMemo.convictionSummary}
                </p>
              </div>
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
        <RecentDevelopmentsPanel
          items={report.recentDevelopments}
          summary={report.newsSentiment}
        />

        {useDepthMemoView
          ? renderDepthMemoPanel(report.investmentMemo)
          : <InvestmentMemoPanel memo={report.investmentMemo} />}

        <details
          className="group rounded-[2rem] border border-zinc-800 bg-zinc-900/45 p-6"
          open
        >
          <summary className="fi-interactive flex cursor-pointer list-none flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Supporting Evidence</p>
                <SectionInfoTooltip
                  content="The underlying metrics, source detail, and audit trail behind the memo."
                />
              </div>
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Data Source Attribution</p>
                  <SectionInfoTooltip
                    content="Which sources contributed to this report and what each source was used for."
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {orderedSources.map((source) => {
                    const isActive = report.sources.includes(source);
                    const isSelected = displayedSource === source;

                    return (
                      <button
                        aria-label={`${SOURCE_DETAILS[source].label} ${isActive ? "active" : "inactive"} source`}
                        aria-pressed={isSelected}
                          className={`fi-focus-ring fi-interactive rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.18em] ${
                            isSelected
                              ? isActive
                                ? "border-emerald-300/45 bg-emerald-400/10 text-emerald-100"
                                : "border-zinc-700 bg-zinc-900 text-zinc-200"
                              : isActive
                                ? "border-emerald-400/25 text-emerald-200"
                                : "border-zinc-800 text-zinc-500 opacity-60"
                          }`}
                          title={`${SOURCE_DETAILS[source].label} • ${isActive ? "Active" : "Inactive"} • ${formatUpdatedAt(report.updatedAt)}`}
                          key={source}
                          onClick={() => {
                            setSelectedSource(source);
                          }}
                          onFocus={() => {
                            setSelectedSource(source);
                          }}
                          onMouseEnter={() => {
                            setSelectedSource(source);
                          }}
                          type="button"
                        >
                          {SOURCE_DETAILS[source].label}
                        </button>
                    );
                  })}
                </div>
                {displayedSource !== null ? (
                  <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                          {getSourceStatusLabel(displayedSourceIsActive)}
                        </p>
                        <p className="mt-2 text-sm font-medium text-zinc-100">
                          {SOURCE_DETAILS[displayedSource].label}
                        </p>
                      </div>
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                        Freshness {formatUpdatedAt(report.updatedAt)}
                      </p>
                    </div>
                    <p className="mt-3 text-sm font-light leading-relaxed text-zinc-300">
                      {SOURCE_DETAILS[displayedSource].note}
                    </p>
                  </div>
                ) : null}
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
                <RecentNewsPanel
                  items={report.newsHighlights}
                  summary={report.newsSentiment}
                />
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
