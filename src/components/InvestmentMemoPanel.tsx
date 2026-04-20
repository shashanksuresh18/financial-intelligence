import type { ReactNode } from "react";

import type {
  ConfidenceLevel,
  InvestmentMemo,
  InvestmentRecommendation,
  InvestmentRisk,
  ValidationSeverity,
} from "@/lib/types";

type InvestmentMemoPanelProps = {
  readonly memo: InvestmentMemo;
};

const RECOMMENDATION_STYLES: Record<InvestmentRecommendation, string> = {
  buy: "border-emerald-400/25 bg-emerald-950/40 text-emerald-200",
  watch: "border-blue-400/25 bg-blue-950/40 text-blue-200",
  hold: "border-amber-400/25 bg-amber-950/40 text-amber-200",
  avoid: "border-rose-400/25 bg-rose-950/40 text-rose-200",
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

const STRESS_TEST_SEVERITY_STYLES: Record<ValidationSeverity, string> = {
  high: "bg-rose-400/20 text-rose-200",
  medium: "bg-amber-400/20 text-amber-200",
  low: "bg-zinc-500/20 text-zinc-300",
};

function SectionCard({
  eyebrow,
  title,
  children,
  className = "",
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 ${className}`}>
      <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">{eyebrow}</p>
      <h4 className="mt-3 text-2xl font-semibold text-zinc-100">{title}</h4>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BulletList({
  items,
  emptyText,
}: {
  readonly items: readonly string[];
  readonly emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm font-light leading-relaxed text-zinc-500">{emptyText}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm font-light leading-relaxed text-zinc-300"
          key={item}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function RiskDot({ risk }: { readonly risk: InvestmentRisk }) {
  if (risk.category === "data-quality" || risk.category === "regulatory") {
    return <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 rounded-full bg-rose-400" />;
  }

  if (risk.category === "execution" || risk.category === "market") {
    return <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-400" />;
  }

  return <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 rounded-full bg-zinc-500" />;
}

function StressTestGroup({
  emptyText,
  items,
  title,
}: {
  readonly emptyText: string;
  readonly items: NonNullable<InvestmentMemo["stressTest"]>["unstatedAssumptions"];
  readonly title: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/65 p-4">
      <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">{title}</p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm font-light leading-relaxed text-zinc-500">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div
              className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4"
              key={`${title}-${item.claim}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-[0.16em] ${STRESS_TEST_SEVERITY_STYLES[item.severity]}`}
                >
                  {item.severity}
                </span>
                <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                  {item.citedSource}
                </span>
              </div>
              <p className="mt-3 text-sm font-light leading-relaxed text-zinc-300">
                {item.claim}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function InvestmentMemoPanel({ memo }: InvestmentMemoPanelProps) {
  const hasStressTestContent =
    memo.stressTest !== null &&
    memo.stressTest !== undefined &&
    (memo.stressTest.convictionDowngraded ||
      memo.stressTest.unstatedAssumptions.length > 0 ||
      memo.stressTest.evidenceGaps.length > 0 ||
      memo.stressTest.counterScenarios.length > 0);

  return (
    <section className="fi-fade-in space-y-6">
      <section className="rounded-[2rem] border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900/80 to-emerald-950/10 p-6 shadow-[0_26px_80px_-44px_rgba(0,0,0,0.98)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Investment Memo</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
              {memo.verdict}
            </h3>
            <p className="mt-4 text-sm font-light leading-relaxed text-zinc-400">
              A decision-first view of the opportunity set, framed around upside asymmetry,
              downside risk, and what still needs to be proven.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 xl:max-w-xl xl:justify-end">
            <span
              className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${RECOMMENDATION_STYLES[memo.recommendation]}`}
            >
              {RECOMMENDATION_LABELS[memo.recommendation]}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${CONVICTION_STYLES[memo.conviction]}`}
            >
              {CONVICTION_LABELS[memo.conviction]} Conviction
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-300">
              {memo.coverageProfile}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <SectionCard
          className="border-l-4 border-l-emerald-400/45"
          eyebrow="Core Thesis"
          title="Thesis"
        >
          <p className="text-sm font-light leading-relaxed text-zinc-300">{memo.thesis}</p>
          <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Anti-thesis</p>
            <p className="mt-3 text-sm font-light leading-relaxed text-zinc-400">
              {memo.antiThesis}
            </p>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Business Snapshot" title="What The Business Is">
          <p className="text-sm font-light leading-relaxed text-zinc-300">
            {memo.businessSnapshot}
          </p>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SectionCard eyebrow="Timing" title="Why Now">
          <BulletList
            emptyText="No time-sensitive drivers were extracted on this run."
            items={memo.whyNow}
          />

          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-950/25 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-rose-200">Key disqualifier</p>
            <p className="mt-3 text-sm font-light leading-relaxed text-rose-100">
              {memo.keyDisqualifier}
            </p>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Valuation" title="Valuation Case">
          <p className="text-sm font-light leading-relaxed text-zinc-300">{memo.valuationCase}</p>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          className="bg-emerald-400/5"
          eyebrow="Upside Case"
          title="What Has To Go Right"
        >
          <p className="text-sm font-light leading-relaxed text-zinc-300">{memo.upsideCase}</p>
        </SectionCard>

        <SectionCard
          className="bg-rose-400/5"
          eyebrow="Downside Case"
          title="What Can Break"
        >
          <p className="text-sm font-light leading-relaxed text-zinc-300">{memo.downsideCase}</p>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard eyebrow="Logic Support" title="Supporting Reasons">
          <BulletList
            emptyText="No explicit supporting reasons were generated."
            items={memo.logic.supportingReasons}
          />
        </SectionCard>

        <SectionCard eyebrow="Logic Limits" title="Confidence-Limiting Reasons">
          <BulletList
            emptyText="No explicit confidence limits were generated."
            items={memo.logic.confidenceLimitingReasons}
          />
        </SectionCard>
      </div>

      <SectionCard eyebrow="Monitoring" title="Catalysts And Confidence">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Near-term catalysts</p>
            <div className="mt-4">
              <BulletList
                emptyText="No near-term catalysts were extracted on this run."
                items={memo.catalystsToMonitor}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                What improves confidence
              </p>
              <div className="mt-4">
                <BulletList
                  emptyText="No explicit confidence improvements were generated."
                  items={memo.whatImprovesConfidence}
                />
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                What reduces confidence
              </p>
              <div className="mt-4">
                <BulletList
                  emptyText="No explicit confidence reductions were generated."
                  items={memo.whatReducesConfidence}
                />
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Key Risks" title="Principal Risks">
        {memo.keyRisks.length === 0 ? (
          <p className="text-sm font-light leading-relaxed text-zinc-500">
            No explicit risks were generated on this run.
          </p>
        ) : (
          <div className="space-y-3">
            {memo.keyRisks.map((risk) => (
              <div
                className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-4"
                key={`${risk.rank}-${risk.title}`}
              >
                <div className="flex items-start gap-3">
                  <RiskDot risk={risk} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                        #{risk.rank}
                      </span>
                      <p className="text-sm font-medium text-zinc-100">{risk.title}</p>
                    </div>
                    <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
                      {risk.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {memo.stressTest ? (
        <SectionCard
          className="bg-rose-950/20"
          eyebrow="Stress Test"
          title="Red-Team View"
        >
          <div className="space-y-5">
            {memo.stressTest.convictionDowngraded ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-950/35 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-rose-400/20 px-2 py-0.5 text-xs uppercase tracking-[0.16em] text-rose-200">
                    Conviction Downgraded
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em] text-rose-100/80">
                    Original conviction {CONVICTION_LABELS[memo.stressTest.originalConviction]}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <StressTestGroup
                emptyText="No unstated assumptions were surfaced on this run."
                items={memo.stressTest.unstatedAssumptions}
                title="Unstated Assumptions"
              />
              <StressTestGroup
                emptyText="No evidence gaps were surfaced on this run."
                items={memo.stressTest.evidenceGaps}
                title="Evidence Gaps"
              />
              <StressTestGroup
                emptyText="No counter-scenarios were surfaced on this run."
                items={memo.stressTest.counterScenarios}
                title="Counter-Scenarios"
              />
            </div>

            {hasStressTestContent ? (
              <div className="flex items-center gap-2 text-xs italic text-zinc-500">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4 text-zinc-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 3l7 3v6c0 4.5-2.9 7.8-7 9-4.1-1.2-7-4.5-7-9V6l7-3Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Stress-tested against Amakor investment mandate</span>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </section>
  );
}

export default InvestmentMemoPanel;
