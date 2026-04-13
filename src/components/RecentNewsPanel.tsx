import type { NewsHighlight } from "@/lib/types";

type RecentNewsPanelProps = {
  readonly items: readonly NewsHighlight[];
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

export function RecentNewsPanel({
  items,
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
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-zinc-100">{item.headline}</p>
                <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  {item.source}
                </span>
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
