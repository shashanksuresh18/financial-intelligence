import {
  placeholderAnalysisReport,
  type AnalysisReport,
} from "@/lib/types";

import AnalystConsensus from "./AnalystConsensus";
import ConfidenceBadge from "./ConfidenceBadge";
import FinancialTable from "./FinancialTable";

interface ReportProps {
  report?: AnalysisReport;
}

export function Report({ report = placeholderAnalysisReport }: ReportProps) {
  return (
    <section className="space-y-4 rounded-2xl border p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{report.company}</h2>
          <p className="text-sm text-slate-600">{report.summary}</p>
        </div>
        <ConfidenceBadge confidence={report.confidence} />
      </div>

      <p className="text-sm leading-6 text-slate-700">{report.narrative}</p>

      <FinancialTable metrics={report.metrics} />
      <AnalystConsensus items={report.analystConsensus} />
    </section>
  );
}

export default Report;
