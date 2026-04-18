import type {
  AnalysisReport,
  AnalystConsensusEntry,
  ChallengerReport,
  CoverageGap,
  DisagreementNote,
  EntityResolution,
  EarningsHighlight,
  EvidenceSignal,
  FinancialMetric,
  ForwardEstimateSummary,
  FmpHistoricalMultiple,
  FinnhubRecommendation,
  InsiderActivityItem,
  NewsHighlight,
  PeerComparisonItem,
  ReportDelta,
  RecommendationTrend,
  SectionAuditItem,
  StreetView,
  ValuationMetricComparison,
  ValidationReport,
  ValuationView,
  WaterfallResult,
} from "@/lib/types";
import { runChallengerAgent } from "@/lib/agents/challenger-agent";
import { buildEntityResolution } from "@/lib/agents/entity-agent";
import { runWaterfall } from "@/lib/agents/market-data-agent";
import { runMemoAgent } from "@/lib/agents/memo-agent";
import { validateWaterfall } from "@/lib/agents/validation-agent";
import {
  extractLatestFact,
  NET_INCOME_CONCEPTS,
  REVENUE_CONCEPTS,
} from "@/lib/datasources/sec-edgar";
import { computeConfidence } from "@/lib/confidence";
export { runWaterfall };

function extractXbrlMetrics(result: WaterfallResult): readonly FinancialMetric[] {
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
  ];
}

function extractFinnhubMetrics(
  result: WaterfallResult,
): readonly FinancialMetric[] {
  if (result.finnhub === null) {
    return [];
  }

  const {
    basicFinancials,
    priceTarget,
    quote,
  } = result.finnhub.data;
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
      ...(metric.epsGrowthTTMYoy !== null &&
        metric.epsGrowthTTMYoy !== undefined
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

function extractCompaniesHouseMetrics(
  result: WaterfallResult,
): readonly FinancialMetric[] {
  if (result.companiesHouse === null) {
    return [];
  }

  const profile = result.companiesHouse.data.profile;
  const latestAccountsFiling = result.companiesHouse.data.accountsFilings[0] ?? null;
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

function getCurrentValuationMetric(
  result: WaterfallResult,
  label: ValuationMetricComparison["label"],
): number | null {
  const finnhubMetrics = result.finnhub?.data.basicFinancials?.metric;
  const latestHistoricalMultiple = result.fmp?.data.historicalMultiples[0] ?? null;

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
      return (
        finnhubMetrics?.pbAnnual ??
        latestHistoricalMultiple?.pbRatio ??
        null
      );
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

  return {
    low: Math.min(...values),
    high: Math.max(...values),
  };
}

function getForwardValue(
  label: ValuationMetricComparison["label"],
  result: WaterfallResult,
): number | null {
  const estimate = result.fmp?.data.analystEstimates[0] ?? null;
  const currentPrice = result.finnhub?.data.quote?.t
    ? result.finnhub.data.quote.c
    : result.fmp?.data.enterpriseValues[0]?.stockPrice ?? null;
  const enterpriseValue = result.fmp?.data.enterpriseValues[0]?.enterpriseValue ?? null;

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

function buildValuationView(result: WaterfallResult): ValuationView | null {
  const historicalMultiples = result.fmp?.data.historicalMultiples ?? [];
  const enterpriseValueRow = result.fmp?.data.enterpriseValues[0] ?? null;
  const estimateRows = result.fmp?.data.analystEstimates ?? [];
  const fmpPriceTarget = result.fmp?.data.priceTargetConsensus ?? null;
  const valuationLabels = [
    "P/E",
    "EV / EBITDA",
    "EV / Sales",
    "P/B",
  ] as const;

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
  const targetMean = fmpPriceTarget?.targetConsensus ?? fmpPriceTarget?.targetMedian ?? null;
  const upsidePercent =
    currentPrice !== null &&
      targetMean !== null &&
      currentPrice !== 0
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
      result.fmp !== null
        ? "fmp"
        : result.finnhub !== null
          ? "finnhub"
          : null,
  };
}

function buildPeerComparison(
  result: WaterfallResult,
): readonly PeerComparisonItem[] {
  if (result.fmp === null) {
    return [];
  }

  return result.fmp.data.peers.map((peer) => ({
    symbol: peer.symbol,
    companyName: peer.companyName,
    currentPrice: peer.currentPrice,
    marketCap: peer.marketCap,
    peRatio: peer.peRatio,
    evToEbitda: peer.evToEbitda,
    revenueGrowth: peer.revenueGrowth,
    source: "fmp",
  }));
}

function assembleMetrics(result: WaterfallResult): readonly FinancialMetric[] {
  return [
    ...extractXbrlMetrics(result),
    ...extractFinnhubMetrics(result),
    ...extractCompaniesHouseMetrics(result),
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

function extractConsensus(
  result: WaterfallResult,
): readonly AnalystConsensusEntry[] {
  if (result.finnhub === null) {
    return [];
  }

  const recommendations = result.finnhub.data.recommendations;

  if (recommendations.length === 0) {
    return [];
  }

  const sortedRecommendations = [...recommendations].sort(
    (left, right) => right.period.localeCompare(left.period),
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

function buildStreetView(result: WaterfallResult): StreetView | null {
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
    currentPrice !== null &&
      targetMean !== null &&
      currentPrice !== 0
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

  const hasStreetData =
    latest !== null ||
    priceTarget !== null;

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

function extractEarningsHighlights(
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

function extractInsiderActivity(
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

function extractNewsHighlights(
  result: WaterfallResult,
): readonly NewsHighlight[] {
  if (result.finnhub === null) {
    return [];
  }

  return result.finnhub.data.news.slice(0, 5).map((item) => ({
    headline: item.headline,
    source: item.source,
    publishedAt: new Date(item.datetime * 1000).toISOString(),
    summary: item.summary,
    url: item.url,
  }));
}

function findMetricValue(
  metrics: readonly FinancialMetric[],
  label: string,
): number | null {
  const item = metrics.find((metric) => metric.label === label);

  return item !== undefined && typeof item.value === "number" ? item.value : null;
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function buildEvidenceSignals(params: {
  waterfallResult: WaterfallResult;
  metrics: readonly FinancialMetric[];
  streetView: StreetView | null;
  valuationView: ValuationView | null;
  earningsHighlights: readonly EarningsHighlight[];
  peerComparison: readonly PeerComparisonItem[];
  insiderActivity: readonly InsiderActivityItem[];
}): readonly EvidenceSignal[] {
  const {
    waterfallResult,
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    peerComparison,
    insiderActivity,
  } = params;
  const signals: EvidenceSignal[] = [];
  const companiesHouseProfile = waterfallResult.companiesHouse?.data.profile ?? null;
  const latestAccountsFiling =
    waterfallResult.companiesHouse?.data.accountsFilings[0] ?? null;
  const lastAccountsMadeUpTo =
    companiesHouseProfile?.accounts?.last_accounts?.made_up_to ?? null;
  const lastAccountsType =
    companiesHouseProfile?.accounts?.last_accounts?.type ?? null;
  const nextAccountsDue =
    companiesHouseProfile?.accounts?.next_accounts?.due_on ??
    companiesHouseProfile?.accounts?.next_due ??
    null;
  const accountsOverdue =
    companiesHouseProfile?.accounts?.next_accounts?.overdue ?? null;
  const revenueGrowth = findMetricValue(metrics, "Revenue Growth");
  const netMargin = findMetricValue(metrics, "Net Margin");
  const currentPe = valuationView?.metrics.find((item) => item.label === "P/E")?.current ?? null;
  const forwardPe =
    valuationView?.metrics.find((item) => item.label === "P/E")?.forward ?? null;
  const latestEarnings = earningsHighlights[0];
  const latestTarget = streetView?.priceTarget;
  const totalInsiderShareChange = insiderActivity.reduce((total, item) => {
    if (item.shareChange === null) {
      return total;
    }

    return total + item.shareChange;
  }, 0);

  if (revenueGrowth !== null) {
    signals.push({
      title: revenueGrowth >= 0 ? "Revenue momentum is positive" : "Revenue momentum is under pressure",
      detail: `Latest reported revenue growth is ${formatSignedNumber(revenueGrowth)}% on the current evidence set.`,
      tone: revenueGrowth >= 0 ? "positive" : "negative",
      sources: ["finnhub"],
    });
  }

  if (accountsOverdue === true) {
    signals.push({
      title: "Next UK accounts appear overdue",
      detail:
        nextAccountsDue === null
          ? "Companies House marks the next accounts as overdue, which weakens filing timeliness."
          : `Companies House shows the next accounts due on ${nextAccountsDue} as overdue, which weakens filing timeliness.`,
      tone: "negative",
      sources: ["companies-house"],
    });
  } else if (lastAccountsMadeUpTo !== null) {
    signals.push({
      title: "UK accounts metadata is available",
      detail:
        `Companies House shows latest accounts made up to ${lastAccountsMadeUpTo}` +
        (lastAccountsType === null ? "" : ` (${lastAccountsType})`) +
        (latestAccountsFiling === null
          ? "."
          : `, with the latest accounts filing dated ${latestAccountsFiling.date}.`),
      tone: "neutral",
      sources: ["companies-house"],
    });
  } else if (latestAccountsFiling !== null) {
    signals.push({
      title: "A recent UK accounts filing is attached",
      detail: `Companies House filing history includes an accounts filing dated ${latestAccountsFiling.date} (${latestAccountsFiling.type}).`,
      tone: "neutral",
      sources: ["companies-house"],
    });
  }

  if (netMargin !== null) {
    signals.push({
      title: netMargin >= 0 ? "Net margins remain positive" : "Net margins are negative",
      detail: `Latest net margin reads ${formatSignedNumber(netMargin)}% from structured market data.`,
      tone: netMargin >= 0 ? "positive" : "negative",
      sources: ["finnhub"],
    });
  }

  if (
    currentPe !== null &&
    forwardPe !== null &&
    forwardPe !== 0
  ) {
    const compression = currentPe - forwardPe;

    signals.push({
      title: "Forward multiple sits below the current market multiple",
      detail: `Current P/E is ${currentPe.toFixed(1)}x versus forward P/E at ${forwardPe.toFixed(1)}x, a spread of ${compression.toFixed(1)} turns.`,
      tone: compression >= 0 ? "positive" : "neutral",
      sources: ["fmp", "finnhub"],
    });
  }

  if (latestTarget?.upsidePercent !== null && latestTarget?.upsidePercent !== undefined) {
    signals.push({
      title:
        latestTarget.upsidePercent >= 0
          ? "Street target still implies upside"
          : "Street target implies downside",
      detail: `Consensus target implies ${formatSignedNumber(latestTarget.upsidePercent)}% versus the current price.`,
      tone: latestTarget.upsidePercent >= 0 ? "positive" : "negative",
      sources: [latestTarget.source],
    });
  }

  if (latestEarnings?.surprisePercent !== null && latestEarnings?.surprisePercent !== undefined) {
    signals.push({
      title:
        latestEarnings.surprisePercent >= 0
          ? "Latest earnings beat estimates"
          : "Latest earnings missed estimates",
      detail: `${latestEarnings.period} posted a ${formatSignedNumber(latestEarnings.surprisePercent)}% earnings surprise.`,
      tone: latestEarnings.surprisePercent >= 0 ? "positive" : "negative",
      sources: ["finnhub"],
    });
  }

  if (peerComparison.length > 0) {
    signals.push({
      title: "Peer frame is now available",
      detail: `Comparable names include ${peerComparison
        .slice(0, 3)
        .map((peer) => peer.symbol)
        .join(", ")}.`,
      tone: "neutral",
      sources: ["fmp"],
    });
  }

  if (insiderActivity.length > 0) {
    signals.push({
      title: totalInsiderShareChange >= 0 ? "Recent insider flow is supportive" : "Recent insider flow skews to selling",
      detail: `Recent insider activity totals ${Math.abs(totalInsiderShareChange).toLocaleString("en-US")} shares ${totalInsiderShareChange >= 0 ? "added" : "sold"} across the tracked window.`,
      tone: totalInsiderShareChange >= 0 ? "positive" : "negative",
      sources: ["finnhub"],
    });
  }

  return signals.slice(0, 6);
}

function buildCoverageGaps(params: {
  waterfallResult: WaterfallResult;
  streetView: StreetView | null;
  valuationView: ValuationView | null;
  peerComparison: readonly PeerComparisonItem[];
  earningsHighlights: readonly EarningsHighlight[];
  insiderActivity: readonly InsiderActivityItem[];
}): readonly CoverageGap[] {
  const {
    waterfallResult,
    streetView,
    valuationView,
    peerComparison,
    earningsHighlights,
    insiderActivity,
  } = params;
  const gaps: CoverageGap[] = [];
  const companiesHouseProfile = waterfallResult.companiesHouse?.data.profile ?? null;
  const accountsFilings = waterfallResult.companiesHouse?.data.accountsFilings ?? [];
  const lastAccountsMadeUpTo =
    companiesHouseProfile?.accounts?.last_accounts?.made_up_to ?? null;
  const lastAccountsType =
    companiesHouseProfile?.accounts?.last_accounts?.type ?? null;
  const hasUkAccountsMetadata = lastAccountsMadeUpTo !== null || lastAccountsType !== null;
  const hasUkAccountsFiling = accountsFilings.length > 0;

  if (waterfallResult.secEdgar?.data.xbrlFacts === null || waterfallResult.secEdgar === null) {
    gaps.push({
      title: "Primary filing detail is limited",
      detail:
        waterfallResult.companiesHouse !== null
          ? hasUkAccountsMetadata || hasUkAccountsFiling
            ? "No structured SEC XBRL fact set was attached, and the UK registry currently supplies accounts metadata rather than parsed filing facts, so filing-backed financial analysis remains limited."
            : "No structured SEC XBRL fact set was attached, and UK registry evidence has not yet surfaced enough accounts metadata to support deeper filing-backed analysis."
          : "No structured SEC XBRL fact set was attached, so the note relies more heavily on market-data vendors than filing-backed financial statements.",
      severity: "high",
    });
  }

  if (waterfallResult.companiesHouse !== null && !hasUkAccountsMetadata) {
    gaps.push({
      title: "UK accounts metadata is limited",
      detail:
        "Companies House did not return a last-accounts made-up date or accounts type, so registry evidence is thinner than expected for a UK private-company read.",
      severity: "medium",
    });
  }

  if (waterfallResult.companiesHouse !== null && !hasUkAccountsFiling) {
    gaps.push({
      title: "No recent UK accounts filing was attached",
      detail:
        "Accounts filing history did not return a recent accounts entry, so deeper UK filing analysis would require document-level retrieval.",
      severity: "low",
    });
  }

  if (streetView?.priceTarget === null || streetView === null) {
    gaps.push({
      title: "Target-price coverage is incomplete",
      detail:
        "The report could not surface a live target-price range from the available analyst feeds.",
      severity: "medium",
    });
  }

  if (valuationView === null || valuationView.forwardEstimates.length === 0) {
    gaps.push({
      title: "Forward estimate coverage is thin",
      detail:
        "Forward revenue and EPS estimates were not available, which limits projected-multiple analysis.",
      severity: "medium",
    });
  }

  if (peerComparison.length === 0) {
    gaps.push({
      title: "Peer comparison is unavailable",
      detail:
        "No comparable-company set was returned, so relative valuation context is limited.",
      severity: "medium",
    });
  }

  if (earningsHighlights.length === 0) {
    gaps.push({
      title: "No recent earnings signal set",
      detail:
        "The earnings-surprise panel is empty, so near-term expectation tracking is weaker.",
      severity: "low",
    });
  }

  if (insiderActivity.length === 0) {
    gaps.push({
      title: "Insider-activity coverage is absent",
      detail:
        "No recent insider transactions were attached, so management-trading context is limited.",
      severity: "low",
    });
  }

  return gaps.slice(0, 6);
}

function buildDisagreementNotes(params: {
  metrics: readonly FinancialMetric[];
  streetView: StreetView | null;
  valuationView: ValuationView | null;
  earningsHighlights: readonly EarningsHighlight[];
  insiderActivity: readonly InsiderActivityItem[];
}): readonly DisagreementNote[] {
  const {
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    insiderActivity,
  } = params;
  const notes: DisagreementNote[] = [];
  const latestEarnings = earningsHighlights[0];
  const consensusRating = streetView?.consensusRating?.toLowerCase() ?? null;
  const revenueGrowth = findMetricValue(metrics, "Revenue Growth");
  const currentPe = valuationView?.metrics.find((item) => item.label === "P/E")?.current ?? null;
  const historicalHigh =
    valuationView?.metrics.find((item) => item.label === "P/E")?.historicalHigh ?? null;
  const upsidePercent = streetView?.priceTarget?.upsidePercent ?? null;
  const totalInsiderShareChange = insiderActivity.reduce((total, item) => {
    if (item.shareChange === null) {
      return total;
    }

    return total + item.shareChange;
  }, 0);

  if (
    latestEarnings?.surprisePercent !== null &&
    latestEarnings?.surprisePercent !== undefined &&
    latestEarnings.surprisePercent < 0 &&
    consensusRating === "buy"
  ) {
    notes.push({
      title: "Street optimism is surviving a recent miss",
      detail: `Consensus remains Buy even though ${latestEarnings.period} missed by ${Math.abs(
        latestEarnings.surprisePercent,
      ).toFixed(1)}%.`,
      sources: ["finnhub"],
    });
  }

  if (
    revenueGrowth !== null &&
    revenueGrowth < 0 &&
    consensusRating === "buy"
  ) {
    notes.push({
      title: "Consensus is constructive despite weaker growth",
      detail: `Revenue growth is running at ${revenueGrowth.toFixed(1)}%, yet recommendation data still skews bullish.`,
      sources: ["finnhub"],
    });
  }

  if (
    currentPe !== null &&
    historicalHigh !== null &&
    upsidePercent !== null &&
    upsidePercent > 0 &&
    currentPe >= historicalHigh * 0.95
  ) {
    notes.push({
      title: "Upside target coexists with a rich multiple",
      detail: `Shares trade near the top of the observed P/E range (${currentPe.toFixed(
        1,
      )}x versus historical high ${historicalHigh.toFixed(
        1,
      )}x) while the Street still implies upside.`,
      sources: ["fmp", "finnhub"],
    });
  }

  if (totalInsiderShareChange < 0 && consensusRating === "buy") {
    notes.push({
      title: "Insider flow is softer than Street sentiment",
      detail:
        "Recent tracked insider activity skews to selling even as consensus remains constructive.",
      sources: ["finnhub"],
    });
  }

  return notes.slice(0, 4);
}

function buildSectionAudit(params: {
  entityResolution: EntityResolution;
  waterfallResult: WaterfallResult;
  metrics: readonly FinancialMetric[];
  streetView: StreetView | null;
  valuationView: ValuationView | null;
  earningsHighlights: readonly EarningsHighlight[];
  newsHighlights: readonly NewsHighlight[];
  coverageGaps: readonly CoverageGap[];
  disagreementNotes: readonly DisagreementNote[];
}): readonly SectionAuditItem[] {
  const {
    entityResolution,
    waterfallResult,
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    newsHighlights,
    coverageGaps,
    disagreementNotes,
  } = params;
  const valuationCoverage =
    valuationView?.metrics.filter(
      (item) =>
        item.current !== null ||
        item.historicalLow !== null ||
        item.historicalHigh !== null ||
        item.forward !== null,
    ).length ?? 0;
  const hasForwardEstimates = (valuationView?.forwardEstimates.length ?? 0) > 0;
  const financialMetricCount = metrics.length;
  const hasStreetConsensus = streetView?.latest !== null && streetView !== null;
  const hasStreetTarget = streetView?.priceTarget !== null && streetView !== null;
  const hasPrimaryFilings = waterfallResult.secEdgar?.data.xbrlFacts !== null &&
    waterfallResult.secEdgar !== null;
  const hasCompaniesHouseAccountsMetadata =
    waterfallResult.companiesHouse?.data.profile?.accounts?.last_accounts?.made_up_to !== undefined ||
    waterfallResult.companiesHouse?.data.profile?.accounts?.last_accounts?.type !== undefined ||
    (waterfallResult.companiesHouse?.data.accountsFilings.length ?? 0) > 0;

  const sectionAudit: SectionAuditItem[] = [
    {
      section: "Entity Resolution",
      status:
        entityResolution.primarySource === null
          ? "limited"
          : entityResolution.matchedSources.length >= 2
            ? "supported"
            : "partial",
      note:
        entityResolution.matchedSources.length >= 2
          ? `Canonical entity is backed by ${entityResolution.matchedSources.length} corroborating sources.`
          : entityResolution.note,
      sources: entityResolution.matchedSources,
    },
    {
      section: "Company Overview",
      status:
        entityResolution.identifiers.length >= 4
          ? "supported"
          : entityResolution.identifiers.length >= 2
            ? "partial"
            : "limited",
      note:
        entityResolution.identifiers.length >= 4
          ? "Overview is anchored by multiple identifiers and legal-entity references."
          : "Overview relies on a thinner identifier set than the strongest cases.",
      sources: entityResolution.matchedSources,
    },
    {
      section: "Financial Analysis",
      status:
        hasPrimaryFilings || financialMetricCount >= 8
          ? "supported"
          : financialMetricCount >= 4
            ? "partial"
            : "limited",
      note:
        hasPrimaryFilings
          ? "Primary filing facts and structured metrics support the financial-analysis section."
          : `Financial analysis currently rests on ${financialMetricCount} structured metrics without full filing depth.`,
      sources: [
        ...(waterfallResult.secEdgar !== null ? (["sec-edgar"] as const) : []),
        ...(waterfallResult.finnhub !== null ? (["finnhub"] as const) : []),
        ...(waterfallResult.fmp !== null ? (["fmp"] as const) : []),
        ...(hasCompaniesHouseAccountsMetadata ? (["companies-house"] as const) : []),
      ],
    },
    {
      section: "Valuation",
      status:
        valuationCoverage >= 2 && hasForwardEstimates
          ? "supported"
          : valuationCoverage >= 1 || valuationView?.priceTargetFallback !== null
            ? "partial"
            : "limited",
      note:
        valuationCoverage >= 2 && hasForwardEstimates
          ? "Valuation has current, historical, and forward context."
          : valuationCoverage >= 1
            ? "Valuation has some structured coverage, but the historical/forward frame is incomplete."
            : "Valuation coverage is limited for this company.",
      sources: [
        ...(waterfallResult.fmp !== null ? (["fmp"] as const) : []),
        ...(waterfallResult.finnhub !== null ? (["finnhub"] as const) : []),
      ],
    },
    {
      section: "Street Consensus",
      status:
        hasStreetConsensus &&
          (hasStreetTarget || hasForwardEstimates)
          ? "supported"
          : streetView !== null || earningsHighlights.length > 0
            ? "partial"
            : "limited",
      note:
        hasStreetConsensus &&
          (hasStreetTarget || hasForwardEstimates)
          ? "Consensus combines recommendations with target or forward-estimate context."
          : streetView !== null || earningsHighlights.length > 0
            ? "Street view is present, but some target/estimate detail is still thin."
            : "Street-consensus coverage is limited.",
      sources: [
        ...(waterfallResult.finnhub !== null ? (["finnhub"] as const) : []),
        ...(waterfallResult.fmp !== null ? (["fmp"] as const) : []),
      ],
    },
    {
      section: "Risk Factors",
      status:
        coverageGaps.length >= 2 || disagreementNotes.length > 0
          ? "supported"
          : newsHighlights.length > 0
            ? "partial"
            : "limited",
      note:
        coverageGaps.length >= 2 || disagreementNotes.length > 0
          ? "Risk factors are grounded in explicit data gaps and evidence tensions."
          : newsHighlights.length > 0
            ? "Risk framing is supported by recent news, but structured tensions are limited."
            : "Risk factors rely mostly on general narrative framing.",
      sources: [
        ...(newsHighlights.length > 0 ? (["finnhub"] as const) : []),
        ...new Set(
          disagreementNotes.flatMap((item) => item.sources),
        ),
      ],
    },
    {
      section: "Catalysts & Outlook",
      status:
        earningsHighlights.length > 0 && (hasForwardEstimates || newsHighlights.length > 0)
          ? "supported"
          : earningsHighlights.length > 0 || hasForwardEstimates || newsHighlights.length > 0
            ? "partial"
            : "limited",
      note:
        earningsHighlights.length > 0 && (hasForwardEstimates || newsHighlights.length > 0)
          ? "Outlook has both event-driven and forward-estimate support."
          : earningsHighlights.length > 0 || hasForwardEstimates || newsHighlights.length > 0
            ? "Outlook has partial support from earnings, estimates, or recent headlines."
            : "Catalysts are thin because both event and estimate coverage are limited.",
      sources: [
        ...(earningsHighlights.length > 0 ? (["finnhub"] as const) : []),
        ...(hasForwardEstimates ? (["fmp"] as const) : []),
        ...(newsHighlights.length > 0 ? (["finnhub"] as const) : []),
      ],
    },
  ];

  return sectionAudit.map((item) => ({
    ...item,
    sources: [...new Set(item.sources)],
  }));
}

function getSectionStatusScore(status: SectionAuditItem["status"]): number {
  switch (status) {
    case "supported":
      return 2;
    case "partial":
      return 1;
    case "limited":
      return 0;
    default:
      return 0;
  }
}

function getSectionAuditSummary(
  items: readonly SectionAuditItem[],
): { supported: number; partial: number; limited: number; score: number } {
  return items.reduce(
    (summary, item) => ({
      supported: summary.supported + (item.status === "supported" ? 1 : 0),
      partial: summary.partial + (item.status === "partial" ? 1 : 0),
      limited: summary.limited + (item.status === "limited" ? 1 : 0),
      score: summary.score + getSectionStatusScore(item.status),
    }),
    { supported: 0, partial: 0, limited: 0, score: 0 },
  );
}

function deltaToneFromChange(change: number): ReportDelta["tone"] {
  if (change > 0) {
    return "positive";
  }

  if (change < 0) {
    return "negative";
  }

  return "neutral";
}

function compareReports(
  previousReport: AnalysisReport | null | undefined,
  currentReport: AnalysisReport,
): readonly ReportDelta[] {
  if (previousReport === null || previousReport === undefined) {
    return [
      {
        title: "First structured run",
        detail:
          "No previous cached report was available, so this run establishes the baseline evidence set.",
        tone: "neutral",
      },
    ];
  }

  const deltas: ReportDelta[] = [];
  const confidenceChange =
    currentReport.confidence.score - previousReport.confidence.score;

  if (confidenceChange !== 0) {
    deltas.push({
      title: "Confidence changed",
      detail: `Confidence moved from ${previousReport.confidence.score}/100 to ${currentReport.confidence.score}/100.`,
      tone: deltaToneFromChange(confidenceChange),
    });
  }

  const metricChange = currentReport.metrics.length - previousReport.metrics.length;

  if (metricChange !== 0) {
    deltas.push({
      title: "Metric coverage changed",
      detail: `Structured metric count moved from ${previousReport.metrics.length} to ${currentReport.metrics.length}.`,
      tone: deltaToneFromChange(metricChange),
    });
  }

  const peerCoverageChange =
    currentReport.peerComparison.length - previousReport.peerComparison.length;

  if (peerCoverageChange !== 0) {
    deltas.push({
      title: "Peer coverage changed",
      detail: `Comparable-company rows moved from ${previousReport.peerComparison.length} to ${currentReport.peerComparison.length}.`,
      tone: deltaToneFromChange(peerCoverageChange),
    });
  }

  const currentStreet = currentReport.streetView?.latest;
  const previousStreet = previousReport.streetView?.latest;

  if (currentStreet !== null && currentStreet !== undefined) {
    const bullishChange = currentStreet.bullish - (previousStreet?.bullish ?? 0);
    const neutralChange = currentStreet.neutral - (previousStreet?.neutral ?? 0);
    const bearishChange = currentStreet.bearish - (previousStreet?.bearish ?? 0);

    if (
      previousStreet === undefined ||
      bullishChange !== 0 ||
      neutralChange !== 0 ||
      bearishChange !== 0
    ) {
      deltas.push({
        title: "Street stance shifted",
        detail:
          previousStreet === undefined
            ? `Street consensus is now available for ${currentStreet.period}: ${currentStreet.bullish} bullish / ${currentStreet.neutral} hold / ${currentStreet.bearish} bearish.`
            : `Vs prior run, bullish ${bullishChange >= 0 ? "+" : ""}${bullishChange}, hold ${neutralChange >= 0 ? "+" : ""}${neutralChange}, bearish ${bearishChange >= 0 ? "+" : ""}${bearishChange}.`,
        tone:
          bullishChange > bearishChange
            ? "positive"
            : bearishChange > bullishChange
              ? "negative"
              : "neutral",
      });
    }
  }

  const currentTarget = currentReport.streetView?.priceTarget?.targetMean ?? null;
  const previousTarget = previousReport.streetView?.priceTarget?.targetMean ?? null;

  if (currentTarget !== previousTarget) {
    deltas.push({
      title: "Target-price context changed",
      detail:
        currentTarget === null
          ? "Mean target-price coverage is no longer available."
          : previousTarget === null
            ? `Mean target-price coverage is now available at ${currentTarget.toFixed(2)}.`
            : `Mean target moved from ${previousTarget.toFixed(2)} to ${currentTarget.toFixed(2)}.`,
      tone:
        currentTarget === null || previousTarget === null
          ? "neutral"
          : deltaToneFromChange(currentTarget - previousTarget),
    });
  }

  const currentEarnings = currentReport.earningsHighlights[0];
  const previousEarnings = previousReport.earningsHighlights[0];

  if (
    currentEarnings !== undefined &&
    (previousEarnings === undefined ||
      currentEarnings.period !== previousEarnings.period ||
      currentEarnings.surprisePercent !== previousEarnings.surprisePercent)
  ) {
    deltas.push({
      title: "Latest earnings signal updated",
      detail:
        currentEarnings.surprisePercent === null
          ? `Latest earnings period is ${currentEarnings.period}, but the surprise percentage is unavailable.`
          : `Latest earnings period ${currentEarnings.period} carries a ${currentEarnings.surprisePercent.toFixed(
            1,
          )}% surprise.`,
      tone:
        currentEarnings.surprisePercent === null
          ? "neutral"
          : deltaToneFromChange(currentEarnings.surprisePercent),
    });
  }

  const currentValuationRows =
    currentReport.valuationView?.metrics.filter(
      (item) =>
        item.current !== null ||
        item.historicalLow !== null ||
        item.historicalHigh !== null ||
        item.forward !== null,
    ).length ?? 0;
  const previousValuationRows =
    previousReport.valuationView?.metrics.filter(
      (item) =>
        item.current !== null ||
        item.historicalLow !== null ||
        item.historicalHigh !== null ||
        item.forward !== null,
    ).length ?? 0;

  if (currentValuationRows !== previousValuationRows) {
    deltas.push({
      title: "Valuation coverage changed",
      detail: `Valuation rows with usable data moved from ${previousValuationRows} to ${currentValuationRows}.`,
      tone: deltaToneFromChange(currentValuationRows - previousValuationRows),
    });
  }

  const currentAuditSummary = getSectionAuditSummary(currentReport.sectionAudit);
  const previousAuditSummary = getSectionAuditSummary(previousReport.sectionAudit);

  if (currentAuditSummary.score !== previousAuditSummary.score) {
    deltas.push({
      title: "Section support quality changed",
      detail:
        `Audit score moved from ${previousAuditSummary.score} to ${currentAuditSummary.score}; ` +
        `${currentAuditSummary.supported} supported / ${currentAuditSummary.partial} partial / ${currentAuditSummary.limited} limited sections on the latest run.`,
      tone: deltaToneFromChange(currentAuditSummary.score - previousAuditSummary.score),
    });
  }

  const sectionStatusChanges = currentReport.sectionAudit
    .map((item) => {
      const previousItem = previousReport.sectionAudit.find(
        (candidate) => candidate.section === item.section,
      );

      if (previousItem === undefined || previousItem.status === item.status) {
        return null;
      }

      return {
        section: item.section,
        previousStatus: previousItem.status,
        currentStatus: item.status,
        scoreChange:
          getSectionStatusScore(item.status) - getSectionStatusScore(previousItem.status),
      };
    })
    .filter(
      (
        item,
      ): item is {
        section: SectionAuditItem["section"];
        previousStatus: SectionAuditItem["status"];
        currentStatus: SectionAuditItem["status"];
        scoreChange: number;
      } => item !== null,
    );

  if (sectionStatusChanges.length > 0) {
    const detail = sectionStatusChanges
      .slice(0, 3)
      .map(
        (item) =>
          `${item.section}: ${item.previousStatus} -> ${item.currentStatus}`,
      )
      .join("; ");
    const netChange = sectionStatusChanges.reduce(
      (total, item) => total + item.scoreChange,
      0,
    );

    deltas.push({
      title: "Section audit statuses shifted",
      detail:
        sectionStatusChanges.length > 3
          ? `${detail}; plus ${sectionStatusChanges.length - 3} more section changes.`
          : detail,
      tone: deltaToneFromChange(netChange),
    });
  }

  return deltas.length > 0
    ? deltas
    : [
      {
        title: "No material change detected",
        detail:
          "The latest run is broadly consistent with the previous cached report.",
        tone: "neutral",
      },
    ];
}

export async function analyzeCompany(query: string): Promise<AnalysisReport> {
  const waterfallResult = await runWaterfall({ query });
  const validationReport: ValidationReport =
    validateWaterfall(waterfallResult);
  const entityResolution = buildEntityResolution(query, waterfallResult);
  const confidence = computeConfidence(waterfallResult, entityResolution);
  const metrics = assembleMetrics(waterfallResult);
  const analystConsensus = extractConsensus(waterfallResult);
  const streetView = buildStreetView(waterfallResult);
  const valuationView = buildValuationView(waterfallResult);
  const peerComparison = buildPeerComparison(waterfallResult);
  const earningsHighlights = extractEarningsHighlights(waterfallResult);
  const insiderActivity = extractInsiderActivity(waterfallResult);
  const evidenceSignals = buildEvidenceSignals({
    waterfallResult,
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    peerComparison,
    insiderActivity,
  });
  const coverageGaps = buildCoverageGaps({
    waterfallResult,
    streetView,
    valuationView,
    peerComparison,
    earningsHighlights,
    insiderActivity,
  });
  const disagreementNotes = buildDisagreementNotes({
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    insiderActivity,
  });
  const newsHighlights = extractNewsHighlights(waterfallResult);
  const sectionAudit = buildSectionAudit({
    entityResolution,
    waterfallResult,
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    newsHighlights,
    coverageGaps,
    disagreementNotes,
  });
  const memoContext = {
    company: entityResolution.displayName,
    entityResolution,
    waterfallResult,
    validationReport,
    confidence,
    metrics,
    streetView,
    valuationView,
    earningsHighlights,
    newsHighlights,
    evidenceSignals,
    coverageGaps,
    disagreementNotes,
    sectionAudit,
  } as const;
  const draftResult = await runMemoAgent(memoContext);
  const challengerReport: ChallengerReport = await runChallengerAgent({
    company: entityResolution.displayName,
    draftMemo: draftResult.investmentMemo,
    waterfallResult,
    validationReport,
  });
  const finalResult = await runMemoAgent({
    ...memoContext,
    challengerReport,
  });
  const investmentMemo = finalResult.investmentMemo;
  const narrative = finalResult.narrative;
  const summary =
    investmentMemo.verdict.trim().length === 0
      ? "No analysis data available."
      : investmentMemo.verdict;

  return {
    company: entityResolution.displayName,
    entityResolution,
    summary,
    investmentMemo,
    narrative,
    sections: finalResult.sections,
    confidence,
    metrics,
    analystConsensus,
    streetView,
    valuationView,
    peerComparison,
    earningsHighlights,
    insiderActivity,
    deltas: [],
    evidenceSignals,
    coverageGaps,
    disagreementNotes,
    sectionAudit,
    validationReport,
    newsHighlights,
    sources: waterfallResult.activeSources,
    isAmbiguous: waterfallResult.finnhub?.data.isAmbiguous ?? false,
    updatedAt: new Date().toISOString(),
  };
}

export function attachReportDeltas(
  previousReport: AnalysisReport | null | undefined,
  currentReport: AnalysisReport,
): AnalysisReport {
  return {
    ...currentReport,
    deltas: compareReports(previousReport, currentReport),
  };
}
