import {
  placeholderAnalysisReport,
  type AnalysisReport,
} from "@/lib/types";

export const analyzer = {
  async analyze(company: string): Promise<AnalysisReport> {
    return {
      ...placeholderAnalysisReport,
      company: company || placeholderAnalysisReport.company,
      summary: `Placeholder analysis for ${company || "the selected company"}.`,
      updatedAt: new Date().toISOString(),
    };
  },
};

export async function analyzeCompany(company: string): Promise<AnalysisReport> {
  return analyzer.analyze(company);
}

export default analyzer;
