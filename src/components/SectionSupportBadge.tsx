import type { SectionAuditItem } from "@/lib/types";

type SectionSupportBadgeProps = {
  readonly items: readonly SectionAuditItem[];
};

function getCounts(items: readonly SectionAuditItem[]): {
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

function getBadgeStyles(items: readonly SectionAuditItem[]): string {
  const counts = getCounts(items);

  if (counts.limited > 0) {
    return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  }

  if (counts.partial > 0) {
    return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  }

  return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
}

export function SectionSupportBadge({
  items,
}: SectionSupportBadgeProps) {
  const counts = getCounts(items);
  const label =
    items.length === 0
      ? "no audit"
      : `${counts.supported} supported / ${counts.partial} partial / ${counts.limited} limited`;

  return (
    <div
      className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${getBadgeStyles(items)}`}
      title="Section support summary derived from the audit layer."
    >
      <span>Support</span>
      <span className="text-[11px] text-white/75">{label}</span>
    </div>
  );
}

export default SectionSupportBadge;
