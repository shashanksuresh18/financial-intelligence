import type { DataSource, FinancialMetric } from "@/lib/types";

type FinancialTableProps = {
  readonly metrics?: readonly FinancialMetric[];
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

const SOURCE_LABELS: Record<DataSource, string> = {
  finnhub: "Finnhub",
  fmp: "FMP",
  "sec-edgar": "SEC EDGAR",
  "companies-house": "Companies House",
  gleif: "GLEIF",
  "exa-deep": "Exa Deep",
  "claude-fallback": "Claude Fallback",
};

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

function getSourceLabel(source: FinancialMetric["source"]): string {
  if (!source) {
    return "-";
  }

  return SOURCE_LABELS[source];
}

export function FinancialTable({
  metrics = [],
}: FinancialTableProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
            Financial Metrics
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Structured figures surfaced from filings, registries, and market data.
          </p>
        </div>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
          {metrics.length} metrics
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm text-zinc-200">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-[0.18em] text-zinc-500">
              <th className="py-3 pr-4 font-medium">Metric</th>
              <th className="py-3 pr-4 font-medium">Value</th>
              <th className="py-3 pr-4 font-medium">Period</th>
              <th className="py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {metrics.length === 0 ? (
              <tr>
                <td className="py-6 text-zinc-500" colSpan={4}>
                  No financial metrics are available for this company yet.
                </td>
              </tr>
            ) : (
              metrics.map((metric, index) => (
                <tr
                  className="border-b border-zinc-900/80 last:border-b-0"
                  key={`${metric.label}-${metric.period ?? "na"}-${metric.source ?? "unknown"}-${index}`}
                >
                  <td className="py-4 pr-4 font-medium text-zinc-100">{metric.label}</td>
                  <td className="py-4 pr-4 text-zinc-200">{formatMetricValue(metric)}</td>
                  <td className="py-4 pr-4 text-zinc-400">{metric.period ?? "-"}</td>
                  <td className="py-4">
                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                      {getSourceLabel(metric.source)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default FinancialTable;
