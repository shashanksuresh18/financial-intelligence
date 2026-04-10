import type { AnalysisReport } from "@/lib/types";

import AnalystConsensus from "./AnalystConsensus";
import ConfidenceBadge from "./ConfidenceBadge";
import DataSourceAttribution from "./DataSourceAttribution";
import FinancialTable from "./FinancialTable";

type ReportProps = {
  readonly report: AnalysisReport;
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

export function Report({
  report,
}: ReportProps) {
  const narrativeParagraphs = getNarrativeParagraphs(report.narrative);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950/75 shadow-[0_32px_120px_-60px_rgba(15,23,42,1)]">
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-950 to-emerald-950/30 px-6 py-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Company Analysis
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">
              {report.company}
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300">{report.summary}</p>
            <p className="mt-4 text-sm text-zinc-500">
              Refreshed {formatUpdatedAt(report.updatedAt)}
            </p>
          </div>
          <div className="space-y-3">
            <ConfidenceBadge confidence={report.confidence} />
            <p className="max-w-sm text-sm leading-6 text-zinc-400">
              {report.confidence.rationale}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
              Narrative
            </h3>
            <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-300">
              {narrativeParagraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph}`}>{paragraph}</p>
              ))}
            </div>
          </section>

          <FinancialTable metrics={report.metrics} />
        </div>

        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Sources</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-50">
                {report.sources.length}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Metrics</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-50">
                {report.metrics.length}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Consensus</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-50">
                {report.analystConsensus.length}
              </p>
            </div>
          </section>

          <AnalystConsensus items={report.analystConsensus} />
          <DataSourceAttribution
            sources={report.sources}
            updatedAt={report.updatedAt}
          />
        </div>
      </div>
    </section>
  );
}

export default Report;
