type RecommendationLegendInfoProps = {
  readonly align?: "start" | "end";
};

const RECOMMENDATION_GUIDE = [
  {
    label: "Buy",
    meaning: "Actionable now.",
  },
  {
    label: "Hold",
    meaning: "Investable, but not compelling enough to add aggressively.",
  },
  {
    label: "Watch",
    meaning: "Worth tracking, but not underwriteable yet.",
  },
  {
    label: "Primary diligence required",
    meaning: "Private-company case needs more primary work before underwriting.",
  },
  {
    label: "Pass for now / Avoid",
    meaning: "Not actionable unless something changes materially.",
  },
] as const;

export default function RecommendationLegendInfo({
  align = "end",
}: RecommendationLegendInfoProps) {
  const panelAlignmentClass = align === "start" ? "left-0" : "right-0";

  return (
    <details className="group relative">
      <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-zinc-800 bg-zinc-950/80 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Show recommendation guide</span>
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M12 10.25V16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="7.5" fill="currentColor" r="1" />
        </svg>
      </summary>

      <div
        className={`absolute ${panelAlignmentClass} top-9 z-20 w-[min(18rem,calc(100vw-4rem))] rounded-2xl border border-zinc-800 bg-zinc-950/98 p-4 shadow-[0_24px_80px_-36px_rgba(0,0,0,0.98)]`}
      >
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Recommendation Guide</p>
        <div className="mt-3 space-y-3">
          {RECOMMENDATION_GUIDE.map((item) => (
            <div key={item.label}>
              <p className="text-sm font-medium text-zinc-100">{item.label}</p>
              <p className="mt-1 text-sm font-light leading-relaxed text-zinc-400">
                {item.meaning}
              </p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
