import type { ValuationView } from "@/lib/types";

type ValuationOverviewPanelProps = {
  readonly valuationView: ValuationView | null;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
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

function formatMultiple(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}x`;
}

function formatCurrency(value: number | null): string {
  return value === null ? "-" : CURRENCY_FORMATTER.format(value);
}

function formatCompactCurrency(value: number | null): string {
  return value === null ? "-" : COMPACT_CURRENCY_FORMATTER.format(value);
}

export function ValuationOverviewPanel({
  valuationView,
}: ValuationOverviewPanelProps) {
  if (valuationView === null) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
            Valuation
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            No structured valuation history is available yet for this company.
          </p>
        </div>
      </section>
    );
  }

  const populatedRows = valuationView.metrics.filter(
    (metric) =>
      metric.current !== null ||
      metric.historicalLow !== null ||
      metric.historicalHigh !== null ||
      metric.forward !== null,
  );

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Valuation
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Current multiples, historical context, and forward framing when estimate coverage is
          available.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Enterprise value
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-50">
            {formatCompactCurrency(valuationView.enterpriseValue)}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Market cap {formatCompactCurrency(valuationView.marketCap)}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Fallback target
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-50">
            {formatCurrency(valuationView.priceTargetFallback?.targetMean ?? null)}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Upside / downside{" "}
            {valuationView.priceTargetFallback?.upsidePercent === null ||
            valuationView.priceTargetFallback?.upsidePercent === undefined
              ? "-"
              : `${valuationView.priceTargetFallback.upsidePercent.toFixed(1)}%`}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/70">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950/70 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Multiple</th>
              <th className="px-4 py-3 font-medium">Current</th>
              <th className="px-4 py-3 font-medium">Historical Range</th>
              <th className="px-4 py-3 font-medium">Forward</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {populatedRows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={4}>
                  Current market multiples are limited for this name.
                </td>
              </tr>
            ) : (
              populatedRows.map((metric) => (
                <tr key={metric.label}>
                  <td className="px-4 py-3 font-medium text-zinc-100">{metric.label}</td>
                  <td className="px-4 py-3 text-zinc-300">{formatMultiple(metric.current)}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {metric.historicalLow === null && metric.historicalHigh === null
                      ? "-"
                      : `${formatMultiple(metric.historicalLow)} to ${formatMultiple(
                          metric.historicalHigh,
                        )}`}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{formatMultiple(metric.forward)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Forward estimates</p>
        {valuationView.forwardEstimates.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No structured forward revenue or EPS estimates are available yet.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {valuationView.forwardEstimates.map((estimate) => (
              <div
                className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                key={estimate.period}
              >
                <div>
                  <p className="font-medium text-zinc-100">{estimate.period}</p>
                  <p className="mt-1 text-zinc-400">
                    Revenue {formatCompactCurrency(estimate.revenueEstimate)}
                  </p>
                </div>
                <p className="text-zinc-300">EPS {estimate.epsEstimate?.toFixed(2) ?? "-"}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {valuationView.note ? (
        <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100/90">
          {valuationView.note}
        </p>
      ) : null}
    </section>
  );
}

export default ValuationOverviewPanel;
