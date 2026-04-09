import type { MonitorItem } from "@/lib/types";

interface MonitorListProps {
  items?: MonitorItem[];
}

export function MonitorList({ items = [] }: MonitorListProps) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-base font-semibold">Monitoring</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {items.length === 0 ? (
          <li className="text-slate-500">No monitored companies yet.</li>
        ) : (
          items.map((item) => (
            <li
              className="flex items-center justify-between gap-4"
              key={item.id}
            >
              <span>{item.label}</span>
              <span>{item.status}</span>
              <span>{item.updatedAt}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export default MonitorList;
