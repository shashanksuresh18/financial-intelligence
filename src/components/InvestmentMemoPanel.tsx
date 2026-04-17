import type { ReactNode } from "react";

import type {
  ConfidenceLevel,
  InvestmentMemo,
  InvestmentRecommendation,
  InvestmentRisk,
} from "@/lib/types";

type InvestmentMemoPanelProps = {
  readonly memo: InvestmentMemo;
};

const RECOMMENDATION_STYLES: Record<InvestmentRecommendation, string> = {
  buy: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  watch: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  hold: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  avoid: "border-rose-400/20 bg-rose-400/10 text-rose-200",
};

const CONVICTION_STYLES: Record<ConfidenceLevel, string> = {
  high: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  medium: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  low: "border-zinc-700 bg-zinc-900 text-zinc-300",
};

const RECOMMENDATION_LABELS: Record<InvestmentRecommendation, string> = {
  buy: "Buy",
  watch: "Watch",
  hold: "Hold",
  avoid: "Avoid",
};

const CONVICTION_LABELS: Record<ConfidenceLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const RISK_CATEGORY_STYLES: Record<InvestmentRisk["category"], string> = {
  structural: "border-zinc-700 bg-zinc-900 text-zinc-300",
  execution: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  regulatory: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200",
  market: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  "data-quality": "border-rose-400/20 bg-rose-400/10 text-rose-200",
};

function BulletList({
  items,
  emptyText,
}: {
  readonly items: readonly string[];
  readonly emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-zinc-500">{emptyText}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm leading-6 text-zinc-300"
          key={item}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function SectionCard({
  title,
  children,
  className = "",
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RiskCard({ risk }: { readonly risk: InvestmentRisk }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          #{risk.rank}
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${RISK_CATEGORY_STYLES[risk.category]}`}
        >
          {risk.category}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-100">{risk.title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{risk.detail}</p>
    </div>
  );
}

export function InvestmentMemoPanel({ memo }: InvestmentMemoPanelProps) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-950 to-emerald-950/10 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
            Investment Memo
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">
            {memo.verdict}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 xl:max-w-md xl:justify-end">
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${RECOMMENDATION_STYLES[memo.recommendation]}`}
          >
            {RECOMMENDATION_LABELS[memo.recommendation]}
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${CONVICTION_STYLES[memo.conviction]}`}
          >
            {CONVICTION_LABELS[memo.conviction]} Conviction
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
            {memo.coverageProfile}
          </span>
        </div>
      </div>

      <SectionCard className="mt-6" title="Investment View">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Why now
              </p>
              <div className="mt-3">
                <BulletList
                  emptyText="No time-sensitive drivers were extracted on this run."
                  items={memo.whyNow}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Upside case
                </p>
                <p className="mt-3 text-sm leading-7 text-zinc-300">{memo.upsideCase}</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Downside case
                </p>
                <p className="mt-3 text-sm leading-7 text-zinc-300">{memo.downsideCase}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-200">
                Key disqualifier
              </p>
              <p className="mt-3 text-sm leading-7 text-rose-100">{memo.keyDisqualifier}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Supporting reasons
              </p>
              <div className="mt-3">
                <BulletList
                  emptyText="No explicit supporting reasons were generated."
                  items={memo.logic.supportingReasons}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Confidence-limiting reasons
              </p>
              <div className="mt-3">
                <BulletList
                  emptyText="No explicit confidence limits were generated."
                  items={memo.logic.confidenceLimitingReasons}
                />
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard title="Core Thesis">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Thesis
              </p>
              <p className="mt-2 text-sm leading-7 text-zinc-300">{memo.thesis}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Anti-thesis
              </p>
              <p className="mt-2 text-sm leading-7 text-zinc-300">{memo.antiThesis}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Business Snapshot">
          <p className="text-sm leading-7 text-zinc-300">{memo.businessSnapshot}</p>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SectionCard title="Valuation Case">
          <p className="text-sm leading-7 text-zinc-300">{memo.valuationCase}</p>
        </SectionCard>

        <SectionCard title="Catalysts and What to Monitor">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Near-term catalysts
              </p>
              <div className="mt-3">
                <BulletList
                  emptyText="No near-term catalysts were extracted on this run."
                  items={memo.catalystsToMonitor}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  What improves confidence
                </p>
                <div className="mt-3">
                  <BulletList
                    emptyText="No explicit confidence improvements were generated."
                    items={memo.whatImprovesConfidence}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  What reduces confidence
                </p>
                <div className="mt-3">
                  <BulletList
                    emptyText="No explicit confidence reductions were generated."
                    items={memo.whatReducesConfidence}
                  />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard className="mt-4" title="Key Risks">
        <div className="grid gap-4 xl:grid-cols-2">
          {memo.keyRisks.length === 0 ? (
            <p className="text-sm leading-6 text-zinc-500">
              No explicit risks were generated on this run.
            </p>
          ) : (
            memo.keyRisks.map((risk) => <RiskCard key={`${risk.rank}-${risk.title}`} risk={risk} />)
          )}
        </div>
      </SectionCard>

    </section>
  );
}

export default InvestmentMemoPanel;
