import type {
  AnalysisReport,
  AnalystConsensusEntry,
  DataSource,
  DataSourceResult,
  FinancialMetric,
  FinnhubRecommendation,
  WaterfallInput,
  WaterfallResult,
} from "@/lib/types";
import { fetchClaudeFallbackData } from "@/lib/datasources/claude-fallback";
import { fetchCompaniesHouseData } from "@/lib/datasources/companies-house";
import { fetchFinnhubData } from "@/lib/datasources/finnhub";
import { fetchGleifData } from "@/lib/datasources/gleif";
import {
  extractLatestFact,
  fetchSecEdgarData,
  NET_INCOME_CONCEPTS,
  REVENUE_CONCEPTS,
} from "@/lib/datasources/sec-edgar";
import { generateNarrative } from "@/lib/claude-narrative";
import { computeConfidence } from "@/lib/confidence";

function wrapSource<T>(
  source: DataSource,
  result:
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: string },
): DataSourceResult<T> | null {
  if (!result.success) {
    return null;
  }

  return {
    source,
    data: result.data,
    fetchedAt: new Date().toISOString(),
  };
}

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

  const quote = result.finnhub.data.quote;

  if (quote === null || quote.t === 0) {
    return [];
  }

  return [
    {
      label: "Current Price",
      value: quote.c,
      source: "finnhub",
    },
    {
      label: "Day High",
      value: quote.h,
      source: "finnhub",
    },
    {
      label: "Day Low",
      value: quote.l,
      source: "finnhub",
    },
  ];
}

function assembleMetrics(result: WaterfallResult): readonly FinancialMetric[] {
  return [
    ...extractXbrlMetrics(result),
    ...extractFinnhubMetrics(result),
    ...(result.claudeFallback !== null
      ? result.claudeFallback.data.extractedMetrics
      : []),
  ];
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

  const latest: FinnhubRecommendation | undefined = [...recommendations].sort(
    (left, right) => right.period.localeCompare(left.period),
  )[0];

  if (latest === undefined) {
    return [];
  }

  const totalBullish = latest.buy + latest.strongBuy;
  const totalBearish = latest.sell + latest.strongSell;
  const totalNeutral = latest.hold;
  const rating =
    totalBullish >= totalBearish && totalBullish >= totalNeutral
      ? "Buy"
      : totalBearish > totalBullish && totalBearish >= totalNeutral
        ? "Sell"
        : "Hold";

  return [
    {
      firm: "Wall Street Consensus",
      rating,
      targetPrice: null,
    },
  ];
}

function buildActiveSources(result: WaterfallResult): readonly DataSource[] {
  return [
    ...(result.finnhub !== null ? (["finnhub"] as const) : []),
    ...(result.secEdgar !== null ? (["sec-edgar"] as const) : []),
    ...(result.companiesHouse !== null ? (["companies-house"] as const) : []),
    ...(result.gleif !== null ? (["gleif"] as const) : []),
    ...(result.claudeFallback !== null ? (["claude-fallback"] as const) : []),
  ];
}

export async function runWaterfall(
  input: WaterfallInput,
): Promise<WaterfallResult> {
  const [finnhubResult, edgarResult, chResult, gleifResult] = await Promise.all([
    fetchFinnhubData(input.query),
    fetchSecEdgarData(input.query),
    fetchCompaniesHouseData(input.query),
    fetchGleifData(input.query),
  ]);

  const finnhub = wrapSource("finnhub", finnhubResult);
  const secEdgar = wrapSource("sec-edgar", edgarResult);
  const companiesHouse = wrapSource("companies-house", chResult);
  const gleif = wrapSource("gleif", gleifResult);

  const anyData =
    finnhub !== null ||
    secEdgar !== null ||
    companiesHouse !== null ||
    gleif !== null;

  let claudeFallback: DataSourceResult<{
    readonly narrative: string;
    readonly extractedMetrics: readonly FinancialMetric[];
    readonly disclaimer: string;
  }> | null = null;

  if (!anyData) {
    console.error("[analyzer] all sources failed, running Claude fallback", {
      query: input.query,
    });

    const fallbackResult = await fetchClaudeFallbackData(input.query);

    claudeFallback = wrapSource("claude-fallback", fallbackResult);
  }

  const baseResult: WaterfallResult = {
    query: input.query,
    finnhub,
    secEdgar,
    companiesHouse,
    gleif,
    claudeFallback,
    activeSources: [],
  };

  return {
    ...baseResult,
    activeSources: buildActiveSources(baseResult),
  };
}

export async function analyzeCompany(query: string): Promise<AnalysisReport> {
  const waterfallResult = await runWaterfall({ query });
  const confidence = computeConfidence(waterfallResult);
  const metrics = assembleMetrics(waterfallResult);
  const analystConsensus = extractConsensus(waterfallResult);
  const narrative = await generateNarrative({
    company: query,
    waterfallResult,
    confidence,
  });
  const summary =
    narrative.trim().length === 0
      ? "No analysis data available."
      : narrative
          .slice(
            0,
            Math.min(
              narrative.indexOf(".") >= 0 ? narrative.indexOf(".") + 1 : 120,
              120,
            ),
          )
          .trim();

  return {
    company: query,
    summary,
    narrative,
    confidence,
    metrics,
    analystConsensus,
    sources: waterfallResult.activeSources,
    updatedAt: new Date().toISOString(),
  };
}
