import type { AnalystConsensusEntry } from "@/lib/types";

type AnalystConsensusProps = {
  readonly items?: readonly AnalystConsensusEntry[];
};

const PRICE_FORMATTER = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  style: "currency",
});

function getRatingTone(rating: string): string {
  const normalized = rating.toLowerCase();

  if (normalized.includes("buy")) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (normalized.includes("sell")) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-200";
  }

  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
}

function formatTargetPrice(targetPrice: number | null): string {
  if (targetPrice === null) {
    return "-";
  }

  return PRICE_FORMATTER.format(targetPrice);
}

export function AnalystConsensus({
  items = [],
}: AnalystConsensusProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Analyst Consensus
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Street sentiment extracted from the latest available recommendation set.
        </p>
      </div>

      <ul className="space-y-3">
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-sm text-zinc-500">
            No analyst recommendation data is available for this company yet.
          </li>
        ) : (
          items.map((item) => (
            <li
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-4"
              key={`${item.firm}-${item.rating}-${item.targetPrice ?? "na"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100">{item.firm}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
                    {item.period ? `Latest published stance (${item.period})` : "Latest published stance"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getRatingTone(item.rating)}`}
                  >
                    {item.rating}
                  </span>
                  <span className="text-sm text-zinc-400">
                    Target: {formatTargetPrice(item.targetPrice)}
                  </span>
                </div>
              </div>

              {item.counts ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Bullish
                    </p>
                    <p className="mt-2 text-xl font-semibold text-emerald-200">
                      {item.counts.bullish}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Hold
                    </p>
                    <p className="mt-2 text-xl font-semibold text-amber-200">
                      {item.counts.neutral}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      Bearish
                    </p>
                    <p className="mt-2 text-xl font-semibold text-rose-200">
                      {item.counts.bearish}
                    </p>
                  </div>
                </div>
              ) : null}

              {item.detail ? (
                <p className="mt-3 text-sm leading-6 text-zinc-400">{item.detail}</p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export default AnalystConsensus;
