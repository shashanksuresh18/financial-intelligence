import type { AnalystConsensusEntry } from "@/lib/types";

type AnalystConsensusProps = {
  readonly items?: readonly AnalystConsensusEntry[];
};

export function AnalystConsensus({ items = [] }: AnalystConsensusProps) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-base font-semibold">Analyst consensus</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {items.length === 0 ? (
          <li className="text-slate-500">No analyst data yet.</li>
        ) : (
          items.map((item) => (
            <li
              className="flex justify-between gap-4"
              key={`${item.firm}-${item.rating}`}
            >
              <span>{item.firm}</span>
              <span>{item.rating}</span>
              <span>{item.targetPrice ?? "-"}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export default AnalystConsensus;
