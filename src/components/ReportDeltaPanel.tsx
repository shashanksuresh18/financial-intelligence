import type { ReportDelta } from "@/lib/types";

type ReportDeltaPanelProps = {
  readonly items: readonly ReportDelta[];
};

const TONE_STYLES: Record<ReportDelta["tone"], string> = {
  positive: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
  negative: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  neutral: "border-zinc-800 bg-zinc-900/70 text-zinc-200",
};

export function ReportDeltaPanel({
  items,
}: ReportDeltaPanelProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          What Changed
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Snapshot of the most material changes versus the previous cached run.
        </p>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-sm text-zinc-500">
            No prior run is available for delta comparison yet.
          </div>
        ) : (
          items.map((item) => (
            <div
              className={`rounded-xl border px-4 py-4 ${TONE_STYLES[item.tone]}`}
              key={`${item.title}-${item.detail}`}
            >
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-2 text-sm leading-6 opacity-90">{item.detail}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default ReportDeltaPanel;
