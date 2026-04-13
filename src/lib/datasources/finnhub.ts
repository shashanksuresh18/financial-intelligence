import type {
  ApiResult,
  FinnhubBasicFinancialMetricSet,
  FinnhubBasicFinancials,
  FinnhubData,
  FinnhubEarningsEvent,
  FinnhubInsiderTransaction,
  FinnhubNewsItem,
  FinnhubPriceTarget,
  FinnhubQuote,
  FinnhubRecommendation,
  FinnhubSymbolMatch,
  FinnhubSymbolSearchResponse,
  SearchResult,
} from "@/lib/types";

const BASE_URL = "https://finnhub.io/api/v1";
const NEWS_LOOKBACK_DAYS = 30;
const MAX_NEWS_ITEMS = 10;
const MAX_EARNINGS_ITEMS = 4;
const INSIDER_LOOKBACK_DAYS = 180;
const MAX_INSIDER_ITEMS = 6;

function getApiKey(): string {
  return process.env.FINNHUB_API_KEY ?? "";
}

function buildUrl(path: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams({
    ...params,
    token: getApiKey(),
  });

  return `${BASE_URL}${path}?${searchParams.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchJson<T>(url: string): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url);
  } catch (error: unknown) {
    return {
      success: false,
      error: `Network error: ${String(error)}`,
    };
  }

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  try {
    const data: unknown = await response.json();

    return {
      success: true,
      data: data as T,
    };
  } catch {
    return {
      success: false,
      error: "Invalid JSON response from Finnhub",
    };
  }
}

function newsDateRange(lookbackDays: number): {
  from: string;
  to: string;
} {
  const today = new Date();
  const fromDate = new Date(today);

  fromDate.setDate(today.getDate() - lookbackDays);

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function activityDateRange(lookbackDays: number): {
  from: string;
  to: string;
} {
  return newsDateRange(lookbackDays);
}

function pickBestSymbol(
  matches: readonly FinnhubSymbolMatch[],
): FinnhubSymbolMatch | null {
  const commonStockMatch = matches.find((match) => match.type === "Common Stock");

  if (commonStockMatch) {
    return commonStockMatch;
  }

  const adrMatch = matches.find((match) => match.type === "ADR");

  if (adrMatch) {
    return adrMatch;
  }

  return matches[0] ?? null;
}

function isValidQuote(quote: FinnhubQuote): boolean {
  return quote.t !== 0;
}

function normalizeBasicFinancials(
  data: unknown,
): FinnhubBasicFinancials | null {
  if (!isRecord(data) || !isRecord(data["metric"])) {
    return null;
  }

  const rawMetric = data["metric"];
  const metric: FinnhubBasicFinancialMetricSet = {
    "52WeekHigh": normalizeNumber(rawMetric["52WeekHigh"]),
    "52WeekLow": normalizeNumber(rawMetric["52WeekLow"]),
    marketCapitalization: normalizeNumber(rawMetric["marketCapitalization"]),
    peBasicExclExtraTTM: normalizeNumber(rawMetric["peBasicExclExtraTTM"]),
    peTTM: normalizeNumber(rawMetric["peTTM"]),
    pbAnnual: normalizeNumber(rawMetric["pbAnnual"]),
    psTTM: normalizeNumber(rawMetric["psTTM"]),
    ev: normalizeNumber(rawMetric["ev"]),
    evEbitdaTTM: normalizeNumber(rawMetric["evEbitdaTTM"]),
    netMarginTTM: normalizeNumber(rawMetric["netMarginTTM"]),
    netMarginAnnual: normalizeNumber(rawMetric["netMarginAnnual"]),
    operatingMarginTTM: normalizeNumber(rawMetric["operatingMarginTTM"]),
    operatingMarginAnnual: normalizeNumber(rawMetric["operatingMarginAnnual"]),
    roeTTM: normalizeNumber(rawMetric["roeTTM"]),
    roaTTM: normalizeNumber(rawMetric["roaTTM"]),
    revenueGrowthTTMYoy: normalizeNumber(rawMetric["revenueGrowthTTMYoy"]),
    epsGrowthTTMYoy: normalizeNumber(rawMetric["epsGrowthTTMYoy"]),
  };

  const hasAnyValue = Object.values(metric).some(
    (value) => value !== null && value !== undefined,
  );

  return hasAnyValue ? { metric } : null;
}

function normalizePriceTarget(data: unknown): FinnhubPriceTarget | null {
  if (!isRecord(data)) {
    return null;
  }

  const priceTarget: FinnhubPriceTarget = {
    targetHigh: normalizeNumber(data["targetHigh"]),
    targetLow: normalizeNumber(data["targetLow"]),
    targetMean: normalizeNumber(data["targetMean"]),
    targetMedian: normalizeNumber(data["targetMedian"]),
    lastUpdated:
      typeof data["lastUpdated"] === "string" && data["lastUpdated"].trim().length > 0
        ? data["lastUpdated"]
        : undefined,
  };

  const hasAnyValue =
    priceTarget.targetHigh !== null ||
    priceTarget.targetLow !== null ||
    priceTarget.targetMean !== null ||
    priceTarget.targetMedian !== null;

  return hasAnyValue ? priceTarget : null;
}

function summarizePriceTargetAvailability(error: string): string | undefined {
  if (error.includes("HTTP 403")) {
    return "Unavailable on the current Finnhub plan.";
  }

  if (error.includes("HTTP 401")) {
    return "Target-price endpoint authorization failed.";
  }

  if (error.includes("Unexpected Finnhub /stock/price-target response shape")) {
    return "Target-price endpoint returned no usable coverage for this symbol.";
  }

  return undefined;
}

function normalizeEarningsEvents(
  data: unknown,
): readonly FinnhubEarningsEvent[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const events: FinnhubEarningsEvent[] = [];

  for (const item of data) {
    if (!isRecord(item) || typeof item["period"] !== "string") {
      continue;
    }

    events.push({
      actual: normalizeNumber(item["actual"]),
      estimate: normalizeNumber(item["estimate"]),
      period: item["period"],
      quarter: normalizeNumber(item["quarter"]) ?? undefined,
      year: normalizeNumber(item["year"]) ?? undefined,
      surprise: normalizeNumber(item["surprise"]),
      surprisePercent: normalizeNumber(item["surprisePercent"]),
    });
  }

  return events
    .sort((left, right) => right.period.localeCompare(left.period))
    .slice(0, MAX_EARNINGS_ITEMS);
}

function normalizeInsiderTransactions(
  data: unknown,
): readonly FinnhubInsiderTransaction[] {
  const rows = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data["data"])
      ? data["data"]
      : [];

  const transactions: FinnhubInsiderTransaction[] = [];

  for (const item of rows) {
    if (!isRecord(item)) {
      continue;
    }

    const transactionDate =
      typeof item["transactionDate"] === "string"
        ? item["transactionDate"]
        : typeof item["filingDate"] === "string"
          ? item["filingDate"]
          : null;

    if (transactionDate === null) {
      continue;
    }

    transactions.push({
      name:
        typeof item["name"] === "string" && item["name"].trim().length > 0
          ? item["name"]
          : "Insider",
      share: normalizeNumber(item["share"]),
      change: normalizeNumber(item["change"]),
      filingDate:
        typeof item["filingDate"] === "string" ? item["filingDate"] : undefined,
      transactionDate,
      transactionCode:
        typeof item["transactionCode"] === "string" &&
        item["transactionCode"].trim().length > 0
          ? item["transactionCode"]
          : "N/A",
      transactionPrice: normalizeNumber(item["transactionPrice"]),
    });
  }

  return transactions
    .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate))
    .slice(0, MAX_INSIDER_ITEMS);
}

function symbolToSearchResult(match: FinnhubSymbolMatch): SearchResult {
  return {
    id: `finnhub:${match.symbol}`,
    name: match.description || match.symbol,
    ticker: match.symbol,
    jurisdiction: "US",
    description: match.type,
  };
}

export async function searchSymbols(
  query: string,
): Promise<ApiResult<FinnhubSymbolSearchResponse>> {
  const url = buildUrl("/search", { q: query });
  const result = await fetchJson<FinnhubSymbolSearchResponse>(url);

  if (!result.success) {
    return result;
  }

  if (
    typeof result.data.count !== "number" ||
    !Array.isArray(result.data.result)
  ) {
    return {
      success: false,
      error: "Unexpected Finnhub /search response shape",
    };
  }

  return result;
}

export async function getQuote(
  symbol: string,
): Promise<ApiResult<FinnhubQuote>> {
  const url = buildUrl("/quote", { symbol });
  const result = await fetchJson<FinnhubQuote>(url);

  if (!result.success) {
    return result;
  }

  if (typeof result.data.t !== "number") {
    return {
      success: false,
      error: "Unexpected Finnhub /quote response shape",
    };
  }

  return result;
}

export async function getRecommendations(
  symbol: string,
): Promise<ApiResult<readonly FinnhubRecommendation[]>> {
  const url = buildUrl("/stock/recommendation", { symbol });
  const result = await fetchJson<readonly FinnhubRecommendation[]>(url);

  if (!result.success) {
    return result;
  }

  if (!Array.isArray(result.data)) {
    return {
      success: false,
      error: "Unexpected Finnhub /stock/recommendation response shape",
    };
  }

  return result;
}

export async function getNews(
  symbol: string,
  lookbackDays: number = NEWS_LOOKBACK_DAYS,
): Promise<ApiResult<readonly FinnhubNewsItem[]>> {
  const { from, to } = newsDateRange(lookbackDays);
  const url = buildUrl("/company-news", { symbol, from, to });
  const result = await fetchJson<readonly FinnhubNewsItem[]>(url);

  if (!result.success) {
    return result;
  }

  if (!Array.isArray(result.data)) {
    return {
      success: false,
      error: "Unexpected Finnhub /company-news response shape",
    };
  }

  return {
    success: true,
    data: result.data.slice(0, MAX_NEWS_ITEMS),
  };
}

export async function getBasicFinancials(
  symbol: string,
): Promise<ApiResult<FinnhubBasicFinancials>> {
  const url = buildUrl("/stock/metric", { symbol, metric: "all" });
  const result = await fetchJson<unknown>(url);

  if (!result.success) {
    return result;
  }

  const normalized = normalizeBasicFinancials(result.data);

  if (normalized === null) {
    return {
      success: false,
      error: "Unexpected Finnhub /stock/metric response shape",
    };
  }

  return { success: true, data: normalized };
}

export async function getPriceTarget(
  symbol: string,
): Promise<ApiResult<FinnhubPriceTarget>> {
  const url = buildUrl("/stock/price-target", { symbol });
  const result = await fetchJson<unknown>(url);

  if (!result.success) {
    return result;
  }

  const normalized = normalizePriceTarget(result.data);

  if (normalized === null) {
    return {
      success: false,
      error: "Unexpected Finnhub /stock/price-target response shape",
    };
  }

  return { success: true, data: normalized };
}

export async function getEarnings(
  symbol: string,
): Promise<ApiResult<readonly FinnhubEarningsEvent[]>> {
  const url = buildUrl("/stock/earnings", { symbol });
  const result = await fetchJson<unknown>(url);

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    data: normalizeEarningsEvents(result.data),
  };
}

export async function getInsiderTransactions(
  symbol: string,
  lookbackDays: number = INSIDER_LOOKBACK_DAYS,
): Promise<ApiResult<readonly FinnhubInsiderTransaction[]>> {
  const { from, to } = activityDateRange(lookbackDays);
  const url = buildUrl("/stock/insider-transactions", { symbol, from, to });
  const result = await fetchJson<unknown>(url);

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    data: normalizeInsiderTransactions(result.data),
  };
}

export async function fetchFinnhubData(
  query: string,
): Promise<ApiResult<FinnhubData>> {
  const symbolResult = await searchSymbols(query);

  if (!symbolResult.success) {
    console.error("[finnhub] searchSymbols failed", {
      query,
      error: symbolResult.error,
    });

    return symbolResult;
  }

  const symbol = pickBestSymbol(symbolResult.data.result);

  if (!symbol) {
    return {
      success: false,
      error: `No Finnhub symbol found for: "${query}"`,
    };
  }

  const [
    quoteResult,
    recommendationsResult,
    newsResult,
    basicFinancialsResult,
    priceTargetResult,
    earningsResult,
    insiderTransactionsResult,
  ] = await Promise.all([
    getQuote(symbol.symbol),
    getRecommendations(symbol.symbol),
    getNews(symbol.symbol),
    getBasicFinancials(symbol.symbol),
    getPriceTarget(symbol.symbol),
    getEarnings(symbol.symbol),
    getInsiderTransactions(symbol.symbol),
  ]);

  if (!quoteResult.success) {
    console.error("[finnhub] getQuote failed", {
      symbol: symbol.symbol,
      error: quoteResult.error,
    });
  }

  if (!recommendationsResult.success) {
    console.error("[finnhub] getRecommendations failed", {
      symbol: symbol.symbol,
      error: recommendationsResult.error,
    });
  }

  if (!newsResult.success) {
    console.error("[finnhub] getNews failed", {
      symbol: symbol.symbol,
      error: newsResult.error,
    });
  }

  if (!basicFinancialsResult.success) {
    console.error("[finnhub] getBasicFinancials failed", {
      symbol: symbol.symbol,
      error: basicFinancialsResult.error,
    });
  }

  if (!priceTargetResult.success) {
    console.error("[finnhub] getPriceTarget failed", {
      symbol: symbol.symbol,
      error: priceTargetResult.error,
    });
  }

  if (!earningsResult.success) {
    console.error("[finnhub] getEarnings failed", {
      symbol: symbol.symbol,
      error: earningsResult.error,
    });
  }

  if (!insiderTransactionsResult.success) {
    console.error("[finnhub] getInsiderTransactions failed", {
      symbol: symbol.symbol,
      error: insiderTransactionsResult.error,
    });
  }

  return {
    success: true,
    data: {
      symbol: symbol.symbol,
      companyName:
        typeof symbol.description === "string" && symbol.description.trim().length > 0
          ? symbol.description.trim()
          : null,
      quote:
        quoteResult.success && isValidQuote(quoteResult.data)
          ? quoteResult.data
          : null,
      recommendations: recommendationsResult.success
        ? recommendationsResult.data
        : [],
      news: newsResult.success ? newsResult.data : [],
      basicFinancials: basicFinancialsResult.success
        ? basicFinancialsResult.data
        : null,
      priceTarget: priceTargetResult.success ? priceTargetResult.data : null,
      priceTargetNote: priceTargetResult.success
        ? undefined
        : summarizePriceTargetAvailability(priceTargetResult.error),
      earnings: earningsResult.success ? earningsResult.data : [],
      insiderTransactions: insiderTransactionsResult.success
        ? insiderTransactionsResult.data
        : [],
    },
  };
}

export function toSearchResults(
  matches: readonly FinnhubSymbolMatch[],
): readonly SearchResult[] {
  return matches.map(symbolToSearchResult);
}
