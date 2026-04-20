import type { AnalysisReport } from "@/lib/types";

type ActiveSnapshotPanelProps = {
  readonly report: AnalysisReport | null;
  readonly isAnalyzing?: boolean;
  readonly watchedCount?: number;
  readonly reportStatus?: string;
  readonly liveQuery?: string | null;
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

function getCoverageBarClass(score: number): string {
  if (score >= 80) {
    return "bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.38)]";
  }

  if (score >= 60) {
    return "bg-amber-400";
  }

  if (score >= 40) {
    return "bg-blue-400";
  }

  return "bg-zinc-500";
}

export function ActiveSnapshotPanel({
  report,
  isAnalyzing = false,
  watchedCount = 0,
  reportStatus = "Awaiting company selection",
  liveQuery = null,
}: ActiveSnapshotPanelProps) {
  if (report === null) {
    return (
      <section className="fi-fade-in rounded-[2rem] border border-zinc-800 bg-zinc-900/55 p-6 shadow-[0_28px_80px_-52px_rgba(0,0,0,0.95)] backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Active Snapshot</p>
            <h2 className="mt-3 text-2xl font-semibold text-zinc-100">Research Console</h2>
            <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
              Live status, coverage quality, and watchlist context stay pinned here.
            </p>
          </div>
          <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            Idle
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/65 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Watched</p>
            <p className="text-2xl font-semibold text-emerald-200">{watchedCount}</p>
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Report status</p>
          <p className="mt-2 text-sm font-medium text-zinc-200">{reportStatus}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Live query</p>
          <p className="mt-2 text-sm font-light text-zinc-400">
            {liveQuery && liveQuery.length > 0 ? liveQuery : "None"}
          </p>
        </div>
      </section>
    );
  }

  const topSignals = report.evidenceSignals.slice(0, 2);
  const topGaps = report.coverageGaps.slice(0, 2);
  const coverageScore = report.validationReport.dataQualityScore;

  return (
    <section className="fi-fade-in rounded-[2rem] border border-zinc-800 bg-zinc-900/55 p-6 shadow-[0_28px_80px_-52px_rgba(0,0,0,0.95)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Active Snapshot</p>
          <h2 className="mt-3 text-2xl font-semibold text-zinc-100">{report.company}</h2>
          <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
            {reportStatus}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${
            isAnalyzing
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              : "border-zinc-800 bg-zinc-950/70 text-zinc-400"
          }`}
        >
          {isAnalyzing ? "Refreshing" : "Live"}
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/65 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Coverage indicator</p>
            <p className="mt-2 text-sm font-medium text-zinc-100">
              {report.validationReport.coverageLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-zinc-100">{coverageScore}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Data quality</p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-900">
          <div
            aria-hidden="true"
            className={`h-full rounded-full ${getCoverageBarClass(coverageScore)}`}
            style={{ width: `${Math.max(8, coverageScore)}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em]">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-200">
            {watchedCount} watched
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-zinc-300">
            {formatRecommendationLabel(report.investmentMemo.recommendation)}
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-zinc-400">
            {report.investmentMemo.conviction} conviction
          </span>
        </div>

        <p className="mt-4 text-xs uppercase tracking-[0.22em] text-zinc-500">Live query</p>
        <p className="mt-2 text-sm font-light text-zinc-400">
          {liveQuery && liveQuery.length > 0 ? liveQuery : report.company}
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-zinc-500">
          Updated {formatUpdatedAt(report.updatedAt)}
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/65 p-4">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Top Signals</p>
        <ul className="mt-4 space-y-3">
          {topSignals.length === 0 ? (
            <li className="text-sm font-light leading-relaxed text-zinc-500">
              No prioritized signals yet.
            </li>
          ) : (
            topSignals.map((signal) => (
              <li key={`${signal.title}-${signal.detail}`}>
                <p className="text-sm font-medium text-zinc-100">{signal.title}</p>
                <p className="mt-1 text-sm font-light leading-relaxed text-zinc-400">
                  {signal.detail}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/65 p-4">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Top Gaps</p>
        <ul className="mt-4 space-y-3">
          {topGaps.length === 0 ? (
            <li className="text-sm font-light leading-relaxed text-zinc-500">
              No major coverage gaps are flagged right now.
            </li>
          ) : (
            topGaps.map((gap) => (
              <li key={`${gap.title}-${gap.severity}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-100">{gap.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-[0.16em] ${
                      gap.severity === "high"
                        ? "bg-rose-400/20 text-rose-200"
                        : gap.severity === "medium"
                          ? "bg-amber-400/20 text-amber-200"
                          : "bg-zinc-500/20 text-zinc-300"
                    }`}
                  >
                    {gap.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm font-light leading-relaxed text-zinc-400">
                  {gap.detail}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

export default ActiveSnapshotPanel;
