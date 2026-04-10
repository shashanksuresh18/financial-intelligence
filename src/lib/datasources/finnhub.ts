import type {
  ApiResult,
  FinnhubData,
  FinnhubNewsItem,
  FinnhubQuote,
  FinnhubRecommendation,
  FinnhubSymbolMatch,
  FinnhubSymbolSearchResponse,
  SearchResult,
} from "@/lib/types";

const BASE_URL = "https://finnhub.io/api/v1";
const NEWS_LOOKBACK_DAYS = 30;
const MAX_NEWS_ITEMS = 10;

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

  const [quoteResult, recommendationsResult, newsResult] = await Promise.all([
    getQuote(symbol.symbol),
    getRecommendations(symbol.symbol),
    getNews(symbol.symbol),
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

  return {
    success: true,
    data: {
      symbol: symbol.symbol,
      quote:
        quoteResult.success && isValidQuote(quoteResult.data)
          ? quoteResult.data
          : null,
      recommendations: recommendationsResult.success
        ? recommendationsResult.data
        : [],
      news: newsResult.success ? newsResult.data : [],
    },
  };
}

export function toSearchResults(
  matches: readonly FinnhubSymbolMatch[],
): readonly SearchResult[] {
  return matches.map(symbolToSearchResult);
}
