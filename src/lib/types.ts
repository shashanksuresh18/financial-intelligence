export type ConfidenceLevel = "low" | "medium" | "high";

export interface ConfidenceScore {
  score: number;
  level: ConfidenceLevel;
  rationale: string;
}

export interface SearchResult {
  id: string;
  name: string;
  ticker?: string;
  jurisdiction?: string;
  description?: string;
}

export interface FinancialMetric {
  label: string;
  value: number | string | null;
  period?: string;
  source?: string;
}

export interface AnalystConsensusEntry {
  firm: string;
  rating: string;
  targetPrice: number | null;
}

export interface MonitorItem {
  id: string;
  label: string;
  status: "idle" | "watching";
  updatedAt: string;
}

export interface DataSourceResult<T> {
  source: string;
  data: T;
  fetchedAt: string;
}

export interface AnalysisReport {
  company: string;
  summary: string;
  narrative: string;
  confidence: ConfidenceScore;
  metrics: FinancialMetric[];
  analystConsensus: AnalystConsensusEntry[];
  sources: string[];
  updatedAt: string;
}

export const placeholderConfidence: ConfidenceScore = {
  score: 50,
  level: "medium",
  rationale: "Placeholder confidence until the scoring model is implemented.",
};

export const placeholderAnalysisReport: AnalysisReport = {
  company: "Placeholder Company",
  summary: "Analysis placeholder.",
  narrative: "Narrative placeholder.",
  confidence: placeholderConfidence,
  metrics: [],
  analystConsensus: [],
  sources: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export type Placeholder = AnalysisReport;
