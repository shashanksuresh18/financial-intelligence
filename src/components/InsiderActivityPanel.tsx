import type { InsiderActivityItem } from "@/lib/types";

type InsiderActivityPanelProps = {
  readonly items: readonly InsiderActivityItem[];
};

function formatShareChange(value: number | null): string {
  if (value === null) {
    return "Change unavailable";
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)} shares`;
}

function formatTransactionPrice(value: number | null): string {
  if (value === null) {
    return "Price unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

export function InsiderActivityPanel({
  items,
}: InsiderActivityPanelProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Insider Activity
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Recent reported insider transactions pulled from Finnhub where available.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-sm text-zinc-500">
          No recent insider-transaction evidence is available for this company yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-4"
              key={`${item.name}-${item.transactionDate}-${item.transactionCode}-${index}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{item.name}</p>
                  <p className="mt-2 text-sm text-zinc-400">
                    {item.transactionCode} on {item.transactionDate}
                  </p>
                </div>
                <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  {formatTransactionPrice(item.transactionPrice)}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                Share change {formatShareChange(item.shareChange)}.
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default InsiderActivityPanel;
