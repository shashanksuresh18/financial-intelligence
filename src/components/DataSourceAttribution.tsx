import type { DataSource } from "@/lib/types";

type DataSourceAttributionProps = {
  readonly sources: readonly DataSource[];
  readonly updatedAt: string;
};

const SOURCE_DETAILS: Record<
  DataSource,
  { readonly label: string; readonly note: string }
> = {
  finnhub: {
    label: "Finnhub",
    note: "Market pricing, valuation metrics, analyst recommendation data, earnings history, and insider activity.",
  },
  fmp: {
    label: "FMP",
    note: "Historical multiples, forward estimates, peer comparison, enterprise values, and price-target consensus.",
  },
  "sec-edgar": {
    label: "SEC EDGAR",
    note: "Primary US filing data and XBRL financial facts.",
  },
  "companies-house": {
    label: "Companies House",
    note: "UK registry records, corporate status, company-profile metadata, and recent accounts filing history.",
  },
  gleif: {
    label: "GLEIF",
    note: "Global entity identity and legal registration metadata.",
  },
  "claude-fallback": {
    label: "Claude Fallback",
    note: "AI web-search enrichment for public-web company facts, narrative context, and hard-to-source private-company metrics. Verify figures against primary filings and official company documents.",
  },
};

function formatUpdatedAt(updatedAt: string): string {
  const parsed = new Date(updatedAt);

  if (Number.isNaN(parsed.getTime())) {
    return updatedAt;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function DataSourceAttribution({
  sources,
  updatedAt,
}: DataSourceAttributionProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Data Source Attribution
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Report assembled from {sources.length} active source{sources.length === 1 ? "" : "s"}.
          Last refreshed {formatUpdatedAt(updatedAt)}.
        </p>
      </div>

      <ul className="space-y-3">
        {sources.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-sm text-zinc-500">
            No structured sources were attributed to this report.
          </li>
        ) : (
          sources.map((source) => (
            <li
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-4"
              key={source}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-100">
                    {SOURCE_DETAILS[source].label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {SOURCE_DETAILS[source].note}
                  </p>
                </div>
                <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  Active
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export default DataSourceAttribution;
