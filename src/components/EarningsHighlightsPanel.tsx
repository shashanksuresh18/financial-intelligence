import type { EarningsHighlight } from "@/lib/types";

type EarningsHighlightsPanelProps = {
  readonly items: readonly EarningsHighlight[];
};

function formatValue(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(1)}%`;
}

export function EarningsHighlightsPanel({
  items,
}: EarningsHighlightsPanelProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Earnings Signals
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Recent beat / miss history from the latest available earnings set.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-sm text-zinc-500">
          No structured earnings-surprise history is available for this company yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-4"
              key={item.period}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-zinc-100">{item.period}</p>
                <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Surprise {formatPercent(item.surprisePercent)}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                Actual {formatValue(item.actual)} vs estimate {formatValue(item.estimate)}.
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default EarningsHighlightsPanel;
