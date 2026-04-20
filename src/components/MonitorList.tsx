import type { MonitorItem } from "@/lib/types";

type MonitorSortKey = "confidence" | "freshness" | "evidence-depth";

type MonitorListProps = {
  readonly items?: readonly MonitorItem[];
  readonly onSelect?: (item: MonitorItem) => void;
  readonly onRemove?: (item: MonitorItem) => void;
  readonly activeItemLabel?: string | null;
  readonly disabled?: boolean;
  readonly sortKey?: MonitorSortKey;
  readonly onSortChange?: (sortKey: MonitorSortKey) => void;
};

const SORT_OPTIONS: readonly { key: MonitorSortKey; label: string }[] = [
  { key: "confidence", label: "Confidence" },
  { key: "freshness", label: "Freshness" },
  { key: "evidence-depth", label: "Evidence Depth" },
];

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

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function getConfidenceSortValue(item: MonitorItem): number {
  return item.snapshot?.confidenceScore ?? -1;
}

function getFreshnessSortValue(item: MonitorItem): number {
  return item.snapshot ? parseTimestamp(item.snapshot.updatedAt) : 0;
}

function compareEvidenceDepth(left: MonitorItem, right: MonitorItem): number {
  const leftSnapshot = left.snapshot;
  const rightSnapshot = right.snapshot;

  if (leftSnapshot === null || leftSnapshot === undefined) {
    return rightSnapshot === null || rightSnapshot === undefined ? 0 : -1;
  }

  if (rightSnapshot === null || rightSnapshot === undefined) {
    return 1;
  }

  return (
    leftSnapshot.metricCount - rightSnapshot.metricCount ||
    leftSnapshot.sourceCount - rightSnapshot.sourceCount ||
    leftSnapshot.supported - rightSnapshot.supported ||
    leftSnapshot.partial - rightSnapshot.partial ||
    rightSnapshot.limited - leftSnapshot.limited ||
    getFreshnessSortValue(left) - getFreshnessSortValue(right)
  );
}

function sortItems(
  items: readonly MonitorItem[],
  sortKey: MonitorSortKey,
): readonly MonitorItem[] {
  return [...items].sort((left, right) => {
    if (sortKey === "confidence") {
      return (
        getConfidenceSortValue(left) - getConfidenceSortValue(right) ||
        compareEvidenceDepth(left, right) ||
        getFreshnessSortValue(left) - getFreshnessSortValue(right)
      );
    }

    if (sortKey === "freshness") {
      return (
        getFreshnessSortValue(left) - getFreshnessSortValue(right) ||
        getConfidenceSortValue(left) - getConfidenceSortValue(right) ||
        compareEvidenceDepth(left, right)
      );
    }

    return (
      compareEvidenceDepth(left, right) ||
      getConfidenceSortValue(left) - getConfidenceSortValue(right) ||
      getFreshnessSortValue(left) - getFreshnessSortValue(right)
    );
  });
}

function getConfidenceDotClass(item: MonitorItem): string {
  if (item.snapshot === null || item.snapshot === undefined) {
    return "bg-zinc-500";
  }

  if (item.snapshot.confidenceLevel === "high") {
    return "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.45)]";
  }

  if (item.snapshot.confidenceLevel === "medium") {
    return "bg-amber-400";
  }

  return "bg-zinc-500";
}

function getSortLabel(sortKey: MonitorSortKey): string {
  return SORT_OPTIONS.find((option) => option.key === sortKey)?.label ?? "Confidence";
}

export function MonitorList({
  items = [],
  onSelect,
  onRemove,
  activeItemLabel = null,
  disabled = false,
  sortKey = "confidence",
  onSortChange,
}: MonitorListProps) {
  const sortedItems = sortItems(items, sortKey);

  return (
    <section className="fi-fade-in rounded-[2rem] border border-zinc-800 bg-zinc-900/55 p-6 shadow-[0_28px_80px_-52px_rgba(0,0,0,0.95)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Monitor List</p>
          <h2 className="mt-3 text-2xl font-semibold text-zinc-100">Saved Companies</h2>
          <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
            Keep diligence targets close and reopen the latest report snapshot in one click.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Watched</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-100">{items.length}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
        <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">Sort</span>
        {SORT_OPTIONS.map((option) => (
          <button
            className={`fi-focus-ring fi-interactive rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${
              option.key === sortKey
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                : "border-zinc-800 bg-zinc-900/80 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            } disabled:cursor-not-allowed disabled:opacity-60`}
            disabled={disabled || items.length < 2}
            key={option.key}
            onClick={() => {
              onSortChange?.(option.key);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-xs uppercase tracking-[0.22em] text-zinc-600">
          Sorted by {getSortLabel(sortKey)}
        </span>
      </div>

      <ul className="mt-5 space-y-3">
        {items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/35 px-4 py-8 text-sm font-light text-zinc-500">
            No monitored companies yet.
          </li>
        ) : (
          sortedItems.map((item) => {
            const isActive = activeItemLabel === item.label;

            return (
              <li
                className={`group fi-card-hover rounded-2xl border ${
                  isActive
                    ? "border-emerald-400/25 bg-emerald-950/15 shadow-[0_20px_50px_-34px_rgba(16,185,129,0.38)]"
                    : "border-zinc-800 bg-zinc-950/65 hover:border-zinc-700"
                }`}
                key={item.id}
              >
                <div className="flex items-start gap-3 px-4 py-4">
                  <button
                    className="fi-focus-ring fi-interactive min-w-0 flex-1 text-left"
                    disabled={disabled}
                    onClick={() => {
                      onSelect?.(item);
                    }}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${getConfidenceDotClass(item)}`}
                          />
                          <p className="truncate text-sm font-medium text-zinc-100">
                            {item.label}
                          </p>
                        </div>
                        <p className="mt-2 text-xs uppercase tracking-[0.22em] text-zinc-500">
                          Updated {formatUpdatedAt(item.updatedAt)}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${
                          item.status === "watching"
                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    {item.snapshot ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em]">
                        <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-zinc-300">
                          {item.snapshot.confidenceScore}/100
                        </span>
                        <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-zinc-400">
                          {item.snapshot.sourceCount} sources
                        </span>
                        <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-zinc-400">
                          {item.snapshot.metricCount} metrics
                        </span>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                        No cached report snapshot yet
                      </p>
                    )}

                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                      {isActive ? "Loaded now" : "Click to load"}
                    </p>
                  </button>

                  <button
                    aria-label={`Remove ${item.label} from monitor list`}
                    className="fi-focus-ring fi-interactive rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200 opacity-0 hover:border-rose-300/35 hover:bg-rose-400/15 group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={disabled}
                    onClick={() => {
                      onRemove?.(item);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

export default MonitorList;
