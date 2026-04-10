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
              className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              key={`${item.firm}-${item.rating}-${item.targetPrice ?? "na"}`}
            >
              <div>
                <p className="text-sm font-medium text-zinc-100">{item.firm}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
                  Latest published stance
                </p>
              </div>
              <span
                className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getRatingTone(item.rating)}`}
              >
                {item.rating}
              </span>
              <span className="text-sm text-zinc-400">
                Target: {formatTargetPrice(item.targetPrice)}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export default AnalystConsensus;
