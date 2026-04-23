type SectionInfoTooltipProps = {
  readonly content: string;
  readonly label?: string;
  readonly align?: "start" | "end";
};

export default function SectionInfoTooltip({
  content,
  label = "Show section help",
  align = "start",
}: SectionInfoTooltipProps) {
  const panelAlignmentClass = align === "end" ? "right-0" : "left-0";

  return (
    <details className="group relative shrink-0">
      <summary className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-zinc-800 bg-zinc-950/80 text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
        <span className="sr-only">{label}</span>
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
        className={`absolute ${panelAlignmentClass} top-8 z-20 w-[min(18rem,calc(100vw-4rem))] rounded-2xl border border-zinc-800 bg-zinc-950/98 p-4 text-sm font-light leading-relaxed text-zinc-300 shadow-[0_24px_80px_-36px_rgba(0,0,0,0.98)]`}
      >
        {content}
      </div>
    </details>
  );
}
