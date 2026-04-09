export type DataSource =
  | "finnhub"
  | "sec-edgar"
  | "companies-house"
  | "gleif"
  | "claude-fallback";

export type ConfidenceLevel = "low" | "medium" | "high";

export type FiscalPeriod = "Q1" | "Q2" | "Q3" | "Q4" | "FY";

export type AnalystRating =
  | "Strong Buy"
  | "Buy"
  | "Hold"
  | "Sell"
  | "Strong Sell"
  | string;

export type ApiResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

export type ConfidenceScore = {
  readonly score: number;
  readonly level: ConfidenceLevel;
  readonly rationale: string;
};

export type SearchResult = {
  readonly id: string;
  readonly name: string;
  readonly ticker?: string;
  readonly jurisdiction?: string;
  readonly description?: string;
};

export type FinancialMetric = {
  readonly label: string;
  readonly value: number | string | null;
  readonly period?: string;
  readonly source?: DataSource;
};

export type AnalystConsensusEntry = {
  readonly firm: string;
  readonly rating: AnalystRating;
  readonly targetPrice: number | null;
};

export type MonitorItem = {
  readonly id: string;
  readonly label: string;
  readonly status: "idle" | "watching";
  readonly updatedAt: string;
};

export type DataSourceResult<T> = {
  readonly source: DataSource;
  readonly data: T;
  readonly fetchedAt: string;
  readonly error?: string;
};

export type AnalysisReport = {
  readonly company: string;
  readonly summary: string;
  readonly narrative: string;
  readonly confidence: ConfidenceScore;
  readonly metrics: readonly FinancialMetric[];
  readonly analystConsensus: readonly AnalystConsensusEntry[];
  readonly sources: readonly DataSource[];
  readonly updatedAt: string;
};

export type FinnhubQuote = {
  readonly c: number;
  readonly d: number | null;
  readonly dp: number | null;
  readonly h: number;
  readonly l: number;
  readonly o: number;
  readonly pc: number;
  readonly t: number;
};

export type FinnhubSymbolMatch = {
  readonly description: string;
  readonly displaySymbol: string;
  readonly symbol: string;
  readonly type: string;
};

export type FinnhubSymbolSearchResponse = {
  readonly count: number;
  readonly result: readonly FinnhubSymbolMatch[];
};

export type FinnhubRecommendation = {
  readonly buy: number;
  readonly hold: number;
  readonly period: string;
  readonly sell: number;
  readonly strongBuy: number;
  readonly strongSell: number;
  readonly symbol: string;
};

export type FinnhubNewsItem = {
  readonly category: string;
  readonly datetime: number;
  readonly headline: string;
  readonly id: number;
  readonly image: string;
  readonly related: string;
  readonly source: string;
  readonly summary: string;
  readonly url: string;
};

export type FinnhubData = {
  readonly symbol: string;
  readonly quote: FinnhubQuote | null;
  readonly recommendations: readonly FinnhubRecommendation[];
  readonly news: readonly FinnhubNewsItem[];
};

export type SecFiling = {
  readonly accessionNumber: string;
  readonly filingDate: string;
  readonly form: string;
  readonly primaryDocument: string;
  readonly primaryDocDescription: string;
};

export type SecCompanyInfo = {
  readonly cik: string;
  readonly name: string;
  readonly sic: string;
  readonly sicDescription: string;
  readonly tickers: readonly string[];
  readonly exchanges: readonly string[];
  readonly filings: {
    readonly recent: {
      readonly accessionNumber: readonly string[];
      readonly filingDate: readonly string[];
      readonly form: readonly string[];
      readonly primaryDocument: readonly string[];
      readonly primaryDocDescription: readonly string[];
    };
  };
};

export type SecXbrlFact = {
  readonly val: number;
  readonly accn: string;
  readonly fy: number | null;
  readonly fp: FiscalPeriod | string;
  readonly form: string;
  readonly filed: string;
  readonly frame: string | null;
  readonly start?: string;
  readonly end: string;
};

export type SecXbrlUnit = Record<string, readonly SecXbrlFact[]>;

export type SecXbrlConcept = {
  readonly label: string;
  readonly description: string;
  readonly units: SecXbrlUnit;
};

export type SecXbrlFacts = {
  readonly cik: number;
  readonly entityName: string;
  readonly facts: {
    readonly "us-gaap"?: Record<string, SecXbrlConcept>;
    readonly "dei"?: Record<string, SecXbrlConcept>;
    readonly "ifrs-full"?: Record<string, SecXbrlConcept>;
  };
};

export type SecEdgarData = {
  readonly cik: string;
  readonly companyInfo: SecCompanyInfo | null;
  readonly recentFilings: readonly SecFiling[];
  readonly xbrlFacts: SecXbrlFacts | null;
};

export type CompaniesHouseAddress = {
  readonly address_line_1?: string;
  readonly address_line_2?: string;
  readonly locality?: string;
  readonly postal_code?: string;
  readonly country?: string;
};

export type CompaniesHouseCompany = {
  readonly company_number: string;
  readonly company_name: string;
  readonly company_status:
    | "active"
    | "dissolved"
    | "liquidation"
    | "administration"
    | string;
  readonly company_type: string;
  readonly date_of_creation?: string;
  readonly registered_office_address: CompaniesHouseAddress;
  readonly description?: string;
};

export type CompaniesHouseSearchResponse = {
  readonly items: readonly CompaniesHouseCompany[];
  readonly total_results: number;
  readonly start_index: number;
  readonly items_per_page: number;
  readonly kind: string;
};

export type CompaniesHouseData = {
  readonly company: CompaniesHouseCompany | null;
  readonly allMatches: readonly CompaniesHouseCompany[];
};

export type GleifName = {
  readonly name: string;
  readonly language: string;
};

export type GleifAddress = {
  readonly lang: string;
  readonly addressLines: readonly string[];
  readonly city: string;
  readonly region?: string;
  readonly country: string;
  readonly postalCode?: string;
};

export type GleifRegistration = {
  readonly initialRegistrationDate: string;
  readonly lastUpdateDate: string;
  readonly status:
    | "ISSUED"
    | "LAPSED"
    | "MERGED"
    | "RETIRED"
    | "ANNULLED"
    | "DUPLICATE"
    | "TRANSFERRED"
    | "PENDING_TRANSFER"
    | "PENDING_ARCHIVAL"
    | string;
  readonly nextRenewalDate: string;
  readonly managingLou: string;
};

export type GleifEntity = {
  readonly legalName: GleifName;
  readonly otherNames?: readonly GleifName[];
  readonly legalAddress: GleifAddress;
  readonly headquartersAddress: GleifAddress;
  readonly registeredAt?: { readonly id: string };
  readonly jurisdiction: string;
  readonly category:
    | "GENERAL"
    | "BRANCH"
    | "FUND"
    | "SOLE_PROPRIETOR"
    | string;
  readonly legalForm: { readonly id: string };
};

export type GleifAttributes = {
  readonly lei: string;
  readonly entity: GleifEntity;
  readonly registration: GleifRegistration;
};

export type GleifRecord = {
  readonly type: string;
  readonly id: string;
  readonly attributes: GleifAttributes;
};

export type GleifSearchResponse = {
  readonly data: readonly GleifRecord[];
  readonly meta: {
    readonly total: number;
    readonly page: number;
  };
};

export type GleifData = {
  readonly record: GleifRecord | null;
  readonly allMatches: readonly GleifRecord[];
};

export type ClaudeFallbackResult = {
  readonly narrative: string;
  readonly extractedMetrics: readonly FinancialMetric[];
  readonly disclaimer: string;
};

export type WaterfallInput = {
  readonly query: string;
  readonly hint?: "us-public" | "uk" | "global" | "private";
};

export type WaterfallResult = {
  readonly query: string;
  readonly finnhub: DataSourceResult<FinnhubData> | null;
  readonly secEdgar: DataSourceResult<SecEdgarData> | null;
  readonly companiesHouse: DataSourceResult<CompaniesHouseData> | null;
  readonly gleif: DataSourceResult<GleifData> | null;
  readonly claudeFallback: DataSourceResult<ClaudeFallbackResult> | null;
  readonly activeSources: readonly DataSource[];
};

export type NarrativeInput = {
  readonly company: string;
  readonly waterfallResult: WaterfallResult;
  readonly confidence: ConfidenceScore;
};

export type AnalyzeApiResponse = {
  readonly ok: boolean;
  readonly report?: AnalysisReport;
  readonly error?: string;
};

export type SearchApiResponse = {
  readonly ok: boolean;
  readonly results: readonly SearchResult[];
  readonly error?: string;
};

export type MonitorApiResponse = {
  readonly ok: boolean;
  readonly items: readonly MonitorItem[];
  readonly error?: string;
};

export type MonitoredCompanyRecord = {
  readonly id: string;
  readonly companyName: string;
  readonly companyId: string;
  readonly status: "idle" | "watching";
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AnalysisCacheRecord = {
  readonly id: string;
  readonly companyId: string;
  readonly report: AnalysisReport;
  readonly createdAt: string;
  readonly expiresAt: string;
};

export const placeholderConfidence: ConfidenceScore = {
  score: 50,
  level: "medium",
  rationale: "Placeholder confidence until source-backed scoring is implemented.",
};

export const placeholderAnalysisReport: AnalysisReport = {
  company: "Example Company",
  summary: "No analysis has been generated yet.",
  narrative: "Run an analysis to populate this report with source-backed findings.",
  confidence: placeholderConfidence,
  metrics: [],
  analystConsensus: [],
  sources: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};
