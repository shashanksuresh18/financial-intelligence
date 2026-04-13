import type { MonitorApiResponse } from "@/lib/types";

type PortfolioOverviewPanelProps = {
  readonly summary?: MonitorApiResponse["summary"];
};

export function PortfolioOverviewPanel({
  summary,
}: PortfolioOverviewPanelProps) {
  if (summary === undefined) {
    return (
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950/75 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
          Portfolio Overview
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          Watch a few companies and we&apos;ll summarize portfolio-level confidence,
          coverage, and evidence quality here.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/75 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
          Portfolio Overview
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          First slice of the multi-company view: compare the watchlist by evidence quality.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Watched
          </p>
          <p className="mt-2 text-3xl font-semibold text-zinc-50">
            {summary.watchedCount}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Snapshots
          </p>
          <p className="mt-2 text-3xl font-semibold text-zinc-50">
            {summary.withSnapshotsCount}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Avg Confidence
          </p>
          <p className="mt-2 text-3xl font-semibold text-zinc-50">
            {summary.averageConfidence ?? "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Avg Sources
          </p>
          <p className="mt-2 text-3xl font-semibold text-zinc-50">
            {summary.averageSources ?? "-"}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          Coverage Mix
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-emerald-200">
            {summary.supportedSections} supported
          </span>
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-amber-200">
            {summary.partialSections} partial
          </span>
          <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-rose-200">
            {summary.limitedSections} limited
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Strongest Snapshot
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-100">
            {summary.strongestCompany ?? "No cached report yet"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Weakest Snapshot
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-100">
            {summary.weakestCompany ?? "No cached report yet"}
          </p>
        </div>
      </div>
    </section>
  );
}

export default PortfolioOverviewPanel;
