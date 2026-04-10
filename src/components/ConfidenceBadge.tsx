import type { ConfidenceLevel, ConfidenceScore } from "@/lib/types";

type ConfidenceBadgeProps = {
  readonly confidence: ConfidenceScore;
};

const LEVEL_STYLES: Record<ConfidenceLevel, string> = {
  high: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  medium: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  low: "border-rose-400/25 bg-rose-400/10 text-rose-200",
};

export function ConfidenceBadge({
  confidence,
}: ConfidenceBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] ${LEVEL_STYLES[confidence.level]}`}
      title={confidence.rationale}
    >
      <span>{confidence.level}</span>
      <span className="text-[11px] text-white/70">{confidence.score}/100</span>
    </div>
  );
}

export default ConfidenceBadge;
