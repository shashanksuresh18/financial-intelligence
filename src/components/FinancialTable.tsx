import type { FinancialMetric } from "@/lib/types";

interface FinancialTableProps {
  metrics?: FinancialMetric[];
}

export function FinancialTable({ metrics = [] }: FinancialTableProps) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b">
          <th className="py-2">Metric</th>
          <th className="py-2">Value</th>
          <th className="py-2">Period</th>
          <th className="py-2">Source</th>
        </tr>
      </thead>
      <tbody>
        {metrics.length === 0 ? (
          <tr>
            <td className="py-3 text-slate-500" colSpan={4}>
              No financial metrics yet.
            </td>
          </tr>
        ) : (
          metrics.map((metric) => (
            <tr
              className="border-b last:border-b-0"
              key={`${metric.label}-${metric.period ?? "na"}`}
            >
              <td className="py-2">{metric.label}</td>
              <td className="py-2">{metric.value ?? "-"}</td>
              <td className="py-2">{metric.period ?? "-"}</td>
              <td className="py-2">{metric.source ?? "-"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export default FinancialTable;
