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

function snapshotTone(score: number): string {
  if (score >= 75) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (score >= 45) {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }

  return "border-rose-400/20 bg-rose-400/10 text-rose-200";
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

function getSortDescription(sortKey: MonitorSortKey): string {
  switch (sortKey) {
    case "confidence":
      return "Lowest confidence first so weakly supported names rise to the top.";
    case "freshness":
      return "Oldest snapshots first so stale research is easiest to spot.";
    case "evidence-depth":
      return "Thinnest evidence first so shallow coverage gets attention early.";
  }
}

const SORT_OPTIONS: readonly { key: MonitorSortKey; label: string }[] = [
  { key: "confidence", label: "Confidence" },
  { key: "freshness", label: "Freshness" },
  { key: "evidence-depth", label: "Evidence Depth" },
];

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
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/75 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
            Monitor List
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Companies added from search stay here for follow-up review.
          </p>
        </div>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
          {items.length}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SORT_OPTIONS.map((option) => (
          <button
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
              option.key === sortKey
                ? "border-emerald-400/25 bg-emerald-400/12 text-emerald-200"
                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
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
      </div>

      <p className="mb-4 text-xs leading-5 text-zinc-500">
        {getSortDescription(sortKey)}
      </p>

      <ul className="space-y-3">
        {items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-sm text-zinc-500">
            No monitored companies yet.
          </li>
        ) : (
          sortedItems.map((item, index) => (
            <li
              className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-4"
              key={item.id}
            >
              <div className="flex items-start justify-between gap-4">
                <button
                  className="min-w-0 flex-1 text-left"
                  disabled={disabled}
                  onClick={() => {
                    onSelect?.(item);
                  }}
                  type="button"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                        #{index + 1}
                      </span>
                      <p className="text-sm font-medium text-zinc-100">{item.label}</p>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Updated {formatUpdatedAt(item.updatedAt)}
                    </p>
                    {item.snapshot ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${snapshotTone(item.snapshot.confidenceScore)}`}>
                          {item.snapshot.confidenceScore}/100 {item.snapshot.confidenceLevel}
                        </span>
                        <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                          {item.snapshot.supported}/{item.snapshot.partial}/{item.snapshot.limited} support
                        </span>
                        <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                          {item.snapshot.sourceCount} src / {item.snapshot.metricCount} metrics
                        </span>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
                        No cached report snapshot yet
                      </p>
                    )}
                    <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">
                      {activeItemLabel === item.label ? "Loaded now" : "Click to load"}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                    {item.status}
                  </span>
                  <button
                    className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-200 transition hover:border-rose-300/35 hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={disabled}
                    onClick={() => {
                      onRemove?.(item);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export default MonitorList;
