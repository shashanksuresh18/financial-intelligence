import type {
  AnalystConsensusEntry,
  EarningsHighlight,
  FinancialMetric,
  ForwardEstimateSummary,
  FmpHistoricalMultiple,
  FinnhubRecommendation,
  InsiderActivityItem,
  NewsHighlight,
  PeerComparisonItem,
  RecommendationTrend,
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

const DIRECTIONAL_INSIDER_CODES = new Set(["P", "S"]);
const MIN_MEANINGFUL_INSIDER_NOTIONAL = 500_000;
const MIN_MEANINGFUL_INSIDER_SHARE_CHANGE = 10_000;

type MeaningfulInsiderFlowSummary = {
  readonly direction: "buy" | "sell";
  readonly totalShareChange: number;
  readonly totalNotional: number;
  readonly transactionCount: number;
};

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

function scorePeerComparisonCandidate(
  peer: PeerComparisonItem,
): number {
  let score = 0;

  if (peer.marketCap !== null) {
    score += 1;
  }

  if (peer.peRatio !== null) {
    score += 2;
  }

  if (peer.evToEbitda !== null) {
    score += 2;
  }

  if (peer.revenueGrowth !== null) {
    score += 2;
  }

  return score;
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
    return {
      label,
      current,
      historicalLow: historicalRange.low,
      historicalHigh: historicalRange.high,
      forward,
      source:
        historicalRange.low !== null ||
        historicalRange.high !== null ||
        forward !== null
          ? "fmp"
          : "finnhub",
    };
  });
  const forwardEstimates: ForwardEstimateSummary[] = estimateRows.map((row) => ({
    period: row.date,
    revenueEstimate: row.estimatedRevenueAvg,
    epsEstimate: row.estimatedEpsAvg,
    source: "fmp",
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
  const hasEnterpriseValue =
    enterpriseValueRow?.enterpriseValue !== null ||
    enterpriseValueRow?.marketCapitalization !== null;
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
      enterpriseValueRow?.marketCapitalization ??
      (result.finnhub?.data.basicFinancials?.metric.marketCapitalization ?? null),
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
          },
    note: notes.join(" "),
    source:
      result.fmp !== null ? "fmp" : result.finnhub !== null ? "finnhub" : null,
  };
}

export function buildPeerComparison(
  result: WaterfallResult,
): readonly PeerComparisonItem[] {
  if (result.fmp === null) {
    return [];
  }

  return result.fmp.data.peers
    .map((peer) => ({
      symbol: peer.symbol,
      companyName: peer.companyName,
      currentPrice: peer.currentPrice,
      marketCap: peer.marketCap,
      peRatio: peer.peRatio,
      evToEbitda: peer.evToEbitda,
      revenueGrowth: peer.revenueGrowth,
      source: "fmp" as const,
    }))
    .map((peer) => ({
      peer,
      score: scorePeerComparisonCandidate(peer),
    }))
    .filter(({ score }) => score >= 2)
    .sort((left, right) => right.score - left.score)
    .map(({ peer }) => peer);
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
  ];
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
      : toRecommendationTrend(sortedRecommendations[0]);
  const previous =
    sortedRecommendations[1] === undefined
      ? null
      : toRecommendationTrend(sortedRecommendations[1]);
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
  }));
}

export function extractNewsHighlights(
  result: WaterfallResult,
): readonly NewsHighlight[] {
  if (result.finnhub === null) {
    return [];
  }
  return result.finnhub.data.news.slice(0, 5).map((item) =>
    enrichNewsHighlight({
      headline: item.headline,
      source: item.source,
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      summary: item.summary,
      url: item.url,
    }),
  );
}

export function buildNewsSentimentSummary(
  highlights: readonly NewsHighlight[],
) {
  return summarizeNewsSentiment(highlights);
}
