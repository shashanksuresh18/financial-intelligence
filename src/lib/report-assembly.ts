import type {
  AnalystConsensusEntry,
  AnalysisReport,
  DataSource,
  EarningsHighlight,
  EvidenceAnchor,
  EvidenceClass,
  FactLayer,
  FinancialMetric,
  ForwardEstimateSummary,
  FmpHistoricalMultiple,
  FinnhubRecommendation,
  InsiderActivityItem,
  NewsHighlight,
  PeerComparisonItem,
  RecommendationTrend,
  SourcedFact,
  StreetView,
  ValuationMetricComparison,
  ValuationView,
  WaterfallResult,
} from "@/lib/types";
import {
  CAPEX_CONCEPTS,
  extractLatestFact,
  GROSS_PROFIT_CONCEPTS,
  OPERATING_CASH_FLOW_CONCEPTS,
  NET_INCOME_CONCEPTS,
  REVENUE_CONCEPTS,
} from "@/lib/datasources/sec-edgar";
import {
  enrichNewsHighlight,
  summarizeNewsSentiment,
} from "@/lib/news-sentiment";
import { buildRelevantPeerItems } from "@/lib/peer-engine";

const DIRECTIONAL_INSIDER_CODES = new Set(["P", "S"]);
const MIN_MEANINGFUL_INSIDER_NOTIONAL = 500_000;
const MIN_MEANINGFUL_INSIDER_SHARE_CHANGE = 10_000;
const EVIDENCE_CLASSES: readonly EvidenceClass[] = [
  "primary-filing",
  "registry",
  "market-data-vendor",
  "analyst-consensus",
  "news-reporting",
  "synthesized-web",
  "model-inference",
];

type EvidenceClassBreakdown = Record<EvidenceClass, number>;
type EvidenceClassFact = {
  readonly evidenceClass?: EvidenceClass;
  readonly source?: DataSource | string;
  readonly sources?: readonly DataSource[];
};

type MeaningfulInsiderFlowSummary = {
  readonly direction: "buy" | "sell";
  readonly totalShareChange: number;
  readonly totalNotional: number;
  readonly transactionCount: number;
};

function slugifyFactId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function nextFactId(baseId: string, used: Set<string>): string {
  let candidate = baseId;
  let index = 2;

  while (used.has(candidate)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }

  used.add(candidate);
  return candidate;
}

function formatFactMetricValue(metric: FinancialMetric): string | number | null {
  if (metric.value === null) {
    return null;
  }

  if (typeof metric.value === "string") {
    return metric.value;
  }

  if (metric.format === "percent") {
    return `${metric.value.toFixed(1)}%`;
  }

  if (metric.format === "currency") {
    return new Intl.NumberFormat("en-US", {
      currency: "USD",
      maximumFractionDigits: 1,
      notation: "compact",
      style: "currency",
    }).format(metric.value);
  }

  return Number.isInteger(metric.value) ? metric.value : Number(metric.value.toFixed(2));
}

function countFactLayerItems(items: readonly SourcedFact[]): Omit<
  FactLayer,
  "items"
> {
  return {
    primaryFilingCount: items.filter(
      (item) => item.evidenceClass === "primary-filing",
    ).length,
    vendorDataCount: items.filter(
      (item) =>
        item.evidenceClass === "market-data-vendor" ||
        item.evidenceClass === "analyst-consensus" ||
        item.evidenceClass === "news-reporting",
    ).length,
    synthesizedCount: items.filter(
      (item) => item.evidenceClass === "synthesized-web",
    ).length,
  };
}

export function evidenceClassForSource(
  source: DataSource,
  usage:
    | "analyst-consensus"
    | "market-data"
    | "news"
    | "profile"
    | "filing" = "market-data",
): EvidenceClass {
  if (source === "sec-edgar") {
    return "primary-filing";
  }

  if (source === "companies-house" || source === "gleif") {
    return usage === "filing" ? "primary-filing" : "registry";
  }

  if (source === "finnhub" || source === "fmp") {
    if (usage === "analyst-consensus") {
      return "analyst-consensus";
    }

    if (usage === "news") {
      return "news-reporting";
    }

    return "market-data-vendor";
  }

  return "synthesized-web";
}

function metricEvidenceClass(metric: FinancialMetric): EvidenceClass | undefined {
  if (metric.evidenceClass !== undefined) {
    return metric.evidenceClass;
  }

  if (metric.source === undefined) {
    return undefined;
  }

  if (metric.source === "finnhub" && metric.label.includes("Street Target")) {
    return evidenceClassForSource(metric.source, "analyst-consensus");
  }

  return evidenceClassForSource(metric.source);
}

export function evidenceClassForSources(
  sources: readonly DataSource[],
): EvidenceClass | undefined {
  const ranked = sources
    .map((source) => evidenceClassForSource(source))
    .sort((left, right) => evidenceClassRank(left) - evidenceClassRank(right));

  return ranked[0];
}

function isDataSource(source: string): source is DataSource {
  return [
    "finnhub",
    "fmp",
    "sec-edgar",
    "companies-house",
    "gleif",
    "exa-deep",
    "claude-fallback",
  ].includes(source);
}

function evidenceClassRank(evidenceClass: EvidenceClass): number {
  switch (evidenceClass) {
    case "primary-filing":
      return 0;
    case "registry":
      return 1;
    case "market-data-vendor":
      return 2;
    case "analyst-consensus":
      return 3;
    case "news-reporting":
      return 4;
    case "synthesized-web":
      return 5;
    case "model-inference":
      return 6;
  }
}

function resolveFactEvidenceClass(fact: EvidenceClassFact): EvidenceClass | undefined {
  if (fact.evidenceClass !== undefined) {
    return fact.evidenceClass;
  }

  if (fact.source !== undefined && isDataSource(fact.source)) {
    return evidenceClassForSource(fact.source);
  }

  if (fact.sources !== undefined) {
    return evidenceClassForSources(fact.sources);
  }

  return undefined;
}

function tagMetric(metric: FinancialMetric): FinancialMetric {
  return {
    ...metric,
    evidenceClass: metricEvidenceClass(metric),
  };
}

export function filterByEvidenceClass<T extends EvidenceClassFact>(
  facts: readonly T[],
  classes: readonly EvidenceClass[],
): readonly T[] {
  const allowed = new Set(classes);

  return facts.filter((fact) => {
    const evidenceClass = resolveFactEvidenceClass(fact);

    return evidenceClass !== undefined && allowed.has(evidenceClass);
  });
}

export function getEvidenceClassBreakdown(report: AnalysisReport): EvidenceClassBreakdown {
  const counts = Object.fromEntries(
    EVIDENCE_CLASSES.map((evidenceClass) => [evidenceClass, 0]),
  ) as Record<EvidenceClass, number>;
  const facts: EvidenceClassFact[] = [
    ...report.metrics,
    ...report.evidenceSignals,
    ...report.peerComparison,
    ...report.analystConsensus,
    ...report.earningsHighlights,
    ...report.insiderActivity,
    ...report.newsHighlights,
    ...report.recentDevelopments,
    ...(report.valuationView?.metrics ?? []),
    ...(report.valuationView?.forwardEstimates ?? []),
    ...(report.streetView?.latest !== null && report.streetView?.latest !== undefined
      ? [report.streetView.latest]
      : []),
    ...(report.streetView?.previous !== null && report.streetView?.previous !== undefined
      ? [report.streetView.previous]
      : []),
    ...(report.streetView?.priceTarget !== null && report.streetView?.priceTarget !== undefined
      ? [report.streetView.priceTarget]
      : []),
    ...(report.investmentMemo.factLayer?.items ?? []),
    ...(report.investmentMemo.evidenceAnchors ?? []),
  ];

  for (const fact of facts) {
    const evidenceClass = resolveFactEvidenceClass(fact);

    if (evidenceClass !== undefined) {
      counts[evidenceClass] += 1;
    }
  }

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  if (total === 0) {
    return counts;
  }

  return Object.fromEntries(
    EVIDENCE_CLASSES.map((evidenceClass) => [
      evidenceClass,
      (counts[evidenceClass] / total) * 100,
    ]),
  ) as EvidenceClassBreakdown;
}

export function hasMinimumPrimaryEvidence(
  report: AnalysisReport,
  threshold: number,
): boolean {
  const breakdown = getEvidenceClassBreakdown(report);
  const primaryPercent = breakdown["primary-filing"];

  return threshold <= 1
    ? primaryPercent / 100 >= threshold
    : primaryPercent >= threshold;
}

export function buildFactLayer(
  result: WaterfallResult,
  metrics: readonly FinancialMetric[],
  evidenceAnchors: readonly EvidenceAnchor[],
): FactLayer {
  const usedIds = new Set<string>();
  const items: SourcedFact[] = [];

  const pushFact = (fact: SourcedFact): void => {
    const evidenceId =
      fact.evidenceId === null
        ? nextFactId(`${fact.source}:${slugifyFactId(fact.claim)}`, usedIds)
        : nextFactId(fact.evidenceId, usedIds);

    if (fact.evidenceClass === "model-inference") {
      return;
    }

    items.push({
      ...fact,
      evidenceId,
    });
  };

  for (const anchor of evidenceAnchors) {
    const evidenceClass =
      anchor.evidenceClass ?? evidenceClassForSource(anchor.source);

    pushFact({
      claim: `${anchor.label}${anchor.period === null ? "" : ` (${anchor.period})`}`,
      value: anchor.value,
      evidenceClass,
      evidenceId: anchor.id,
      period: anchor.period,
      source: anchor.source,
    });
  }

  for (const metric of metrics) {
    if (metric.source === undefined || metric.value === null) {
      continue;
    }

    const evidenceClass =
      metric.evidenceClass ?? evidenceClassForSource(metric.source);
    const formattedValue = formatFactMetricValue(metric);

    pushFact({
      claim: `${metric.label}${metric.period === undefined ? "" : ` (${metric.period})`}`,
      value: formattedValue,
      evidenceClass,
      evidenceId: null,
      period: metric.period ?? null,
      source: metric.source,
    });
  }

  if (result.secEdgar !== null && result.secEdgar.data.companyInfo !== null) {
    pushFact({
      claim: "SEC company identity",
      value: result.secEdgar.data.companyInfo.name,
      evidenceClass: "primary-filing",
      evidenceId: null,
      period: null,
      source: "sec-edgar",
    });
  }

  if (
    result.companiesHouse !== null &&
    result.companiesHouse.data.profile !== null
  ) {
    pushFact({
      claim: "Companies House company status",
      value: result.companiesHouse.data.profile.company_status ?? null,
      evidenceClass: "registry",
      evidenceId: null,
      period: null,
      source: "companies-house",
    });
  }

  const deduped: SourcedFact[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = `${item.source}:${item.claim}:${String(item.value)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return {
    items: deduped,
    ...countFactLayerItems(deduped),
  };
}

function normalizeInsiderTransactionCode(code: string): string {
  return code.trim().toUpperCase().slice(0, 1);
}

function isDirectionalInsiderTransaction(item: InsiderActivityItem): boolean {
  const code = normalizeInsiderTransactionCode(item.transactionCode);

  return (
    DIRECTIONAL_INSIDER_CODES.has(code) &&
    item.shareChange !== null &&
    item.transactionPrice !== null &&
    item.transactionPrice > 0
  );
}

export function summarizeMeaningfulInsiderFlow(
  items: readonly InsiderActivityItem[],
): MeaningfulInsiderFlowSummary | null {
  const directionalItems = items.filter(isDirectionalInsiderTransaction);

  if (directionalItems.length === 0) {
    return null;
  }

  const totalShareChange = directionalItems.reduce(
    (total, item) => total + (item.shareChange ?? 0),
    0,
  );
  const totalNotional = directionalItems.reduce(
    (total, item) =>
      total + ((item.shareChange ?? 0) * (item.transactionPrice ?? 0)),
    0,
  );

  if (
    Math.abs(totalNotional) < MIN_MEANINGFUL_INSIDER_NOTIONAL &&
    Math.abs(totalShareChange) < MIN_MEANINGFUL_INSIDER_SHARE_CHANGE
  ) {
    return null;
  }

  return {
    direction: totalShareChange >= 0 ? "buy" : "sell",
    totalShareChange,
    totalNotional,
    transactionCount: directionalItems.length,
  };
}

export function extractXbrlMetrics(
  result: WaterfallResult,
): readonly FinancialMetric[] {
  if (result.secEdgar === null || result.secEdgar.data.xbrlFacts === null) {
    return [];
  }
  const revenue = extractLatestFact(
    result.secEdgar.data.xbrlFacts,
    REVENUE_CONCEPTS,
  );
  const netIncome = extractLatestFact(
    result.secEdgar.data.xbrlFacts,
    NET_INCOME_CONCEPTS,
  );
  const grossProfit = extractLatestFact(
    result.secEdgar.data.xbrlFacts,
    GROSS_PROFIT_CONCEPTS,
  );
  const operatingCashFlow = extractLatestFact(
    result.secEdgar.data.xbrlFacts,
    OPERATING_CASH_FLOW_CONCEPTS,
  );
  const capexRaw = extractLatestFact(
    result.secEdgar.data.xbrlFacts,
    CAPEX_CONCEPTS,
  );
  const capex = capexRaw === null ? null : Math.abs(capexRaw);
  const grossMargin =
    revenue !== null && revenue !== 0 && grossProfit !== null
      ? (grossProfit / revenue) * 100
      : null;
  const capexToRevenue =
    revenue !== null && revenue !== 0 && capex !== null
      ? (capex / revenue) * 100
      : null;
  const freeCashFlow =
    operatingCashFlow !== null
      ? operatingCashFlow - (capex ?? 0)
      : null;
  const freeCashFlowMargin =
    revenue !== null && revenue !== 0 && freeCashFlow !== null
      ? (freeCashFlow / revenue) * 100
      : null;
  return [
    ...(revenue !== null
      ? [
          {
            label: "Revenue",
            value: revenue,
            format: "currency" as const,
            period: "Latest FY",
            source: "sec-edgar" as const,
          },
        ]
      : []),
    ...(grossProfit !== null
      ? [
          {
            label: "Gross Profit",
            value: grossProfit,
            format: "currency" as const,
            period: "Latest FY",
            source: "sec-edgar" as const,
          },
        ]
      : []),
    ...(grossMargin !== null
      ? [
          {
            label: "Gross Margin",
            value: grossMargin,
            format: "percent" as const,
            period: "Latest FY",
            source: "sec-edgar" as const,
          },
        ]
      : []),
    ...(netIncome !== null
      ? [
          {
            label: "Net Income",
            value: netIncome,
            format: "currency" as const,
            period: "Latest FY",
            source: "sec-edgar" as const,
          },
        ]
      : []),
    ...(operatingCashFlow !== null
      ? [
          {
            label: "Operating Cash Flow",
            value: operatingCashFlow,
            format: "currency" as const,
            period: "Latest FY",
            source: "sec-edgar" as const,
          },
        ]
      : []),
    ...(capex !== null
      ? [
          {
            label: "Capital Expenditures",
            value: capex,
            format: "currency" as const,
            period: "Latest FY",
            source: "sec-edgar" as const,
          },
        ]
      : []),
    ...(capexToRevenue !== null
      ? [
          {
            label: "CapEx / Revenue",
            value: capexToRevenue,
            format: "percent" as const,
            period: "Latest FY",
            source: "sec-edgar" as const,
          },
        ]
      : []),
    ...(freeCashFlow !== null
      ? [
          {
            label: "Free Cash Flow",
            value: freeCashFlow,
            format: "currency" as const,
            period: "Latest FY",
            source: "sec-edgar" as const,
          },
        ]
      : []),
    ...(freeCashFlowMargin !== null
      ? [
          {
            label: "Free Cash Flow Margin",
            value: freeCashFlowMargin,
            format: "percent" as const,
            period: "Latest FY",
            source: "sec-edgar" as const,
          },
        ]
      : []),
  ];
}

export function extractFinnhubMetrics(
  result: WaterfallResult,
): readonly FinancialMetric[] {
  if (result.finnhub === null) {
    return [];
  }
  const { basicFinancials, priceTarget, quote } = result.finnhub.data;
  const metrics: FinancialMetric[] = [];
  if (quote !== null && quote.t !== 0) {
    metrics.push(
      {
        label: "Current Price",
        value: quote.c,
        format: "currency",
        source: "finnhub",
      },
      {
        label: "Day High",
        value: quote.h,
        format: "currency",
        source: "finnhub",
      },
      {
        label: "Day Low",
        value: quote.l,
        format: "currency",
        source: "finnhub",
      },
    );
  }
  const metric = basicFinancials?.metric;
  if (metric !== undefined) {
    metrics.push(
      ...(metric.marketCapitalization !== null &&
      metric.marketCapitalization !== undefined
        ? [
            {
              label: "Market Cap (USDm)",
              value: metric.marketCapitalization,
              format: "number" as const,
              period: "Latest",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.ev !== null && metric.ev !== undefined
        ? [
            {
              label: "Enterprise Value (USDm)",
              value: metric.ev,
              format: "number" as const,
              period: "Latest",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.peBasicExclExtraTTM !== null &&
      metric.peBasicExclExtraTTM !== undefined
        ? [
            {
              label: "P/E (TTM)",
              value: metric.peBasicExclExtraTTM,
              format: "number" as const,
              period: "TTM",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.pbAnnual !== null && metric.pbAnnual !== undefined
        ? [
            {
              label: "P/B",
              value: metric.pbAnnual,
              format: "number" as const,
              period: "Annual",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.psTTM !== null && metric.psTTM !== undefined
        ? [
            {
              label: "P/S (TTM)",
              value: metric.psTTM,
              format: "number" as const,
              period: "TTM",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.evEbitdaTTM !== null && metric.evEbitdaTTM !== undefined
        ? [
            {
              label: "EV / EBITDA",
              value: metric.evEbitdaTTM,
              format: "number" as const,
              period: "TTM",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.revenueGrowthTTMYoy !== null &&
      metric.revenueGrowthTTMYoy !== undefined
        ? [
            {
              label: "Revenue Growth",
              value: metric.revenueGrowthTTMYoy,
              format: "percent" as const,
              period: "TTM YoY",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.epsGrowthTTMYoy !== null && metric.epsGrowthTTMYoy !== undefined
        ? [
            {
              label: "EPS Growth",
              value: metric.epsGrowthTTMYoy,
              format: "percent" as const,
              period: "TTM YoY",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.operatingMarginTTM !== null &&
      metric.operatingMarginTTM !== undefined
        ? [
            {
              label: "Operating Margin",
              value: metric.operatingMarginTTM,
              format: "percent" as const,
              period: "TTM",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.netMarginTTM !== null && metric.netMarginTTM !== undefined
        ? [
            {
              label: "Net Margin",
              value: metric.netMarginTTM,
              format: "percent" as const,
              period: "TTM",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric.roeTTM !== null && metric.roeTTM !== undefined
        ? [
            {
              label: "ROE",
              value: metric.roeTTM,
              format: "percent" as const,
              period: "TTM",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric["52WeekHigh"] !== null && metric["52WeekHigh"] !== undefined
        ? [
            {
              label: "52-Week High",
              value: metric["52WeekHigh"],
              format: "currency" as const,
              period: "1Y",
              source: "finnhub" as const,
            },
          ]
        : []),
      ...(metric["52WeekLow"] !== null && metric["52WeekLow"] !== undefined
        ? [
            {
              label: "52-Week Low",
              value: metric["52WeekLow"],
              format: "currency" as const,
              period: "1Y",
              source: "finnhub" as const,
            },
          ]
        : []),
    );
  }
  if (priceTarget?.targetMean !== null && priceTarget?.targetMean !== undefined) {
    metrics.push({
      label: "Street Target (Mean)",
      value: priceTarget.targetMean,
      format: "currency" as const,
      period: "Latest",
      source: "finnhub",
    });
  }
  return metrics;
}

export function extractCompaniesHouseMetrics(
  result: WaterfallResult,
): readonly FinancialMetric[] {
  if (result.companiesHouse === null) {
    return [];
  }
  const profile = result.companiesHouse.data.profile;
  const latestAccountsFiling =
    result.companiesHouse.data.accountsFilings[0] ?? null;
  const metrics: FinancialMetric[] = [];
  if (profile?.date_of_creation !== undefined) {
    metrics.push({
      label: "Incorporation Date",
      value: profile.date_of_creation,
      period: "Registry",
      source: "companies-house",
    });
  }
  if (profile?.company_type.trim().length) {
    metrics.push({
      label: "Company Type",
      value: profile.company_type,
      period: "Registry",
      source: "companies-house",
    });
  }
  if (profile?.accounts?.last_accounts?.made_up_to !== undefined) {
    metrics.push({
      label: "Last Accounts Made Up To",
      value: profile.accounts.last_accounts.made_up_to,
      period: "Accounts",
      source: "companies-house",
    });
  }
  if (profile?.accounts?.last_accounts?.type !== undefined) {
    metrics.push({
      label: "Last Accounts Type",
      value: profile.accounts.last_accounts.type,
      period: "Accounts",
      source: "companies-house",
    });
  }
  const nextAccountsDue =
    profile?.accounts?.next_accounts?.due_on ?? profile?.accounts?.next_due;
  if (nextAccountsDue !== undefined) {
    metrics.push({
      label: "Next Accounts Due",
      value: nextAccountsDue,
      period: "Accounts",
      source: "companies-house",
    });
  }
  if (profile?.accounts?.next_accounts?.overdue !== undefined) {
    metrics.push({
      label: "Accounts Overdue",
      value: profile.accounts.next_accounts.overdue ? "Yes" : "No",
      period: "Accounts",
      source: "companies-house",
    });
  }
  if (latestAccountsFiling !== null) {
    metrics.push({
      label: "Latest Accounts Filing Date",
      value: latestAccountsFiling.date,
      period: "Filing",
      source: "companies-house",
    });
    metrics.push({
      label: "Latest Accounts Filing Type",
      value: latestAccountsFiling.type,
      period: "Filing",
      source: "companies-house",
    });
  }
  return metrics;
}

export function extractExaDeepMetrics(
  result: WaterfallResult,
): readonly FinancialMetric[] {
  if (result.exaDeep === null) {
    return [];
  }

  const data = result.exaDeep.data;

  return [
    ...(data.estimatedRevenue !== null
      ? [
          {
            label: "Estimated Revenue",
            value: data.estimatedRevenue,
            period: "Latest public estimate",
            source: "exa-deep" as const,
          },
        ]
      : []),
    ...(data.fundingTotal !== null
      ? [
          {
            label: "Total Funding",
            value: data.fundingTotal,
            period: "Latest public disclosure",
            source: "exa-deep" as const,
          },
        ]
      : []),
    ...(data.lastValuation !== null
      ? [
          {
            label: "Last Valuation",
            value: data.lastValuation,
            period: "Latest public disclosure",
            source: "exa-deep" as const,
          },
        ]
      : []),
    ...(data.foundedYear !== null
      ? [
          {
            label: "Founded Year",
            value: data.foundedYear,
            period: "Company profile",
            source: "exa-deep" as const,
          },
        ]
      : []),
    ...(data.headquarters !== null
      ? [
          {
            label: "Headquarters",
            value: data.headquarters,
            period: "Company profile",
            source: "exa-deep" as const,
          },
        ]
      : []),
    ...(data.keyInvestors.length > 0
      ? [
          {
            label: "Key Investors",
            value: data.keyInvestors.slice(0, 5).join(", "),
            period: "Company profile",
            source: "exa-deep" as const,
          },
        ]
      : []),
    ...(data.competitors.length > 0
      ? [
          {
            label: "Competitors",
            value: data.competitors.slice(0, 5).join(", "),
            period: "Company profile",
            source: "exa-deep" as const,
          },
        ]
      : []),
  ];
}

function getCurrentValuationMetric(
  result: WaterfallResult,
  label: ValuationMetricComparison["label"],
): number | null {
  const finnhubMetrics = result.finnhub?.data.basicFinancials?.metric;
  const latestHistoricalMultiple =
    result.fmp?.data.historicalMultiples[0] ?? null;
  switch (label) {
    case "P/E":
      return (
        finnhubMetrics?.peBasicExclExtraTTM ??
        finnhubMetrics?.peTTM ??
        latestHistoricalMultiple?.peRatio ??
        null
      );
    case "EV / EBITDA":
      return (
        finnhubMetrics?.evEbitdaTTM ??
        latestHistoricalMultiple?.evToEbitda ??
        null
      );
    case "EV / Sales":
      return latestHistoricalMultiple?.evToSales ?? null;
    case "P/B":
      return finnhubMetrics?.pbAnnual ?? latestHistoricalMultiple?.pbRatio ?? null;
    default:
      return null;
  }
}

function getHistoricalRange(
  rows: readonly FmpHistoricalMultiple[],
  label: ValuationMetricComparison["label"],
): { low: number | null; high: number | null } {
  const values = rows
    .map((row) => {
      switch (label) {
        case "P/E":
          return row.peRatio;
        case "EV / EBITDA":
          return row.evToEbitda;
        case "EV / Sales":
          return row.evToSales;
        case "P/B":
          return row.pbRatio;
        default:
          return null;
      }
    })
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return { low: null, high: null };
  }
  return { low: Math.min(...values), high: Math.max(...values) };
}

function getForwardValue(
  label: ValuationMetricComparison["label"],
  result: WaterfallResult,
): number | null {
  const estimate = result.fmp?.data.analystEstimates[0] ?? null;
  const currentPrice = result.finnhub?.data.quote?.t
    ? result.finnhub.data.quote.c
    : result.fmp?.data.enterpriseValues[0]?.stockPrice ?? null;
  const enterpriseValue =
    result.fmp?.data.enterpriseValues[0]?.enterpriseValue ?? null;
  if (estimate === null) {
    return null;
  }
  switch (label) {
    case "P/E":
      return currentPrice !== null &&
        estimate.estimatedEpsAvg !== null &&
        estimate.estimatedEpsAvg !== 0
        ? currentPrice / estimate.estimatedEpsAvg
        : null;
    case "EV / Sales":
      return enterpriseValue !== null &&
        estimate.estimatedRevenueAvg !== null &&
        estimate.estimatedRevenueAvg !== 0
        ? enterpriseValue / estimate.estimatedRevenueAvg
        : null;
    default:
      return null;
  }
}

export function buildValuationView(result: WaterfallResult): ValuationView | null {
  const historicalMultiples = result.fmp?.data.historicalMultiples ?? [];
  const enterpriseValueRow = result.fmp?.data.enterpriseValues[0] ?? null;
  const estimateRows = result.fmp?.data.analystEstimates ?? [];
  const fmpPriceTarget = result.fmp?.data.priceTargetConsensus ?? null;
  const valuationLabels = ["P/E", "EV / EBITDA", "EV / Sales", "P/B"] as const;
  const metrics: ValuationMetricComparison[] = valuationLabels.map((label) => {
    const historicalRange = getHistoricalRange(historicalMultiples, label);
    const current = getCurrentValuationMetric(result, label);
    const forward = getForwardValue(label, result);
    const source =
      historicalRange.low !== null ||
      historicalRange.high !== null ||
      forward !== null
        ? "fmp"
        : "finnhub";
    return {
      label,
      current,
      historicalLow: historicalRange.low,
      historicalHigh: historicalRange.high,
      forward,
      source,
      evidenceClass: evidenceClassForSource(source),
    };
  });
  const forwardEstimates: ForwardEstimateSummary[] = estimateRows.map((row) => ({
    period: row.date,
    revenueEstimate: row.estimatedRevenueAvg,
    epsEstimate: row.estimatedEpsAvg,
    source: "fmp",
    evidenceClass: evidenceClassForSource("fmp", "analyst-consensus"),
  }));
  const currentPrice = result.finnhub?.data.quote?.t
    ? result.finnhub.data.quote.c
    : enterpriseValueRow?.stockPrice ?? null;
  const targetMean =
    fmpPriceTarget?.targetConsensus ?? fmpPriceTarget?.targetMedian ?? null;
  const upsidePercent =
    currentPrice !== null && targetMean !== null && currentPrice !== 0
      ? ((targetMean - currentPrice) / currentPrice) * 100
      : null;
  const hasMetrics = metrics.some(
    (metric) =>
      metric.current !== null ||
      metric.historicalLow !== null ||
      metric.historicalHigh !== null ||
      metric.forward !== null,
  );
  const hasForwardEstimates = forwardEstimates.length > 0;
  const currentFinnhubMarketCap =
    result.finnhub?.data.basicFinancials?.metric.marketCapitalization !== null &&
    result.finnhub?.data.basicFinancials?.metric.marketCapitalization !== undefined
      ? result.finnhub.data.basicFinancials.metric.marketCapitalization * 1_000_000
      : null;
  const hasEnterpriseValue =
    enterpriseValueRow?.enterpriseValue !== null ||
    enterpriseValueRow?.marketCapitalization !== null ||
    currentFinnhubMarketCap !== null;
  const hasTargetFallback = fmpPriceTarget !== null;
  if (!hasMetrics && !hasForwardEstimates && !hasEnterpriseValue && !hasTargetFallback) {
    return null;
  }
  const notes: string[] = [];
  if (result.fmp === null) {
    notes.push(
      "Historical ranges, peer comparison, and forward multiples require an FMP API key.",
    );
  } else if (result.fmp.data.note) {
    notes.push(result.fmp.data.note);
  }
  const currentOnlyMetrics = metrics.filter(
    (metric) =>
      metric.current !== null &&
      metric.historicalLow === null &&
      metric.historicalHigh === null &&
      metric.forward === null,
  );
  if (currentOnlyMetrics.length > 0 && result.fmp === null) {
    notes.push(
      "Current multiple coverage is coming from Finnhub while FMP-backed history is unavailable.",
    );
  }
  return {
    metrics,
    forwardEstimates,
    enterpriseValue: enterpriseValueRow?.enterpriseValue ?? null,
    marketCap:
      currentFinnhubMarketCap ??
      enterpriseValueRow?.marketCapitalization ??
      null,
    priceTargetFallback:
      fmpPriceTarget === null
        ? null
        : {
            currentPrice,
            targetMean,
            targetMedian: fmpPriceTarget.targetMedian,
            targetHigh: fmpPriceTarget.targetHigh,
            targetLow: fmpPriceTarget.targetLow,
            upsidePercent,
            source: "fmp",
            evidenceClass: evidenceClassForSource("fmp", "analyst-consensus"),
          },
    note: notes.join(" "),
    source:
      result.fmp !== null ? "fmp" : result.finnhub !== null ? "finnhub" : null,
  };
}

export function buildPeerComparison(
  result: WaterfallResult,
): readonly PeerComparisonItem[] {
  return buildRelevantPeerItems(result).map((peer) => ({
    ...peer,
    evidenceClass: peer.evidenceClass ?? evidenceClassForSource("fmp"),
  }));
}

export function assembleMetrics(result: WaterfallResult): readonly FinancialMetric[] {
  return [
    ...extractXbrlMetrics(result),
    ...extractFinnhubMetrics(result),
    ...extractCompaniesHouseMetrics(result),
    ...extractExaDeepMetrics(result),
    ...(result.claudeFallback !== null
      ? result.claudeFallback.data.extractedMetrics
      : []),
  ].map(tagMetric);
}

function toRecommendationTrend(
  recommendation: FinnhubRecommendation,
): RecommendationTrend {
  const bullish = recommendation.strongBuy + recommendation.buy;
  const bearish = recommendation.strongSell + recommendation.sell;
  const neutral = recommendation.hold;
  return {
    period: recommendation.period,
    strongBuy: recommendation.strongBuy,
    buy: recommendation.buy,
    hold: recommendation.hold,
    sell: recommendation.sell,
    strongSell: recommendation.strongSell,
    bullish,
    neutral,
    bearish,
  };
}

function getConsensusRating(trend: RecommendationTrend): string {
  if (trend.bullish >= trend.bearish && trend.bullish >= trend.neutral) {
    return "Buy";
  }
  if (trend.bearish > trend.bullish && trend.bearish >= trend.neutral) {
    return "Sell";
  }
  return "Hold";
}

export function extractConsensus(
  result: WaterfallResult,
): readonly AnalystConsensusEntry[] {
  if (result.finnhub === null) {
    return [];
  }
  const recommendations = result.finnhub.data.recommendations;
  if (recommendations.length === 0) {
    return [];
  }
  const sortedRecommendations = [...recommendations].sort((left, right) =>
    right.period.localeCompare(left.period),
  );
  const latest: FinnhubRecommendation | undefined = sortedRecommendations[0];
  const previous: FinnhubRecommendation | undefined = sortedRecommendations[1];
  if (latest === undefined) {
    return [];
  }
  const latestTrend = toRecommendationTrend(latest);
  const previousTrend =
    previous === undefined ? null : toRecommendationTrend(previous);
  const rating = getConsensusRating(latestTrend);
  const targetPrice =
    result.finnhub.data.priceTarget?.targetMean ??
    result.fmp?.data.priceTargetConsensus?.targetConsensus ??
    result.fmp?.data.priceTargetConsensus?.targetMedian ??
    null;
  const previousSummary =
    previousTrend === null
      ? null
      : `Prior ${previousTrend.period}: ${previousTrend.bullish} bullish / ${previousTrend.neutral} hold / ${previousTrend.bearish} bearish`;
  return [
    {
      firm: "Wall Street Consensus",
      rating,
      targetPrice,
      period: latestTrend.period,
      detail:
        `${latestTrend.bullish} bullish / ${latestTrend.neutral} hold / ${latestTrend.bearish} bearish` +
        (previousSummary === null ? "" : `; ${previousSummary}`),
      counts: {
        strongBuy: latestTrend.strongBuy,
        buy: latestTrend.buy,
        hold: latestTrend.hold,
        sell: latestTrend.sell,
        strongSell: latestTrend.strongSell,
        bullish: latestTrend.bullish,
        neutral: latestTrend.neutral,
        bearish: latestTrend.bearish,
      },
      source: "finnhub",
      evidenceClass: evidenceClassForSource("finnhub", "analyst-consensus"),
    },
  ];
}

export function buildStreetView(result: WaterfallResult): StreetView | null {
  if (result.finnhub === null) {
    return null;
  }
  const sortedRecommendations = [...result.finnhub.data.recommendations].sort(
    (left, right) => right.period.localeCompare(left.period),
  );
  const latest =
    sortedRecommendations[0] === undefined
      ? null
      : {
          ...toRecommendationTrend(sortedRecommendations[0]),
          evidenceClass: evidenceClassForSource("finnhub", "analyst-consensus"),
        };
  const previous =
    sortedRecommendations[1] === undefined
      ? null
      : {
          ...toRecommendationTrend(sortedRecommendations[1]),
          evidenceClass: evidenceClassForSource("finnhub", "analyst-consensus"),
        };
  const currentPrice = result.finnhub.data.quote?.t
    ? result.finnhub.data.quote.c
    : null;
  const targetMean =
    result.finnhub.data.priceTarget?.targetMean ??
    result.fmp?.data.priceTargetConsensus?.targetConsensus ??
    result.fmp?.data.priceTargetConsensus?.targetMedian ??
    null;
  const upsidePercent =
    currentPrice !== null && targetMean !== null && currentPrice !== 0
      ? ((targetMean - currentPrice) / currentPrice) * 100
      : null;
  const priceTarget =
    result.finnhub.data.priceTarget !== null
      ? {
          currentPrice,
          targetMean,
          targetMedian: result.finnhub.data.priceTarget.targetMedian,
          targetHigh: result.finnhub.data.priceTarget.targetHigh,
          targetLow: result.finnhub.data.priceTarget.targetLow,
          upsidePercent,
          lastUpdated: result.finnhub.data.priceTarget.lastUpdated,
          source: "finnhub" as const,
          evidenceClass: evidenceClassForSource("finnhub", "analyst-consensus"),
        }
      : result.fmp?.data.priceTargetConsensus !== null &&
          result.fmp?.data.priceTargetConsensus !== undefined
        ? {
            currentPrice,
            targetMean,
            targetMedian: result.fmp.data.priceTargetConsensus.targetMedian,
            targetHigh: result.fmp.data.priceTargetConsensus.targetHigh,
            targetLow: result.fmp.data.priceTargetConsensus.targetLow,
            upsidePercent,
            source: "fmp" as const,
            evidenceClass: evidenceClassForSource("fmp", "analyst-consensus"),
          }
        : null;
  const hasStreetData = latest !== null || priceTarget !== null;
  if (!hasStreetData) {
    return null;
  }
  return {
    consensusRating: latest === null ? null : getConsensusRating(latest),
    latest,
    previous,
    priceTarget,
    priceTargetNote:
      priceTarget?.source === "fmp"
        ? "Target-price coverage is coming from FMP consensus because Finnhub target coverage is unavailable on the current plan."
        : result.finnhub.data.priceTargetNote,
    source: priceTarget?.source ?? "finnhub",
  };
}

export function extractEarningsHighlights(
  result: WaterfallResult,
): readonly EarningsHighlight[] {
  if (result.finnhub === null) {
    return [];
  }
  return result.finnhub.data.earnings.map((item) => ({
    period: item.period,
    actual: item.actual,
    estimate: item.estimate,
    surprise: item.surprise,
    surprisePercent: item.surprisePercent,
    source: "finnhub",
    evidenceClass: evidenceClassForSource("finnhub"),
  }));
}

export function extractInsiderActivity(
  result: WaterfallResult,
): readonly InsiderActivityItem[] {
  if (result.finnhub === null) {
    return [];
  }
  return result.finnhub.data.insiderTransactions.map((item) => ({
    name: item.name,
    shareChange: item.change,
    share: item.share,
    transactionCode: item.transactionCode,
    transactionDate: item.transactionDate,
    filingDate: item.filingDate,
    transactionPrice: item.transactionPrice,
    source: "finnhub",
    evidenceClass: evidenceClassForSource("finnhub"),
  }));
}

export function extractNewsHighlights(
  result: WaterfallResult,
): readonly NewsHighlight[] {
  if (result.finnhub === null) {
    return [];
  }
  return result.finnhub.data.news.slice(0, 5).map((item) => ({
    ...enrichNewsHighlight({
      headline: item.headline,
      source: item.source,
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      summary: item.summary,
      url: item.url,
    }),
    evidenceClass: evidenceClassForSource("finnhub", "news"),
  }));
}

export function buildNewsSentimentSummary(
  highlights: readonly NewsHighlight[],
) {
  return summarizeNewsSentiment(highlights);
}
