import type { ConfidenceScore } from "@/lib/types";

type ConfidenceBreakdownProps = {
  readonly confidence: ConfidenceScore;
};

function widthForScore(score: number): string {
  const bounded = Math.max(0, Math.min(score, 35));

  return `${(bounded / 35) * 100}%`;
}

export function ConfidenceBreakdown({
  confidence,
}: ConfidenceBreakdownProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Confidence Mechanics
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Component scoring shows where the report is strongest and where evidence is still thin.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {confidence.components.map((component, index) => (
          <div
            className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-4"
            key={`${component.key}-${component.label}-${index}`}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-zinc-100">{component.label}</p>
              <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                {component.score}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-zinc-900">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-emerald-200"
                style={{ width: widthForScore(component.score) }}
              />
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {component.rationale}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ConfidenceBreakdown;
