import type { EvidenceClass, StreetView } from "@/lib/types";

import SectionInfoTooltip from "./SectionInfoTooltip";

type StreetViewPanelProps = {
  readonly streetView: StreetView | null;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  style: "currency",
});

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return CURRENCY_FORMATTER.format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(1)}%`;
}

const EVIDENCE_CLASS_LABELS: Record<EvidenceClass, string> = {
  "primary-filing": "Primary filing",
  registry: "Registry",
  "market-data-vendor": "Market data",
  "analyst-consensus": "Analyst consensus",
  "news-reporting": "News",
  "synthesized-web": "Synthesized web",
  "model-inference": "Model inference",
};

function EvidenceClassBadge({
  evidenceClass,
}: {
  readonly evidenceClass: EvidenceClass | null | undefined;
}) {
  if (evidenceClass === null || evidenceClass === undefined) {
    return null;
  }

  return (
    <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-300">
      {EVIDENCE_CLASS_LABELS[evidenceClass]}
    </span>
  );
}

export function StreetViewPanel({
  streetView,
}: StreetViewPanelProps) {
  if (streetView === null) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
              Street View
            </h3>
            <SectionInfoTooltip
              align="end"
              content="Public-market analyst positioning and targets. This is supporting context, not the house view."
            />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            No structured analyst or target-price evidence is available for this company yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
            Street View
          </h3>
          <SectionInfoTooltip
            align="end"
            content="Public-market analyst positioning and targets. This is supporting context, not the house view."
          />
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Consensus positioning, target-price framing, and recommendation trend context.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Consensus rating
            </p>
            <EvidenceClassBadge
              evidenceClass={streetView.latest?.evidenceClass ?? "analyst-consensus"}
            />
          </div>
          <p className="mt-2 text-2xl font-semibold text-zinc-50">
            {streetView.consensusRating ?? "Unavailable"}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Latest period {streetView.latest?.period ?? "-"}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Mean target
            </p>
            <EvidenceClassBadge
              evidenceClass={streetView.priceTarget?.evidenceClass ?? "analyst-consensus"}
            />
          </div>
          <p className="mt-2 text-2xl font-semibold text-zinc-50">
            {formatCurrency(streetView.priceTarget?.targetMean ?? null)}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Upside / downside {formatPercent(streetView.priceTarget?.upsidePercent ?? null)}
          </p>
          {streetView.priceTargetNote ? (
            <p className="mt-2 text-sm leading-6 text-amber-200/90">
              {streetView.priceTargetNote}
            </p>
          ) : null}
        </div>
      </div>

      {streetView.latest !== null ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Bullish</p>
              <EvidenceClassBadge evidenceClass={streetView.latest.evidenceClass} />
            </div>
            <p className="mt-2 text-xl font-semibold text-emerald-200">
              {streetView.latest.bullish}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Hold</p>
              <EvidenceClassBadge evidenceClass={streetView.latest.evidenceClass} />
            </div>
            <p className="mt-2 text-xl font-semibold text-amber-200">
              {streetView.latest.neutral}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Bearish</p>
              <EvidenceClassBadge evidenceClass={streetView.latest.evidenceClass} />
            </div>
            <p className="mt-2 text-xl font-semibold text-rose-200">
              {streetView.latest.bearish}
            </p>
          </div>
        </div>
      ) : null}

      {streetView.priceTarget !== null ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
          <div className="mb-2">
            <EvidenceClassBadge evidenceClass={streetView.priceTarget.evidenceClass} />
          </div>
          Target range {formatCurrency(streetView.priceTarget.targetLow)} to{" "}
          {formatCurrency(streetView.priceTarget.targetHigh)}; median{" "}
          {formatCurrency(streetView.priceTarget.targetMedian)}.
        </div>
      ) : null}

      {streetView.previous !== null ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
          <div className="mb-2">
            <EvidenceClassBadge evidenceClass={streetView.previous.evidenceClass} />
          </div>
          Prior period {streetView.previous.period}: {streetView.previous.bullish} bullish /{" "}
          {streetView.previous.neutral} hold / {streetView.previous.bearish} bearish.
        </div>
      ) : null}
    </section>
  );
}

export default StreetViewPanel;
