import type { MonitorItem } from "@/lib/types";

type MonitorListProps = {
  readonly items?: readonly MonitorItem[];
  readonly onSelect?: (item: MonitorItem) => void;
  readonly onRemove?: (item: MonitorItem) => void;
  readonly activeItemLabel?: string | null;
  readonly disabled?: boolean;
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

export function MonitorList({
  items = [],
  onSelect,
  onRemove,
  activeItemLabel = null,
  disabled = false,
}: MonitorListProps) {
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

      <ul className="space-y-3">
        {items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-sm text-zinc-500">
            No monitored companies yet.
          </li>
        ) : (
          items.map((item) => (
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
                    <p className="text-sm font-medium text-zinc-100">{item.label}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Updated {formatUpdatedAt(item.updatedAt)}
                    </p>
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
