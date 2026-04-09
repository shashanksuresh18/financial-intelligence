import type { AnalysisReport } from "@/lib/types";

export async function generateClaudeNarrative(
  report: AnalysisReport,
): Promise<string> {
  return `Placeholder narrative for ${report.company}.`;
}

export const claudeNarrativePlaceholder =
  "Placeholder narrative until Claude integration is implemented.";
