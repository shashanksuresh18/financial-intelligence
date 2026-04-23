import type { NewsHighlight, NewsSentimentSummary } from "@/lib/types";

type RecentNewsPanelProps = {
  readonly items: readonly NewsHighlight[];
  readonly summary: NewsSentimentSummary | null;
};

const SENTIMENT_STYLES: Record<NewsHighlight["sentimentLabel"], string> = {
  positive: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  negative: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  neutral: "border-zinc-700 bg-zinc-900 text-zinc-300",
};

function getSummaryLabel(summary: NewsSentimentSummary): string {
  if (
    summary.label === "neutral" &&
    summary.positiveCount > 0 &&
    summary.negativeCount > 0
  ) {
    return "Mixed";
  }

  if (summary.label === "positive") {
    return "Constructive";
  }

  if (summary.label === "negative") {
    return "Cautious";
  }

  return "Neutral";
}

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

export function RecentNewsPanel({
  items,
  summary,
}: RecentNewsPanelProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Recent News
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Latest reported headlines connected to the company from Finnhub coverage.
        </p>
      </div>

      {summary !== null ? (
        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${SENTIMENT_STYLES[summary.label]}`}
            >
              {getSummaryLabel(summary)}
            </span>
            <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              {summary.articleCount} headlines • score {summary.score.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{summary.rationale}</p>
        </div>
      ) : null}

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-sm text-zinc-500">
            No recent headline coverage is available for this company yet.
          </div>
        ) : (
          items.map((item) => (
            <a
              className="block rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 transition hover:border-zinc-700 hover:bg-zinc-900"
              href={item.url}
              key={`${item.source}-${item.publishedAt}-${item.headline}`}
              rel="noreferrer"
              target="_blank"
              title={item.sentimentRationale}
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-zinc-100">{item.headline}</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${SENTIMENT_STYLES[item.sentimentLabel]}`}
                  >
                    {item.sentimentLabel}
                  </span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                    {item.source}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {item.summary.trim().length > 0 ? item.summary : "No summary provided."}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                Published {formatPublishedAt(item.publishedAt)}
              </p>
            </a>
          ))
        )}
      </div>
    </section>
  );
}

export default RecentNewsPanel;
