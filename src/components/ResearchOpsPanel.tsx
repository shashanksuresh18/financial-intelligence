import type {
  CoverageGap,
  DataSource,
  DisagreementNote,
  EvidenceClass,
  EvidenceSignal,
} from "@/lib/types";

type ResearchOpsPanelProps = {
  readonly evidenceSignals: readonly EvidenceSignal[];
  readonly coverageGaps: readonly CoverageGap[];
  readonly disagreementNotes: readonly DisagreementNote[];
};

const TONE_STYLES: Record<EvidenceSignal["tone"], string> = {
  positive: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
  negative: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  neutral: "border-zinc-700 bg-zinc-900/70 text-zinc-100",
};

const SEVERITY_STYLES: Record<CoverageGap["severity"], string> = {
  low: "border-zinc-700 bg-zinc-900/70 text-zinc-100",
  medium: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  high: "border-rose-400/20 bg-rose-400/10 text-rose-100",
};

const EVIDENCE_CLASS_LABELS: Record<EvidenceClass, string> = {
  "primary-filing": "Primary filing",
  registry: "Registry",
  "market-data-vendor": "Market data",
  "analyst-consensus": "Analyst consensus",
  "news-reporting": "News",
  "synthesized-web": "Synthesized web",
  "model-inference": "Model inference",
};

function sourceToEvidenceClass(source: DataSource): EvidenceClass {
  if (source === "sec-edgar") {
    return "primary-filing";
  }

  if (source === "companies-house" || source === "gleif") {
    return "registry";
  }

  if (source === "exa-deep") {
    return "synthesized-web";
  }

  if (source === "claude-fallback") {
    return "model-inference";
  }

  return "market-data-vendor";
}

function getSignalEvidenceClass(item: EvidenceSignal): EvidenceClass {
  return item.evidenceClass ?? sourceToEvidenceClass(item.sources[0] ?? "claude-fallback");
}

function EvidenceClassBadge({ evidenceClass }: { readonly evidenceClass: EvidenceClass }) {
  return (
    <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-300">
      {EVIDENCE_CLASS_LABELS[evidenceClass]}
    </span>
  );
}

function formatSources(sources: readonly string[]): string {
  return sources.join(" • ");
}

export function ResearchOpsPanel({
  evidenceSignals,
  coverageGaps,
  disagreementNotes,
}: ResearchOpsPanelProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Evidence Readout
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Prioritized support, explicit gaps, and tensions surfaced from the evidence set.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Key Signals
          </h4>
          <div className="mt-3 space-y-3">
            {evidenceSignals.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-500">
                No prioritized evidence signals were extracted yet.
              </p>
            ) : (
              evidenceSignals.map((item, index) => (
                <div
                  className={`rounded-xl border px-4 py-3 ${TONE_STYLES[item.tone]}`}
                  key={`${item.title}-${index}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    <EvidenceClassBadge evidenceClass={getSignalEvidenceClass(item)} />
                  </div>
                  <p className="mt-2 text-sm leading-6 opacity-90">{item.detail}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.18em] opacity-75">
                    {formatSources(item.sources)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Coverage Gaps
          </h4>
          <div className="mt-3 space-y-3">
            {coverageGaps.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-500">
                No material coverage gaps were flagged.
              </p>
            ) : (
              coverageGaps.map((item, index) => (
                <div
                  className={`rounded-xl border px-4 py-3 ${SEVERITY_STYLES[item.severity]}`}
                  key={`${item.title}-${index}`}
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 opacity-90">{item.detail}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.18em] opacity-75">
                    {item.severity} severity
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Tensions & Checks
          </h4>
          <div className="mt-3 space-y-3">
            {disagreementNotes.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-500">
                No major disagreements were detected in the current evidence set.
              </p>
            ) : (
              disagreementNotes.map((item, index) => (
                <div
                  className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-3 text-zinc-100"
                  key={`${item.title}-${index}`}
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{item.detail}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    {formatSources(item.sources)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ResearchOpsPanel;
