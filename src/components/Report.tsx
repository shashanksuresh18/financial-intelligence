import type {
  AnalysisReport,
  ResearchNoteSection,
  SectionAuditItem,
} from "@/lib/types";

import AnalystConsensus from "./AnalystConsensus";
import ConfidenceBadge from "./ConfidenceBadge";
import ConfidenceBreakdown from "./ConfidenceBreakdown";
import DataSourceAttribution from "./DataSourceAttribution";
import EntityResolutionPanel from "./EntityResolutionPanel";
import EarningsHighlightsPanel from "./EarningsHighlightsPanel";
import FinancialTable from "./FinancialTable";
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

export function Report({
  report,
  onRefresh,
  isRefreshing = false,
}: ReportProps) {
  const narrativeParagraphs = getNarrativeParagraphs(report.narrative);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950/75 shadow-[0_32px_120px_-60px_rgba(15,23,42,1)]">
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-950 to-emerald-950/20 px-6 py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Investment Memo
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">
              {report.company}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
              Decision-first memo backed by {report.sources.length} active source
              {report.sources.length === 1 ? "" : "s"}. Supporting evidence and auditability are
              available below.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-zinc-500">
                Refreshed {formatUpdatedAt(report.updatedAt)}
              </p>
              {onRefresh ? (
                <button
                  className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200 transition hover:border-emerald-300/35 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
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
      </div>

      <div className="space-y-6 px-6 py-6">
        <InvestmentMemoPanel memo={report.investmentMemo} />

        <details className="group rounded-3xl border border-zinc-800 bg-zinc-950/60 p-5">
          <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
                Supporting Evidence
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Audit trail, valuation tables, Street detail, entity resolution, and confidence
                mechanics.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
              <span>{report.metrics.length} metrics</span>
              <span>{report.sources.length} sources</span>
              <span className="transition group-open:rotate-180">v</span>
            </div>
          </summary>

          <div className="mt-6 space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(24rem,1fr)]">
              <div className="space-y-6">
                <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
                        Supporting Analyst Note
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        Narrative synthesis from the grounded evidence stack.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ConfidenceBadge confidence={report.confidence} />
                    </div>
                  </div>

                  <div className="space-y-6">
                    {report.sections.length > 0 ? (
                      report.sections.map((section) => {
                        const audit = getSectionAuditMatch(section.title, report.sectionAudit);

                        return (
                          <div key={`${section.title}-${section.body}`}>
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                                {section.title}
                              </h4>
                              {audit !== null ? (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${SECTION_AUDIT_STYLES[audit.status]}`}
                                  title={audit.note}
                                >
                                  {audit.status}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 space-y-4 text-sm leading-7 text-zinc-300">
                              {getNarrativeParagraphs(section.body).map((paragraph, index) => (
                                <p key={`${section.title}-${index}-${paragraph}`}>{paragraph}</p>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="space-y-4 text-sm leading-7 text-zinc-300">
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
                <FinancialTable metrics={report.metrics} />
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
                <DataSourceAttribution sources={report.sources} updatedAt={report.updatedAt} />
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

export default Report;
