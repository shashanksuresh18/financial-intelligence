import type { DataSource, EntityResolution } from "@/lib/types";

type EntityResolutionPanelProps = {
  readonly entityResolution: EntityResolution;
};

const SOURCE_LABELS: Record<DataSource, string> = {
  finnhub: "Finnhub",
  fmp: "FMP",
  "sec-edgar": "SEC EDGAR",
  "companies-house": "Companies House",
  gleif: "GLEIF",
  "exa-deep": "Exa Deep",
  "claude-fallback": "Claude Fallback",
};

export function EntityResolutionPanel({
  entityResolution,
}: EntityResolutionPanelProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Entity Resolution
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Canonical name, identifiers, and the source used to resolve the company.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Canonical company</p>
        <p className="mt-2 text-xl font-semibold text-zinc-50">
          {entityResolution.canonicalName}
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{entityResolution.note}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {entityResolution.matchedSources.length === 0 ? (
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
            No matched sources
          </span>
        ) : (
          entityResolution.matchedSources.map((source) => (
            <span
              className="whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-300"
              key={source}
            >
              {SOURCE_LABELS[source]}
            </span>
          ))
        )}
      </div>

      <div className="mt-4 space-y-3">
        {entityResolution.identifiers.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-500">
            No structured identifiers were attached to this report.
          </p>
        ) : (
          entityResolution.identifiers.map((item, index) => (
            <div
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3"
              key={`${item.label}-${item.value}-${index}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{item.label}</p>
                <span className="whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-400">
                  {SOURCE_LABELS[item.source]}
                </span>
              </div>
              <p className="mt-2 break-words text-base font-medium text-zinc-100">
                {item.value}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default EntityResolutionPanel;
