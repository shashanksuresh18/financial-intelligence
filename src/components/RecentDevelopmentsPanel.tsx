import type {
  NewsSentimentSummary,
  RecentDevelopment,
  RecentDevelopmentCategory,
  RecentDevelopmentImpact,
} from "@/lib/types";

import SectionInfoTooltip from "./SectionInfoTooltip";

type RecentDevelopmentsPanelProps = {
  readonly items: readonly RecentDevelopment[];
  readonly summary: NewsSentimentSummary | null;
};

const IMPACT_STYLES: Record<RecentDevelopmentImpact, string> = {
  positive: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  negative: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  neutral: "border-zinc-700 bg-zinc-900 text-zinc-300",
  mixed: "border-amber-400/25 bg-amber-400/10 text-amber-200",
};

const CATEGORY_LABELS: Record<RecentDevelopmentCategory, string> = {
  earnings: "Earnings",
  leadership: "Leadership",
  analyst: "Street View",
  regulatory: "Regulatory",
  product: "Product",
  transaction: "Capital / Deal",
  "market-context": "Market Context",
};

function formatPublishedAt(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function describeNewsTone(summary: NewsSentimentSummary | null): string | null {
  if (summary === null) {
    return null;
  }

  if (summary.label === "positive") {
    return `News tone is constructive (${summary.positiveCount} positive / ${summary.negativeCount} negative / ${summary.neutralCount} neutral).`;
  }

  if (summary.label === "negative") {
    return `News tone is cautious (${summary.positiveCount} positive / ${summary.negativeCount} negative / ${summary.neutralCount} neutral).`;
  }

  return `News tone is mixed (${summary.positiveCount} positive / ${summary.negativeCount} negative / ${summary.neutralCount} neutral).`;
}

export function RecentDevelopmentsPanel({
  items,
  summary,
}: RecentDevelopmentsPanelProps) {
  const newsTone = describeNewsTone(summary);

  return (
    <section className="rounded-[2rem] border border-zinc-800 bg-zinc-950/70 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
              Recent Developments
            </p>
            <SectionInfoTooltip content="Recent company-specific events ranked for likely investment relevance." />
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-zinc-100">
            What The Analyst Should Know First
          </h3>
          <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
            The most material recent items, filtered and de-duplicated so we surface what changed rather than every headline.
          </p>
        </div>

        {newsTone !== null ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 lg:max-w-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              News Readout
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{newsTone}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 px-4 py-5 text-sm text-zinc-500">
            No material recent developments were extracted for this company yet.
          </div>
        ) : (
          items.map((item) => {
            const cardClassName =
              "block rounded-2xl border border-zinc-800 bg-zinc-900/60 px-5 py-4 transition hover:border-zinc-700 hover:bg-zinc-900/80";
            const cardKey = `${item.source}-${item.publishedAt}-${item.headline}`;

            const content = (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
                      {CATEGORY_LABELS[item.category]}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${IMPACT_STYLES[item.impact]}`}
                    >
                      {item.impact}
                    </span>
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      {item.source}
                    </span>
                  </div>

                  <p className="mt-3 text-base font-medium leading-7 text-zinc-100">
                    {item.headline}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    <span className="font-medium text-zinc-300">Why this matters:</span>{" "}
                    {item.whyItMatters}
                  </p>
                </div>

                <div className="shrink-0 text-xs uppercase tracking-[0.18em] text-zinc-500">
                  {formatPublishedAt(item.publishedAt)}
                </div>
              </div>
            );

            return item.url.trim().length > 0 ? (
              <a
                className={cardClassName}
                href={item.url}
                key={cardKey}
                rel="noreferrer"
                target="_blank"
              >
                {content}
              </a>
            ) : (
              <div className={cardClassName} key={cardKey}>
                {content}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default RecentDevelopmentsPanel;
