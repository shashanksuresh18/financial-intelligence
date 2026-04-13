import type { PeerComparisonItem } from "@/lib/types";

type PeerComparisonPanelProps = {
  readonly items: readonly PeerComparisonItem[];
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

function formatCurrency(value: number | null): string {
  return value === null ? "-" : CURRENCY_FORMATTER.format(value);
}

function formatCompactCurrency(value: number | null): string {
  return value === null ? "-" : COMPACT_CURRENCY_FORMATTER.format(value);
}

function formatMultiple(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}x`;
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

export function PeerComparisonPanel({
  items,
}: PeerComparisonPanelProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Peer Comparison
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Comparable-company framing from the valuation data layer.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/70">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950/70 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Market Cap</th>
              <th className="px-4 py-3 font-medium">P/E</th>
              <th className="px-4 py-3 font-medium">EV / EBITDA</th>
              <th className="px-4 py-3 font-medium">Revenue Growth</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={6}>
                  No peer-comparison data is available yet. Add an FMP API key to unlock this
                  section for supported public companies.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={`${item.symbol}-${item.companyName}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-100">{item.companyName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">
                      {item.symbol}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{formatCurrency(item.currentPrice)}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    {formatCompactCurrency(item.marketCap)}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{formatMultiple(item.peRatio)}</td>
                  <td className="px-4 py-3 text-zinc-300">{formatMultiple(item.evToEbitda)}</td>
                  <td className="px-4 py-3 text-zinc-300">{formatPercent(item.revenueGrowth)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default PeerComparisonPanel;
