import type { AnalysisReport } from "@/lib/types";

type ActiveSnapshotPanelProps = {
  readonly report: AnalysisReport | null;
  readonly isAnalyzing?: boolean;
};

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

function formatRecommendationLabel(
  recommendation: AnalysisReport["investmentMemo"]["recommendation"],
): string {
  return recommendation.toUpperCase();
}

export function ActiveSnapshotPanel({
  report,
  isAnalyzing = false,
}: ActiveSnapshotPanelProps) {
  if (report === null) {
    return (
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950/75 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
          Active Snapshot
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          Load a company from search or the monitor list and we&apos;ll keep the
          live confidence, support quality, signals, and top gaps pinned here.
        </p>
      </section>
    );
  }

  const topSignals = report.evidenceSignals.slice(0, 2);
  const topGaps = report.coverageGaps.slice(0, 3);

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/75 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
            Active Snapshot
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Fast sidebar read on the currently loaded company.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${
          isAnalyzing
            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
            : "border-zinc-800 bg-zinc-900 text-zinc-400"
        }`}>
          {isAnalyzing ? "Refreshing" : "Live"}
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-sm font-medium text-zinc-100">{report.company}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
          Updated {formatUpdatedAt(report.updatedAt)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-300">
            {formatRecommendationLabel(report.investmentMemo.recommendation)}
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            {report.investmentMemo.conviction} conviction
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            {report.investmentMemo.coverageProfile}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {report.summary}
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          Top Signals
        </p>
        <ul className="mt-3 space-y-3">
          {topSignals.length === 0 ? (
            <li className="text-sm leading-6 text-zinc-500">
              No prioritized signals yet.
            </li>
          ) : (
            topSignals.map((signal) => (
              <li key={`${signal.title}-${signal.detail}`}>
                <p className="text-sm font-medium text-zinc-100">{signal.title}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">{signal.detail}</p>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          Biggest Gaps
        </p>
        <ul className="mt-3 space-y-3">
          {topGaps.length === 0 ? (
            <li className="text-sm leading-6 text-zinc-500">
              No major coverage gaps are flagged right now.
            </li>
          ) : (
            topGaps.map((gap) => (
              <li key={`${gap.title}-${gap.severity}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-100">{gap.title}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${
                    gap.severity === "high"
                      ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
                      : gap.severity === "medium"
                        ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                        : "border-zinc-700 bg-zinc-950 text-zinc-400"
                  }`}>
                    {gap.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-zinc-400">{gap.detail}</p>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

export default ActiveSnapshotPanel;
