export type DataSource =
  | "finnhub"
  | "fmp"
  | "sec-edgar"
  | "companies-house"
  | "gleif"
  | "exa-deep"
  | "claude-fallback";

export type ConfidenceLevel = "low" | "medium" | "high";

export type ConfidenceComponent = {
  readonly key: "identity" | "financials" | "street" | "freshness";
  readonly label: string;
  readonly score: number;
  readonly rationale: string;
};

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
  readonly components: readonly ConfidenceComponent[];
};

export type SearchResult = {
  readonly id: string;
  readonly name: string;
  readonly ticker?: string;
  readonly jurisdiction?: string;
  readonly description?: string;
};

export type EntityIdentifier = {
  readonly label:
  | "Canonical Name"
  | "Ticker"
  | "CIK"
  | "Exchange"
  | "Company Number"
  | "LEI"
  | "Jurisdiction"
  | "Status";
  readonly value: string;
  readonly source: DataSource;
};

export type EntityResolution = {
  readonly displayName: string;
  readonly canonicalName: string;
  readonly primarySource: DataSource | null;
  readonly matchedSources: readonly DataSource[];
  readonly identifiers: readonly EntityIdentifier[];
  readonly note: string;
};

export type FinancialMetric = {
  readonly label: string;
  readonly value: number | string | null;
  readonly format?: "currency" | "number" | "percent";
  readonly period?: string;
  readonly source?: DataSource;
};

export type AnalystConsensusEntry = {
  readonly firm: string;
  readonly rating: AnalystRating;
  readonly targetPrice: number | null;
  readonly period?: string;
  readonly detail?: string;
  readonly counts?: {
    readonly strongBuy: number;
    readonly buy: number;
    readonly hold: number;
    readonly sell: number;
    readonly strongSell: number;
    readonly bullish: number;
    readonly neutral: number;
    readonly bearish: number;
  };
  readonly source?: DataSource;
};

export type RecommendationTrend = {
  readonly period: string;
  readonly strongBuy: number;
  readonly buy: number;
  readonly hold: number;
  readonly sell: number;
  readonly strongSell: number;
  readonly bullish: number;
  readonly neutral: number;
  readonly bearish: number;
};

export type PriceTargetSummary = {
  readonly currentPrice: number | null;
  readonly targetMean: number | null;
  readonly targetMedian: number | null;
  readonly targetHigh: number | null;
  readonly targetLow: number | null;
  readonly upsidePercent: number | null;
  readonly lastUpdated?: string;
  readonly source: DataSource;
};

export type ValuationMetricComparison = {
  readonly label: "P/E" | "EV / EBITDA" | "EV / Sales" | "P/B";
  readonly current: number | null;
  readonly historicalLow: number | null;
  readonly historicalHigh: number | null;
  readonly forward: number | null;
  readonly source: DataSource;
};

export type ForwardEstimateSummary = {
  readonly period: string;
  readonly revenueEstimate: number | null;
  readonly epsEstimate: number | null;
  readonly source: DataSource;
};

export type PeerComparisonItem = {
  readonly symbol: string;
  readonly companyName: string;
  readonly currentPrice: number | null;
  readonly marketCap: number | null;
  readonly peRatio: number | null;
  readonly evToEbitda: number | null;
  readonly revenueGrowth: number | null;
  readonly source: DataSource;
};

export type ValuationView = {
  readonly metrics: readonly ValuationMetricComparison[];
  readonly forwardEstimates: readonly ForwardEstimateSummary[];
  readonly enterpriseValue: number | null;
  readonly marketCap: number | null;
  readonly priceTargetFallback: PriceTargetSummary | null;
  readonly note?: string;
  readonly source: DataSource | null;
};

export type StreetView = {
  readonly consensusRating: AnalystRating | null;
  readonly latest: RecommendationTrend | null;
  readonly previous: RecommendationTrend | null;
  readonly priceTarget: PriceTargetSummary | null;
  readonly priceTargetNote?: string;
  readonly source: DataSource | null;
};

export type ResearchNoteSection = {
  readonly title:
  | "Executive Summary"
  | "Company Overview"
  | "Financial Analysis"
  | "Valuation"
  | "Street Consensus"
  | "Risk Factors"
  | "Catalysts & Outlook"
  | "Analyst Brief";
  readonly body: string;
};

export type InvestmentRecommendation = "buy" | "watch" | "hold" | "avoid";

export type CoverageProfile =
  | "Strong public coverage"
  | "Mixed public coverage"
  | "Registry-led private coverage"
  | "Ambiguous entity"
  | "Limited evidence";

export type InvestmentRiskCategory =
  | "structural"
  | "execution"
  | "regulatory"
  | "market"
  | "data-quality";

export type InvestmentRisk = {
  readonly title: string;
  readonly detail: string;
  readonly category: InvestmentRiskCategory;
  readonly rank: number;
};

export type RecommendationLogicStrength = "strong" | "mixed" | "weak";

export type RecommendationFreshness = "fresh" | "reasonable" | "stale";

export type RecommendationGapLoad = "contained" | "meaningful" | "heavy";

export type RecommendationLogic = {
  readonly entityCertainty: RecommendationLogicStrength;
  readonly financialDepth: "strong" | "adequate" | "thin";
  readonly valuationSupport: RecommendationLogicStrength;
  readonly streetSignals: RecommendationLogicStrength;
  readonly freshness: RecommendationFreshness;
  readonly dataGaps: RecommendationGapLoad;
  readonly tensions: "clear" | "present";
  readonly supportingReasons: readonly string[];
  readonly confidenceLimitingReasons: readonly string[];
};

export type InvestmentMemo = {
  readonly recommendation: InvestmentRecommendation;
  readonly conviction: ConfidenceLevel;
  readonly coverageProfile: CoverageProfile;
  readonly verdict: string;
  readonly whyNow: readonly string[];
  readonly keyDisqualifier: string;
  readonly thesis: string;
  readonly antiThesis: string;
  readonly businessSnapshot: string;
  readonly valuationCase: string;
  readonly upsideCase: string;
  readonly downsideCase: string;
  readonly keyRisks: readonly InvestmentRisk[];
  readonly catalystsToMonitor: readonly string[];
  readonly whatImprovesConfidence: readonly string[];
  readonly whatReducesConfidence: readonly string[];
  readonly verifiedFacts: readonly string[];
  readonly reasonedInference: readonly string[];
  readonly unknowns: readonly string[];
  readonly logic: RecommendationLogic;
  readonly stressTest?: StressTestResult | null;
};

export type ReportDelta = {
  readonly title: string;
  readonly detail: string;
  readonly tone: "positive" | "negative" | "neutral";
};

export type EvidenceSignal = {
  readonly title: string;
  readonly detail: string;
  readonly tone: "positive" | "negative" | "neutral";
  readonly sources: readonly DataSource[];
};

export type CoverageGap = {
  readonly title: string;
  readonly detail: string;
  readonly severity: "low" | "medium" | "high";
};

export type DisagreementNote = {
  readonly title: string;
  readonly detail: string;
  readonly sources: readonly DataSource[];
};

export type SectionAuditItem = {
  readonly section:
  | "Entity Resolution"
  | "Company Overview"
  | "Financial Analysis"
  | "Valuation"
  | "Street Consensus"
  | "Risk Factors"
  | "Catalysts & Outlook";
  readonly status: "supported" | "partial" | "limited";
  readonly note: string;
  readonly sources: readonly DataSource[];
};

export type NewsHighlight = {
  readonly headline: string;
  readonly source: string;
  readonly publishedAt: string;
  readonly summary: string;
  readonly url: string;
};

export type EarningsHighlight = {
  readonly period: string;
  readonly actual: number | null;
  readonly estimate: number | null;
  readonly surprise: number | null;
  readonly surprisePercent: number | null;
  readonly source: DataSource;
};

export type InsiderActivityItem = {
  readonly name: string;
  readonly shareChange: number | null;
  readonly share: number | null;
  readonly transactionCode: string;
  readonly transactionDate: string;
  readonly filingDate?: string;
  readonly transactionPrice: number | null;
  readonly source: DataSource;
};

export type MonitorItem = {
  readonly id: string;
  readonly label: string;
  readonly status: "idle" | "watching";
  readonly updatedAt: string;
  readonly snapshot?: {
    readonly confidenceScore: number;
    readonly confidenceLevel: ConfidenceLevel;
    readonly supported: number;
    readonly partial: number;
    readonly limited: number;
    readonly sourceCount: number;
    readonly metricCount: number;
    readonly updatedAt: string;
  } | null;
};

export type DataSourceResult<T> = {
  readonly source: DataSource;
  readonly data: T;
  readonly fetchedAt: string;
  readonly error?: string;
};

export type AnalysisReport = {
  readonly company: string;
  readonly entityResolution: EntityResolution;
  readonly summary: string;
  readonly investmentMemo: InvestmentMemo;
  readonly narrative: string;
  readonly sections: readonly ResearchNoteSection[];
  readonly confidence: ConfidenceScore;
  readonly metrics: readonly FinancialMetric[];
  readonly analystConsensus: readonly AnalystConsensusEntry[];
  readonly streetView: StreetView | null;
  readonly valuationView: ValuationView | null;
  readonly peerComparison: readonly PeerComparisonItem[];
  readonly earningsHighlights: readonly EarningsHighlight[];
  readonly insiderActivity: readonly InsiderActivityItem[];
  readonly deltas: readonly ReportDelta[];
  readonly evidenceSignals: readonly EvidenceSignal[];
  readonly coverageGaps: readonly CoverageGap[];
  readonly disagreementNotes: readonly DisagreementNote[];
  readonly sectionAudit: readonly SectionAuditItem[];
  readonly validationReport: ValidationReport;
  readonly newsHighlights: readonly NewsHighlight[];
  readonly sources: readonly DataSource[];
  readonly isAmbiguous?: boolean;
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

export type FinnhubBasicFinancialMetricSet = {
  readonly "52WeekHigh"?: number | null;
  readonly "52WeekLow"?: number | null;
  readonly marketCapitalization?: number | null;
  readonly peBasicExclExtraTTM?: number | null;
  readonly peTTM?: number | null;
  readonly pbAnnual?: number | null;
  readonly psTTM?: number | null;
  readonly ev?: number | null;
  readonly evEbitdaTTM?: number | null;
  readonly netMarginTTM?: number | null;
  readonly netMarginAnnual?: number | null;
  readonly operatingMarginTTM?: number | null;
  readonly operatingMarginAnnual?: number | null;
  readonly roeTTM?: number | null;
  readonly roaTTM?: number | null;
  readonly revenueGrowthTTMYoy?: number | null;
  readonly epsGrowthTTMYoy?: number | null;
};

export type FinnhubBasicFinancials = {
  readonly metric: FinnhubBasicFinancialMetricSet;
};

export type FinnhubPriceTarget = {
  readonly targetHigh: number | null;
  readonly targetLow: number | null;
  readonly targetMean: number | null;
  readonly targetMedian: number | null;
  readonly lastUpdated?: string;
};

export type FinnhubEarningsEvent = {
  readonly actual: number | null;
  readonly estimate: number | null;
  readonly period: string;
  readonly quarter?: number | null;
  readonly year?: number | null;
  readonly surprise: number | null;
  readonly surprisePercent: number | null;
};

export type FinnhubInsiderTransaction = {
  readonly name: string;
  readonly share: number | null;
  readonly change: number | null;
  readonly filingDate?: string;
  readonly transactionDate: string;
  readonly transactionCode: string;
  readonly transactionPrice: number | null;
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
  readonly symbolType?: string;
  readonly companyName: string | null;
  readonly quote: FinnhubQuote | null;
  readonly recommendations: readonly FinnhubRecommendation[];
  readonly news: readonly FinnhubNewsItem[];
  readonly basicFinancials: FinnhubBasicFinancials | null;
  readonly priceTarget: FinnhubPriceTarget | null;
  readonly priceTargetNote?: string;
  readonly earnings: readonly FinnhubEarningsEvent[];
  readonly insiderTransactions: readonly FinnhubInsiderTransaction[];
  readonly isAmbiguous?: boolean;
  readonly alternatives?: readonly FinnhubSymbolMatch[];
};

export type FmpHistoricalMultiple = {
  readonly date: string;
  readonly peRatio: number | null;
  readonly pbRatio: number | null;
  readonly evToEbitda: number | null;
  readonly evToSales: number | null;
};

export type FmpEnterpriseValue = {
  readonly date: string;
  readonly enterpriseValue: number | null;
  readonly marketCapitalization: number | null;
  readonly stockPrice: number | null;
};

export type FmpAnalystEstimate = {
  readonly date: string;
  readonly estimatedRevenueAvg: number | null;
  readonly estimatedEpsAvg: number | null;
};

export type FmpPriceTargetConsensus = {
  readonly targetHigh: number | null;
  readonly targetLow: number | null;
  readonly targetMedian: number | null;
  readonly targetConsensus: number | null;
};

export type FmpPeerProfile = {
  readonly symbol: string;
  readonly companyName: string;
  readonly currentPrice: number | null;
  readonly marketCap: number | null;
  readonly peRatio: number | null;
  readonly revenueGrowth: number | null;
  readonly evToEbitda: number | null;
};

export type FmpData = {
  readonly symbol: string;
  readonly historicalMultiples: readonly FmpHistoricalMultiple[];
  readonly enterpriseValues: readonly FmpEnterpriseValue[];
  readonly analystEstimates: readonly FmpAnalystEstimate[];
  readonly priceTargetConsensus: FmpPriceTargetConsensus | null;
  readonly peers: readonly FmpPeerProfile[];
  readonly note?: string;
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

export type CompaniesHouseAccountsLast = {
  readonly made_up_to?: string;
  readonly period_start_on?: string;
  readonly period_end_on?: string;
  readonly type?: string;
};

export type CompaniesHouseNextAccounts = {
  readonly due_on?: string;
  readonly overdue?: boolean;
  readonly period_start_on?: string;
  readonly period_end_on?: string;
};

export type CompaniesHouseAccounts = {
  readonly accounting_reference_date?: {
    readonly day?: string;
    readonly month?: string;
  };
  readonly last_accounts?: CompaniesHouseAccountsLast;
  readonly next_accounts?: CompaniesHouseNextAccounts;
  readonly next_due?: string;
};

export type CompaniesHouseProfile = {
  readonly company_name: string;
  readonly company_number: string;
  readonly company_status: CompaniesHouseCompany["company_status"];
  readonly company_type: string;
  readonly date_of_creation?: string;
  readonly jurisdiction?: string;
  readonly sic_codes: readonly string[];
  readonly registered_office_address: CompaniesHouseAddress;
  readonly accounts: CompaniesHouseAccounts | null;
};

export type CompaniesHouseFiling = {
  readonly date: string;
  readonly category: string;
  readonly type: string;
  readonly description: string;
  readonly pages?: number;
  readonly document_metadata?: string;
};

export type CompaniesHouseData = {
  readonly company: CompaniesHouseCompany | null;
  readonly allMatches: readonly CompaniesHouseCompany[];
  readonly profile: CompaniesHouseProfile | null;
  readonly accountsFilings: readonly CompaniesHouseFiling[];
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

export type ValidationSeverity = "high" | "medium" | "low";

export type ValidationCoverageLabel =
  | "Strong Public"
  | "Registry-led"
  | "Ambiguous Entity"
  | "Limited Private"
  | "Thin";

export type ValidationTension = {
  readonly check: string;
  readonly detail: string;
  readonly sources: readonly DataSource[];
  readonly severity: ValidationSeverity;
};

export type ValidationCrossCheck = {
  readonly check: string;
  readonly passed: boolean;
  readonly detail: string;
  readonly sources: readonly DataSource[];
};

export type ValidationGap = {
  readonly gap: string;
  readonly detail: string;
  readonly severity: ValidationSeverity;
};

export type ValidationReport = {
  readonly coverageLabel: ValidationCoverageLabel;
  readonly dataQualityScore: number;
  readonly tensions: readonly ValidationTension[];
  readonly gaps: readonly ValidationGap[];
  readonly crossChecks: readonly ValidationCrossCheck[];
};

export type ChallengerItem = {
  readonly claim: string;
  readonly severity: ValidationSeverity;
  readonly citedSource: string;
};

export type ChallengerReport = {
  readonly unstatedAssumptions: readonly ChallengerItem[];
  readonly evidenceGaps: readonly ChallengerItem[];
  readonly counterScenarios: readonly ChallengerItem[];
};

export type StressTestResult = {
  readonly unstatedAssumptions: readonly ChallengerItem[];
  readonly evidenceGaps: readonly ChallengerItem[];
  readonly counterScenarios: readonly ChallengerItem[];
  readonly convictionDowngraded: boolean;
  readonly originalConviction: ConfidenceLevel;
};

export type ExaDeepData = {
  readonly companyName: string;
  readonly overview: string;
  readonly estimatedRevenue: string | null;
  readonly fundingTotal: string | null;
  readonly lastValuation: string | null;
  readonly foundedYear: string | null;
  readonly headquarters: string | null;
  readonly keyInvestors: readonly string[];
  readonly competitors: readonly string[];
  readonly recentNews: string;
};

export type ThemeCompany = {
  readonly companyName: string;
  readonly ticker: string | null;
  readonly exposureScore: number;
  readonly rationale: string;
};

export type ThemeResult = {
  readonly themeName: string;
  readonly themeDescription: string;
  readonly companies: readonly ThemeCompany[];
  readonly keyDrivers: readonly string[];
  readonly headwinds: readonly string[];
  readonly relatedThemes: readonly string[];
  readonly queryTimeMs: number;
};

export type ThemeApiResponse = {
  readonly ok: boolean;
  readonly result?: ThemeResult;
  readonly error?: string;
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
  readonly fmp: DataSourceResult<FmpData> | null;
  readonly secEdgar: DataSourceResult<SecEdgarData> | null;
  readonly companiesHouse: DataSourceResult<CompaniesHouseData> | null;
  readonly gleif: DataSourceResult<GleifData> | null;
  readonly exaDeep: DataSourceResult<ExaDeepData> | null;
  readonly claudeFallback: DataSourceResult<ClaudeFallbackResult> | null;
  readonly activeSources: readonly DataSource[];
};

export type NarrativeInput = {
  readonly company: string;
  readonly entityResolution: EntityResolution;
  readonly investmentMemo: InvestmentMemo;
  readonly waterfallResult: WaterfallResult;
  readonly confidence: ConfidenceScore;
  readonly evidenceSignals: readonly EvidenceSignal[];
  readonly coverageGaps: readonly CoverageGap[];
  readonly disagreementNotes: readonly DisagreementNote[];
  readonly sectionAudit: readonly SectionAuditItem[];
};

export type NarrativeResult = {
  readonly narrative: string;
  readonly sections: readonly ResearchNoteSection[];
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
  readonly summary?: {
    readonly watchedCount: number;
    readonly withSnapshotsCount: number;
    readonly averageConfidence: number | null;
    readonly averageSources: number | null;
    readonly averageMetrics: number | null;
    readonly supportedSections: number;
    readonly partialSections: number;
    readonly limitedSections: number;
    readonly strongestCompany: string | null;
    readonly weakestCompany: string | null;
  };
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
  components: [],
};

export const placeholderValidationReport: ValidationReport = {
  coverageLabel: "Thin",
  dataQualityScore: 0,
  tensions: [],
  gaps: [],
  crossChecks: [],
};

export const placeholderAnalysisReport: AnalysisReport = {
  company: "Example Company",
  entityResolution: {
    displayName: "Example Company",
    canonicalName: "Example Company",
    primarySource: null,
    matchedSources: [],
    identifiers: [],
    note: "No entity resolution has been generated yet.",
  },
  summary: "No analysis has been generated yet.",
  investmentMemo: {
    recommendation: "watch",
    conviction: "low",
    coverageProfile: "Limited evidence",
    verdict:
      "Watch: the current report is still empty, so there is no defendable investment conclusion yet.",
    whyNow: ["No evidence-backed investment memo is available yet."],
    keyDisqualifier:
      "There is not enough entity, valuation, or operating evidence on the page yet.",
    thesis:
      "No thesis can be defended until the report gathers grounded evidence.",
    antiThesis:
      "The anti-thesis is simply that the evidence stack is still blank.",
    businessSnapshot:
      "Run an analysis to populate the business snapshot with grounded company and market context.",
    valuationCase:
      "Valuation support cannot be assessed until the report gathers structured market or filing evidence.",
    upsideCase:
      "Upside cannot be defended until the report has gathered valuation and company-specific evidence.",
    downsideCase:
      "Downside cannot be quantified until the report has gathered enough evidence to support a view.",
    keyRisks: [
      {
        title: "No active evidence set",
        detail: "The report is empty, so any recommendation would be premature.",
        category: "data-quality",
        rank: 1,
      },
    ],
    catalystsToMonitor: [
      "Run an analysis to generate the first evidence-backed investment read.",
    ],
    whatImprovesConfidence: [
      "A fresh run with grounded company evidence will populate the memo.",
    ],
    whatReducesConfidence: [
      "Continuing without grounded evidence would make any recommendation less trustworthy.",
    ],
    verifiedFacts: ["No verified facts are available until the first analysis run completes."],
    reasonedInference: [
      "The current state suggests waiting for a grounded evidence set before forming a view.",
    ],
    unknowns: [
      "All core inputs are still unknown until the first analysis run completes.",
    ],
    logic: {
      entityCertainty: "weak",
      financialDepth: "thin",
      valuationSupport: "weak",
      streetSignals: "weak",
      freshness: "stale",
      dataGaps: "heavy",
      tensions: "clear",
      supportingReasons: [],
      confidenceLimitingReasons: [
        "The report has not gathered any grounded evidence yet.",
      ],
    },
  },
  narrative: "Run an analysis to populate this report with source-backed findings.",
  sections: [],
  confidence: placeholderConfidence,
  metrics: [],
  analystConsensus: [],
  streetView: null,
  valuationView: null,
  peerComparison: [],
  earningsHighlights: [],
  insiderActivity: [],
  deltas: [],
  evidenceSignals: [],
  coverageGaps: [],
  disagreementNotes: [],
  sectionAudit: [],
  validationReport: placeholderValidationReport,
  newsHighlights: [],
  sources: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};
