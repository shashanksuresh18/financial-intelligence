import type { SectionAuditItem, WithheldSection } from "@/lib/types";

type SectionAuditPanelProps = {
  readonly items: readonly SectionAuditItem[];
  readonly withheldSections?: readonly WithheldSection[];
};

const STATUS_STYLES: Record<SectionAuditItem["status"], string> = {
  supported: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
  partial: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  limited: "border-rose-400/20 bg-rose-400/10 text-rose-100",
};

function summarize(items: readonly SectionAuditItem[]): {
  supported: number;
  partial: number;
  limited: number;
} {
  return items.reduce(
    (counts, item) => ({
      ...counts,
      [item.status]: counts[item.status] + 1,
    }),
    { supported: 0, partial: 0, limited: 0 },
  );
}

export function SectionAuditPanel({
  items,
  withheldSections = [],
}: SectionAuditPanelProps) {
  const summary = summarize(items);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-300">
          Memo Support Audit
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          A quick fact-check view of how well each note section is supported by the evidence set.
        </p>
        {items.length > 0 ? (
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
            {summary.supported} supported / {summary.partial} partial / {summary.limited} limited
          </p>
        ) : null}
      </div>

      {withheldSections.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-950/30 p-4 text-amber-100">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-200">
            {withheldSections.length} withheld section{withheldSections.length === 1 ? "" : "s"}
          </p>
          <div className="mt-3 space-y-2">
            {withheldSections.map((section) => (
              <div
                className="rounded-xl border border-amber-400/20 bg-zinc-950/30 px-3 py-2"
                key={`${section.section}-${section.reason}`}
              >
                <p className="text-xs uppercase tracking-[0.16em] text-amber-200">
                  {section.section.replace(/-/g, " ")}
                </p>
                <p className="mt-1 text-sm font-light leading-relaxed">
                  {section.userMessage}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-500">
            No section-level audit notes are available yet.
          </p>
        ) : (
          items.map((item, index) => (
            <div
              className={`rounded-xl border px-4 py-3 ${STATUS_STYLES[item.status]}`}
              key={`${item.section}-${index}`}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium">{item.section}</p>
                <span className="text-[11px] uppercase tracking-[0.18em] opacity-80">
                  {item.status}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 opacity-90">{item.note}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] opacity-75">
                {item.sources.length === 0 ? "No sources" : item.sources.join(" / ")}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default SectionAuditPanel;
