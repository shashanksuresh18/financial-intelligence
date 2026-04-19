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
} from '@/lib/types';
import {
  hasStrongCompanyNameMatch,
  isKnownPrivateCompanyQuery,
  scoreCompanyNameMatch,
} from '@/lib/company-search';

const BASE_URL = 'https://finnhub.io/api/v1';
const NEWS_LOOKBACK_DAYS = 30;
const MAX_NEWS_ITEMS = 10;
const MAX_EARNINGS_ITEMS = 4;
const INSIDER_LOOKBACK_DAYS = 180;
const MAX_INSIDER_ITEMS = 6;
const SYMBOL_CANDIDATE_LIMIT = 4;
const LOW_CAP_FALSE_POSITIVE_THRESHOLD_USD_M = 1_000;

const PRIMARY_EXCHANGE_SUFFIXES = new Set([
  'L',
  'AS',
  'PA',
  'DE',
  'MI',
  'ST',
  'CO',
  'HE',
  'VX',
]);
const SECONDARY_EXCHANGE_SUFFIXES = new Set([
  'NS',
  'BO',
  'KS',
  'KQ',
  'AX',
  'NZ',
  'HK',
  'T',
  'TW',
  'SI',
]);
const DOWNRANKED_INSTRUMENT_SUFFIXES = new Set([
  'PR',
  'WS',
  'U',
  'W',
  'RT',
  'CL',
]);
const SYMBOL_TYPE_ALLOWLIST = new Set([
  'ADR',
  'Common Stock',
  'ETF',
  'Foreign Exchange',
]);
const COMPANY_DECORATION_TOKENS = new Set([
  'adr',
  'class',
  'common',
  'depositary',
  'ordinary',
  'plc',
  'pref',
  'preferred',
  'sponsored',
  'stock',
  'unsponsored',
]);
const LEGAL_SUFFIX_TOKENS = new Set([
  'ag',
  'bv',
  'co',
  'company',
  'corp',
  'corporation',
  'gmbh',
  'holding',
  'holdings',
  'inc',
  'incorporated',
  'limited',
  'llc',
  'llp',
  'ltd',
  'plc',
  'sa',
  'sarl',
  'spa',
  'ug',
]);
const PREMIUM_ENDPOINT_LOGS = new Set<string>();

function getApiKey(): string {
  return process.env.FINNHUB_API_KEY ?? '';
}

function buildUrl(path: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams({
    ...params,
    token: getApiKey(),
  });

  return `${BASE_URL}${path}?${searchParams.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
      error: 'Invalid JSON response from Finnhub',
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

function normalizeSearchTokens(value: string): readonly string[] {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function canonicalCompanyKey(description: string): string {
  const tokens = [...normalizeSearchTokens(description)];

  while (tokens.length > 1) {
    const trailing = tokens[tokens.length - 1] ?? '';

    if (
      LEGAL_SUFFIX_TOKENS.has(trailing) ||
      COMPANY_DECORATION_TOKENS.has(trailing)
    ) {
      tokens.pop();
      continue;
    }

    break;
  }

  return tokens.join(' ');
}

function getExchangeTier(match: FinnhubSymbolMatch): number {
  const symbol = match.symbol.toUpperCase();
  const suffixSegments = symbol.split('.').slice(1);
  const primarySuffix = suffixSegments[0] ?? null;

  if (suffixSegments.length === 0) {
    return 0;
  }

  if (
    primarySuffix !== null &&
    DOWNRANKED_INSTRUMENT_SUFFIXES.has(primarySuffix)
  ) {
    return 2;
  }

  if (
    primarySuffix !== null &&
    SECONDARY_EXCHANGE_SUFFIXES.has(primarySuffix)
  ) {
    return 1;
  }

  if (primarySuffix !== null && PRIMARY_EXCHANGE_SUFFIXES.has(primarySuffix)) {
    return 0;
  }

  if (primarySuffix !== null && /^[A-Z]{1,2}$/.test(primarySuffix)) {
    return 1;
  }

  return 1;
}

function marketCapValue(financials: FinnhubBasicFinancials | null): number {
  return financials?.metric.marketCapitalization ?? 0;
}

function effectiveMarketCapValue(
  marketCap: number,
  exchangeTier: number
): number {
  return exchangeTier === 2 ? marketCap * 0.01 : marketCap;
}

function hasAllowedSymbolType(match: FinnhubSymbolMatch): boolean {
  return SYMBOL_TYPE_ALLOWLIST.has(match.type) || match.type.includes('Stock');
}

function companyNameForMatch(match: FinnhubSymbolMatch): string {
  const description = match.description.trim();

  return description.length > 0 ? description : match.symbol;
}

function isPremiumAccessDenied(error: string): boolean {
  return error.includes('HTTP 403');
}

function logPremiumEndpointSkipOnce(
  endpoint: string,
  symbol: string,
  error: string
): void {
  const key = `${endpoint}:403`;

  if (PREMIUM_ENDPOINT_LOGS.has(key)) {
    return;
  }

  PREMIUM_ENDPOINT_LOGS.add(key);
  console.warn('[finnhub] skipping premium endpoint on current plan', {
    endpoint,
    symbol,
    error,
  });
}

async function callOptionalEndpoint<T>(
  endpoint: string,
  symbol: string,
  fn: () => Promise<ApiResult<T>>
): Promise<ApiResult<T>> {
  try {
    const result = await fn();

    if (!result.success && isPremiumAccessDenied(result.error)) {
      logPremiumEndpointSkipOnce(endpoint, symbol, result.error);
    }

    return result;
  } catch (error: unknown) {
    const message = String(error);

    if (isPremiumAccessDenied(message)) {
      logPremiumEndpointSkipOnce(endpoint, symbol, message);

      return {
        success: false,
        error: message,
      };
    }

    throw error;
  }
}

function shouldLogEndpointFailure<T>(result: ApiResult<T>): boolean {
  return result.success || !isPremiumAccessDenied(result.error);
}

type RankedSymbolCandidate = {
  readonly effectiveMarketCap: number;
  readonly exchangeTier: number;
  readonly hasStrongNameMatch: boolean;
  readonly financials: FinnhubBasicFinancials | null;
  readonly marketCap: number;
  readonly match: FinnhubSymbolMatch;
  readonly nameScore: number;
};

function compareRankedCandidates(
  left: RankedSymbolCandidate,
  right: RankedSymbolCandidate
): number {
  if (left.nameScore !== right.nameScore) {
    return right.nameScore - left.nameScore;
  }

  if (left.effectiveMarketCap !== right.effectiveMarketCap) {
    return right.effectiveMarketCap - left.effectiveMarketCap;
  }

  if (left.exchangeTier !== right.exchangeTier) {
    return left.exchangeTier - right.exchangeTier;
  }

  if (left.marketCap !== right.marketCap) {
    return right.marketCap - left.marketCap;
  }

  return left.match.symbol.localeCompare(right.match.symbol);
}

function findBestDistinctAlternative(
  ranked: readonly RankedSymbolCandidate[],
  selected: RankedSymbolCandidate
): RankedSymbolCandidate | undefined {
  const selectedKey = canonicalCompanyKey(selected.match.description);

  return ranked.find(
    (candidate) =>
      candidate.match.symbol !== selected.match.symbol &&
      canonicalCompanyKey(candidate.match.description) !== selectedKey
  );
}

function isAdr(match: FinnhubSymbolMatch): boolean {
  return match.type.trim().toLowerCase() === 'adr';
}

function isCommonStock(match: FinnhubSymbolMatch): boolean {
  return match.type.trim().toLowerCase() === 'common stock';
}

function findPromotableCommonStockAlternative(
  ranked: readonly RankedSymbolCandidate[],
  selected: RankedSymbolCandidate
): RankedSymbolCandidate | undefined {
  const primaryListingCandidate = ranked.find(
    (candidate) =>
      candidate.match.symbol !== selected.match.symbol &&
      candidate.exchangeTier === 0 &&
      isCommonStock(candidate.match) &&
      candidate.nameScore >= selected.nameScore
  );

  if (primaryListingCandidate !== undefined) {
    return primaryListingCandidate;
  }

  return ranked.find(
    (candidate) =>
      candidate.match.symbol !== selected.match.symbol &&
      candidate.exchangeTier === 1 &&
      isCommonStock(candidate.match) &&
      candidate.nameScore >= selected.nameScore
  );
}

function selectBestCandidate(
  ranked: readonly RankedSymbolCandidate[]
): RankedSymbolCandidate {
  const initial = ranked[0]!;
  const higherQualityInstrument = ranked.find(
    (candidate) =>
      candidate.match.symbol !== initial.match.symbol &&
      candidate.exchangeTier < 2 &&
      candidate.nameScore >= initial.nameScore
  );

  if (initial.exchangeTier === 2 && higherQualityInstrument !== undefined) {
    return higherQualityInstrument;
  }

  if (isAdr(initial.match)) {
    const promotedCommonStock = findPromotableCommonStockAlternative(
      ranked,
      initial
    );

    if (promotedCommonStock !== undefined) {
      return promotedCommonStock;
    }
  }

  return initial;
}

function isAmbiguousSelection(
  ranked: readonly RankedSymbolCandidate[],
  selected: RankedSymbolCandidate
): boolean {
  const strongestAlternative = findBestDistinctAlternative(ranked, selected);

  return (
    strongestAlternative !== undefined &&
    strongestAlternative.nameScore >= selected.nameScore &&
    selected.marketCap > 0 &&
    strongestAlternative.marketCap > 0 &&
    (strongestAlternative.marketCap / selected.marketCap >= 0.5 ||
      (selected.marketCap > 10000 && strongestAlternative.marketCap > 10000))
  );
}

function isLikelyPrivateFalsePositiveCandidate(
  query: string,
  candidate: RankedSymbolCandidate
): boolean {
  return (
    isKnownPrivateCompanyQuery(query) &&
    !candidate.hasStrongNameMatch &&
    candidate.exchangeTier > 0 &&
    candidate.marketCap < LOW_CAP_FALSE_POSITIVE_THRESHOLD_USD_M
  );
}

function isValidQuote(quote: FinnhubQuote): boolean {
  return quote.t !== 0;
}

function normalizeBasicFinancials(
  data: unknown
): FinnhubBasicFinancials | null {
  if (!isRecord(data) || !isRecord(data['metric'])) {
    return null;
  }

  const rawMetric = data['metric'];
  const metric: FinnhubBasicFinancialMetricSet = {
    '52WeekHigh': normalizeNumber(rawMetric['52WeekHigh']),
    '52WeekLow': normalizeNumber(rawMetric['52WeekLow']),
    marketCapitalization: normalizeNumber(rawMetric['marketCapitalization']),
    peBasicExclExtraTTM: normalizeNumber(rawMetric['peBasicExclExtraTTM']),
    peTTM: normalizeNumber(rawMetric['peTTM']),
    pbAnnual: normalizeNumber(rawMetric['pbAnnual']),
    psTTM: normalizeNumber(rawMetric['psTTM']),
    ev: normalizeNumber(rawMetric['ev']),
    evEbitdaTTM: normalizeNumber(rawMetric['evEbitdaTTM']),
    netMarginTTM: normalizeNumber(rawMetric['netMarginTTM']),
    netMarginAnnual: normalizeNumber(rawMetric['netMarginAnnual']),
    operatingMarginTTM: normalizeNumber(rawMetric['operatingMarginTTM']),
    operatingMarginAnnual: normalizeNumber(rawMetric['operatingMarginAnnual']),
    roeTTM: normalizeNumber(rawMetric['roeTTM']),
    roaTTM: normalizeNumber(rawMetric['roaTTM']),
    revenueGrowthTTMYoy: normalizeNumber(rawMetric['revenueGrowthTTMYoy']),
    epsGrowthTTMYoy: normalizeNumber(rawMetric['epsGrowthTTMYoy']),
  };

  const hasAnyValue = Object.values(metric).some(
    (value) => value !== null && value !== undefined
  );

  return hasAnyValue ? { metric } : null;
}

function normalizePriceTarget(data: unknown): FinnhubPriceTarget | null {
  if (!isRecord(data)) {
    return null;
  }

  const priceTarget: FinnhubPriceTarget = {
    targetHigh: normalizeNumber(data['targetHigh']),
    targetLow: normalizeNumber(data['targetLow']),
    targetMean: normalizeNumber(data['targetMean']),
    targetMedian: normalizeNumber(data['targetMedian']),
    lastUpdated:
      typeof data['lastUpdated'] === 'string' &&
      data['lastUpdated'].trim().length > 0
        ? data['lastUpdated']
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
  if (error.includes('HTTP 403')) {
    return 'Unavailable on the current Finnhub plan.';
  }

  if (error.includes('HTTP 401')) {
    return 'Target-price endpoint authorization failed.';
  }

  if (error.includes('Unexpected Finnhub /stock/price-target response shape')) {
    return 'Target-price endpoint returned no usable coverage for this symbol.';
  }

  return undefined;
}

function normalizeEarningsEvents(
  data: unknown
): readonly FinnhubEarningsEvent[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const events: FinnhubEarningsEvent[] = [];

  for (const item of data) {
    if (!isRecord(item) || typeof item['period'] !== 'string') {
      continue;
    }

    events.push({
      actual: normalizeNumber(item['actual']),
      estimate: normalizeNumber(item['estimate']),
      period: item['period'],
      quarter: normalizeNumber(item['quarter']) ?? undefined,
      year: normalizeNumber(item['year']) ?? undefined,
      surprise: normalizeNumber(item['surprise']),
      surprisePercent: normalizeNumber(item['surprisePercent']),
    });
  }

  return events
    .sort((left, right) => right.period.localeCompare(left.period))
    .slice(0, MAX_EARNINGS_ITEMS);
}

function normalizeInsiderTransactions(
  data: unknown
): readonly FinnhubInsiderTransaction[] {
  const rows = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data['data'])
      ? data['data']
      : [];

  const transactions: FinnhubInsiderTransaction[] = [];

  for (const item of rows) {
    if (!isRecord(item)) {
      continue;
    }

    const transactionDate =
      typeof item['transactionDate'] === 'string'
        ? item['transactionDate']
        : typeof item['filingDate'] === 'string'
          ? item['filingDate']
          : null;

    if (transactionDate === null) {
      continue;
    }

    transactions.push({
      name:
        typeof item['name'] === 'string' && item['name'].trim().length > 0
          ? item['name']
          : 'Insider',
      share: normalizeNumber(item['share']),
      change: normalizeNumber(item['change']),
      filingDate:
        typeof item['filingDate'] === 'string' ? item['filingDate'] : undefined,
      transactionDate,
      transactionCode:
        typeof item['transactionCode'] === 'string' &&
        item['transactionCode'].trim().length > 0
          ? item['transactionCode']
          : 'N/A',
      transactionPrice: normalizeNumber(item['transactionPrice']),
    });
  }

  return transactions
    .sort((left, right) =>
      right.transactionDate.localeCompare(left.transactionDate)
    )
    .slice(0, MAX_INSIDER_ITEMS);
}

function symbolToSearchResult(match: FinnhubSymbolMatch): SearchResult {
  return {
    id: `finnhub:${match.symbol}`,
    name: match.description || match.symbol,
    ticker: match.symbol,
    jurisdiction: 'US',
    description: match.type,
  };
}

export async function searchSymbols(
  query: string
): Promise<ApiResult<FinnhubSymbolSearchResponse>> {
  const url = buildUrl('/search', { q: query });
  const result = await fetchJson<FinnhubSymbolSearchResponse>(url);

  if (!result.success) {
    return result;
  }

  if (
    typeof result.data.count !== 'number' ||
    !Array.isArray(result.data.result)
  ) {
    return {
      success: false,
      error: 'Unexpected Finnhub /search response shape',
    };
  }

  return result;
}

export async function getQuote(
  symbol: string
): Promise<ApiResult<FinnhubQuote>> {
  const url = buildUrl('/quote', { symbol });
  const result = await fetchJson<FinnhubQuote>(url);

  if (!result.success) {
    return result;
  }

  if (typeof result.data.t !== 'number') {
    return {
      success: false,
      error: 'Unexpected Finnhub /quote response shape',
    };
  }

  return result;
}

export async function getRecommendations(
  symbol: string
): Promise<ApiResult<readonly FinnhubRecommendation[]>> {
  const url = buildUrl('/stock/recommendation', { symbol });
  const result = await fetchJson<readonly FinnhubRecommendation[]>(url);

  if (!result.success) {
    return result;
  }

  if (!Array.isArray(result.data)) {
    return {
      success: false,
      error: 'Unexpected Finnhub /stock/recommendation response shape',
    };
  }

  return result;
}

export async function getNews(
  symbol: string,
  lookbackDays: number = NEWS_LOOKBACK_DAYS
): Promise<ApiResult<readonly FinnhubNewsItem[]>> {
  const { from, to } = newsDateRange(lookbackDays);
  const url = buildUrl('/company-news', { symbol, from, to });
  const result = await fetchJson<readonly FinnhubNewsItem[]>(url);

  if (!result.success) {
    return result;
  }

  if (!Array.isArray(result.data)) {
    return {
      success: false,
      error: 'Unexpected Finnhub /company-news response shape',
    };
  }

  return {
    success: true,
    data: result.data.slice(0, MAX_NEWS_ITEMS),
  };
}

export async function getBasicFinancials(
  symbol: string
): Promise<ApiResult<FinnhubBasicFinancials>> {
  const url = buildUrl('/stock/metric', { symbol, metric: 'all' });
  const result = await fetchJson<unknown>(url);

  if (!result.success) {
    return result;
  }

  const normalized = normalizeBasicFinancials(result.data);

  if (normalized === null) {
    return {
      success: false,
      error: 'Unexpected Finnhub /stock/metric response shape',
    };
  }

  return { success: true, data: normalized };
}

export async function getPriceTarget(
  symbol: string
): Promise<ApiResult<FinnhubPriceTarget>> {
  const url = buildUrl('/stock/price-target', { symbol });
  const result = await fetchJson<unknown>(url);

  if (!result.success) {
    return result;
  }

  const normalized = normalizePriceTarget(result.data);

  if (normalized === null) {
    return {
      success: false,
      error: 'Unexpected Finnhub /stock/price-target response shape',
    };
  }

  return { success: true, data: normalized };
}

export async function getEarnings(
  symbol: string
): Promise<ApiResult<readonly FinnhubEarningsEvent[]>> {
  const url = buildUrl('/stock/earnings', { symbol });
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
  lookbackDays: number = INSIDER_LOOKBACK_DAYS
): Promise<ApiResult<readonly FinnhubInsiderTransaction[]>> {
  const { from, to } = activityDateRange(lookbackDays);
  const url = buildUrl('/stock/insider-transactions', { symbol, from, to });
  const result = await fetchJson<unknown>(url);

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    data: normalizeInsiderTransactions(result.data),
  };
}

type SymbolResolution = {
  readonly symbol: FinnhubSymbolMatch | null;
  readonly isAmbiguous: boolean;
  readonly alternatives: readonly FinnhubSymbolMatch[];
  readonly preloadedFinancials: FinnhubBasicFinancials | null;
};

export async function resolveFinnhubSymbol(
  matches: readonly FinnhubSymbolMatch[],
  query: string,
  loadFinancials: (
    symbol: string
  ) => Promise<ApiResult<FinnhubBasicFinancials>> = getBasicFinancials
): Promise<SymbolResolution> {
  if (matches.length === 0) {
    return {
      symbol: null,
      isAmbiguous: false,
      alternatives: [],
      preloadedFinancials: null,
    };
  }

  const typedCandidates = matches.filter((match) =>
    hasAllowedSymbolType(match)
  );
  const candidatePool = typedCandidates.length > 0 ? typedCandidates : matches;
  const topCandidates = [...candidatePool]
    .sort((left, right) => {
      const leftScore = scoreCompanyNameMatch(query, companyNameForMatch(left));
      const rightScore = scoreCompanyNameMatch(
        query,
        companyNameForMatch(right)
      );

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return left.symbol.localeCompare(right.symbol);
    })
    .slice(0, SYMBOL_CANDIDATE_LIMIT);

  const rankedCandidates = await Promise.all(
    topCandidates.map(async (match) => {
      const financialResult = await loadFinancials(match.symbol);
      const financials = financialResult.success ? financialResult.data : null;
      const marketCap = marketCapValue(financials);
      const exchangeTier = getExchangeTier(match);
      const nameScore = scoreCompanyNameMatch(
        query,
        companyNameForMatch(match)
      );

      return {
        effectiveMarketCap: effectiveMarketCapValue(marketCap, exchangeTier),
        exchangeTier,
        hasStrongNameMatch: hasStrongCompanyNameMatch(
          query,
          companyNameForMatch(match)
        ),
        financials,
        match,
        marketCap,
        nameScore,
      };
    })
  );

  rankedCandidates.sort(compareRankedCandidates);
  const strongNameCandidates = rankedCandidates.filter(
    (candidate) => candidate.hasStrongNameMatch
  );
  const candidatesToSelectFrom =
    strongNameCandidates.length > 0 ? strongNameCandidates : rankedCandidates;
  const best = selectBestCandidate(candidatesToSelectFrom);

  if (isLikelyPrivateFalsePositiveCandidate(query, best)) {
    console.info('[finnhub] rejecting likely private-company false positive', {
      query,
      symbol: best.match.symbol,
      companyName: companyNameForMatch(best.match),
      marketCap: best.marketCap,
    });

    return {
      symbol: null,
      isAmbiguous: false,
      alternatives: [],
      preloadedFinancials: null,
    };
  }

  const orderedCandidates = [
    best,
    ...candidatesToSelectFrom.filter(
      (candidate) => candidate.match.symbol !== best.match.symbol
    ),
  ];
  const isAmbiguous = isAmbiguousSelection(orderedCandidates, best);

  return {
    symbol: best.match,
    isAmbiguous,
    alternatives: orderedCandidates
      .slice(1)
      .map((candidate) => candidate.match),
    preloadedFinancials: best.financials,
  };
}

export async function fetchFinnhubData(
  query: string
): Promise<ApiResult<FinnhubData>> {
  const symbolResult = await searchSymbols(query);

  if (!symbolResult.success) {
    console.error('[finnhub] searchSymbols failed', {
      query,
      error: symbolResult.error,
    });

    return symbolResult;
  }

  const resolution = await resolveFinnhubSymbol(
    symbolResult.data.result,
    query
  );
  const symbol = resolution.symbol;

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
    resolution.preloadedFinancials
      ? Promise.resolve({
          success: true as const,
          data: resolution.preloadedFinancials,
        })
      : getBasicFinancials(symbol.symbol),
    callOptionalEndpoint('/stock/price-target', symbol.symbol, () =>
      getPriceTarget(symbol.symbol)
    ),
    callOptionalEndpoint('/stock/earnings', symbol.symbol, () =>
      getEarnings(symbol.symbol)
    ),
    callOptionalEndpoint('/stock/insider-transactions', symbol.symbol, () =>
      getInsiderTransactions(symbol.symbol)
    ),
  ]);

  if (!quoteResult.success) {
    console.error('[finnhub] getQuote failed', {
      symbol: symbol.symbol,
      error: quoteResult.error,
    });
  }

  if (!recommendationsResult.success) {
    console.error('[finnhub] getRecommendations failed', {
      symbol: symbol.symbol,
      error: recommendationsResult.error,
    });
  }

  if (!newsResult.success) {
    console.error('[finnhub] getNews failed', {
      symbol: symbol.symbol,
      error: newsResult.error,
    });
  }

  if (!basicFinancialsResult.success) {
    console.error('[finnhub] getBasicFinancials failed', {
      symbol: symbol.symbol,
      error: basicFinancialsResult.error,
    });
  }

  if (
    !priceTargetResult.success &&
    shouldLogEndpointFailure(priceTargetResult)
  ) {
    console.error('[finnhub] getPriceTarget failed', {
      symbol: symbol.symbol,
      error: priceTargetResult.error,
    });
  }

  if (!earningsResult.success && shouldLogEndpointFailure(earningsResult)) {
    console.error('[finnhub] getEarnings failed', {
      symbol: symbol.symbol,
      error: earningsResult.error,
    });
  }

  if (
    !insiderTransactionsResult.success &&
    shouldLogEndpointFailure(insiderTransactionsResult)
  ) {
    console.error('[finnhub] getInsiderTransactions failed', {
      symbol: symbol.symbol,
      error: insiderTransactionsResult.error,
    });
  }

  return {
    success: true,
    data: {
      symbol: symbol.symbol,
      symbolType: symbol.type,
      companyName:
        typeof symbol.description === 'string' &&
        symbol.description.trim().length > 0
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
      isAmbiguous: resolution.isAmbiguous,
      alternatives: resolution.alternatives,
    },
  };
}

export function toSearchResults(
  matches: readonly FinnhubSymbolMatch[]
): readonly SearchResult[] {
  return matches.map(symbolToSearchResult);
}
