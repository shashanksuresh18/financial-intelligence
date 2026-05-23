import type {
  ApiResult,
  FmpAnalystEstimate,
  FmpData,
  FmpEnterpriseValue,
  FmpHistoricalMultiple,
  FmpPeerProfile,
  FmpPriceTargetConsensus,
} from '@/lib/types';
import {
  hasStrongCompanyNameMatch,
  isKnownPrivateCompanyQuery,
  scoreCompanyNameMatch,
} from '@/lib/company-search';

const BASE_URL = 'https://financialmodelingprep.com';
const MAX_HISTORICAL_ROWS = 8;
const MAX_FORWARD_ESTIMATES = 3;
const MAX_PEERS = 5;
const PRIMARY_EXCHANGES = new Set(['NYSE', 'NASDAQ']);
const SECONDARY_EXCHANGES = new Set(['LSE', 'XETRA', 'SIX']);
const PEER_METRIC_SYMBOL_ALIASES: Record<string, string> = {
  ADYEN: 'ADYYF',
};
const PEER_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  ADYEN: 'Adyen N.V.',
};
const SUBJECT_PEER_METRIC_SYMBOLS: Record<string, readonly string[]> = {
  KLAR: ['AFRM', 'SQ', 'PYPL', 'ADYEN', 'SEZL'],
};

type FmpSymbolResolution = {
  readonly symbol: string;
  readonly companyName: string | null;
};

export type FmpLiveQuote = {
  readonly asOfDate: string;
  readonly displayPrice: string;
  readonly price: number;
  readonly symbol: string;
};

function getApiKey(): string {
  return process.env.FMP_API_KEY ?? '';
}

function hasApiKey(): boolean {
  return getApiKey().trim().length > 0;
}

function buildUrl(path: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams({
    ...params,
    apikey: getApiKey(),
  });

  return `${BASE_URL}${path}?${searchParams.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizePercentGrowth(value: unknown): number | null {
  const numberValue = normalizeNumber(value);

  if (numberValue === null) {
    return null;
  }

  return Math.abs(numberValue) <= 1 ? numberValue * 100 : numberValue;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatUsdPrice(price: number): string {
  return `$${price.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, init);
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
      error: 'Invalid JSON response from FMP',
    };
  }
}

function pickArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value)) {
    for (const key of ['data', 'results', 'items', 'historical', 'peers']) {
      const candidate = value[key];

      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }

  return [];
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  const first = pickArray(value)[0];

  return isRecord(first) ? first : null;
}

function normalizeHistoricalMultiples(
  value: unknown
): readonly FmpHistoricalMultiple[] {
  const rows = pickArray(value);

  return rows
    .map((row): FmpHistoricalMultiple | null => {
      if (!isRecord(row)) {
        return null;
      }

      const date = normalizeString(row['date']);

      if (date === null) {
        return null;
      }

      return {
        date,
        peRatio: normalizeNumber(row['peRatio']),
        pbRatio: normalizeNumber(row['pbRatio']),
        evToEbitda:
          normalizeNumber(row['enterpriseValueOverEBITDA']) ??
          normalizeNumber(row['evToEbitda']) ??
          normalizeNumber(row['evToEbitdaTTM']),
        evToSales:
          normalizeNumber(row['evToSales']) ??
          normalizeNumber(row['enterpriseValueOverSales']),
      };
    })
    .filter((row): row is FmpHistoricalMultiple => row !== null)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, MAX_HISTORICAL_ROWS);
}

function normalizeEnterpriseValues(
  value: unknown
): readonly FmpEnterpriseValue[] {
  const rows = pickArray(value);

  return rows
    .map((row): FmpEnterpriseValue | null => {
      if (!isRecord(row)) {
        return null;
      }

      const date = normalizeString(row['date']);

      if (date === null) {
        return null;
      }

      return {
        date,
        enterpriseValue: normalizeNumber(row['enterpriseValue']),
        marketCapitalization:
          normalizeNumber(row['marketCapitalization']) ??
          normalizeNumber(row['marketCap']),
        stockPrice:
          normalizeNumber(row['stockPrice']) ?? normalizeNumber(row['price']),
      };
    })
    .filter((row): row is FmpEnterpriseValue => row !== null)
    .sort((left, right) => right.date.localeCompare(left.date));
}

function normalizeAnalystEstimates(
  value: unknown
): readonly FmpAnalystEstimate[] {
  const rows = pickArray(value);

  return rows
    .map((row): FmpAnalystEstimate | null => {
      if (!isRecord(row)) {
        return null;
      }

      const date = normalizeString(row['date']);

      if (date === null) {
        return null;
      }

      return {
        date,
        estimatedRevenueAvg:
          normalizeNumber(row['estimatedRevenueAvg']) ??
          normalizeNumber(row['revenueAvg']) ??
          normalizeNumber(row['revenueEstimateAvg']),
        estimatedEpsAvg:
          normalizeNumber(row['estimatedEpsAvg']) ??
          normalizeNumber(row['epsAvg']) ??
          normalizeNumber(row['epsEstimateAvg']),
      };
    })
    .filter((row): row is FmpAnalystEstimate => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, MAX_FORWARD_ESTIMATES);
}

function normalizePriceTargetConsensus(
  value: unknown
): FmpPriceTargetConsensus | null {
  const row = Array.isArray(value) && value.length > 0 ? value[0] : value;

  if (!isRecord(row)) {
    return null;
  }

  const consensus: FmpPriceTargetConsensus = {
    targetHigh: normalizeNumber(row['targetHigh']),
    targetLow: normalizeNumber(row['targetLow']),
    targetMedian:
      normalizeNumber(row['targetMedian']) ??
      normalizeNumber(row['targetMean']),
    targetConsensus:
      normalizeNumber(row['targetConsensus']) ??
      normalizeNumber(row['targetMean']) ??
      normalizeNumber(row['targetPriceConsensus']),
  };

  const hasAnyValue =
    consensus.targetHigh !== null ||
    consensus.targetLow !== null ||
    consensus.targetMedian !== null ||
    consensus.targetConsensus !== null;

  return hasAnyValue ? consensus : null;
}

function normalizePeerProfiles(value: unknown): readonly FmpPeerProfile[] {
  const rows = pickArray(value);

  return rows
    .map((row): FmpPeerProfile | null => {
      if (!isRecord(row)) {
        return null;
      }

      const symbol = normalizeString(row['symbol']);

      if (symbol === null) {
        return null;
      }

      return {
        symbol,
        companyName:
          normalizeString(row['companyName']) ??
          normalizeString(row['name']) ??
          symbol,
        currentPrice:
          normalizeNumber(row['currentPrice']) ?? normalizeNumber(row['price']),
        marketCap:
          normalizeNumber(row['marketCap']) ??
          normalizeNumber(row['marketCapitalization']),
        peRatio:
          normalizeNumber(row['peRatio']) ??
          normalizeNumber(row['pe']) ??
          normalizeNumber(row['priceToEarningsRatioTTM']) ??
          normalizeNumber(row['priceEarningsRatioTTM']) ??
          normalizeNumber(row['priceToEarningsRatio']),
        revenueGrowth:
          normalizePercentGrowth(row['revenueGrowth']) ??
          normalizePercentGrowth(row['growthRevenue']) ??
          normalizePercentGrowth(row['revenueGrowthTTMYoy']) ??
          normalizePercentGrowth(row['revenueGrowthYoy']),
        evToEbitda:
          normalizeNumber(row['evToEbitda']) ??
          normalizeNumber(row['evToEBITDA']) ??
          normalizeNumber(row['evToEBITDATTM']) ??
          normalizeNumber(row['enterpriseValueMultipleTTM']) ??
          normalizeNumber(row['enterpriseValueOverEBITDA']) ??
          normalizeNumber(row['enterpriseValueOverEBITDATTM']),
      };
    })
    .filter((row): row is FmpPeerProfile => row !== null)
    .slice(0, MAX_PEERS);
}

function emptyPeerProfile(symbol: string): FmpPeerProfile {
  return {
    symbol,
    companyName: PEER_DISPLAY_NAME_OVERRIDES[symbol] ?? symbol,
    currentPrice: null,
    marketCap: null,
    peRatio: null,
    revenueGrowth: null,
    evToEbitda: null,
  };
}

function metricSymbolForPeer(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();

  return PEER_METRIC_SYMBOL_ALIASES[normalized] ?? normalized;
}

function ratioMetricsFromRow(row: Record<string, unknown>): {
  readonly peRatio: number | null;
  readonly evToEbitda: number | null;
} {
  return {
    peRatio:
      normalizeNumber(row['priceToEarningsRatioTTM']) ??
      normalizeNumber(row['priceEarningsRatioTTM']) ??
      normalizeNumber(row['priceToEarningsRatio']) ??
      normalizeNumber(row['peRatioTTM']) ??
      normalizeNumber(row['peRatio']) ??
      normalizeNumber(row['pe']),
    evToEbitda:
      normalizeNumber(row['enterpriseValueMultipleTTM']) ??
      normalizeNumber(row['evToEBITDATTM']) ??
      normalizeNumber(row['evToEBITDA']) ??
      normalizeNumber(row['evToEbitda']) ??
      normalizeNumber(row['enterpriseValueOverEBITDATTM']) ??
      normalizeNumber(row['enterpriseValueOverEBITDA']),
  };
}

function revenueGrowthFromRow(row: Record<string, unknown>): number | null {
  return (
    normalizePercentGrowth(row['revenueGrowth']) ??
    normalizePercentGrowth(row['growthRevenue']) ??
    normalizePercentGrowth(row['revenueGrowthTTMYoy']) ??
    normalizePercentGrowth(row['revenueGrowthYoy'])
  );
}

async function fetchPeerProfile(peerSymbol: string): Promise<FmpPeerProfile> {
  const result = await fetchJson<unknown>(
    buildUrl('/stable/profile', { symbol: peerSymbol })
  );

  if (!result.success) {
    console.error('[fmp] profile fetch failed', {
      symbol: peerSymbol,
      error: result.error,
    });

    return emptyPeerProfile(peerSymbol);
  }

  const normalized = normalizePeerProfiles(result.data);

  return normalized[0] ?? emptyPeerProfile(peerSymbol);
}

async function enrichPeerProfile(
  peer: FmpPeerProfile
): Promise<FmpPeerProfile> {
  const metricSymbol = metricSymbolForPeer(peer.symbol);
  const [ratiosResult, growthResult] = await Promise.all([
    fetchJson<unknown>(buildUrl('/stable/ratios-ttm', { symbol: metricSymbol })),
    fetchJson<unknown>(
      buildUrl('/stable/financial-growth', { symbol: metricSymbol })
    ),
  ]);
  let peRatio = peer.peRatio;
  let evToEbitda = peer.evToEbitda;
  let revenueGrowth = peer.revenueGrowth;

  if (!ratiosResult.success) {
    console.error('[fmp] peer ratios-ttm fetch failed', {
      symbol: peer.symbol,
      metricSymbol,
      error: ratiosResult.error,
    });
  } else {
    const ratioRow = firstRecord(ratiosResult.data);

    if (ratioRow !== null) {
      const ratioMetrics = ratioMetricsFromRow(ratioRow);
      peRatio = peRatio ?? ratioMetrics.peRatio;
      evToEbitda = evToEbitda ?? ratioMetrics.evToEbitda;
    }
  }

  if (!growthResult.success) {
    console.error('[fmp] peer financial-growth fetch failed', {
      symbol: peer.symbol,
      metricSymbol,
      error: growthResult.error,
    });
  } else {
    const growthRow = firstRecord(growthResult.data);

    if (growthRow !== null) {
      revenueGrowth = revenueGrowth ?? revenueGrowthFromRow(growthRow);
    }
  }

  return {
    ...peer,
    peRatio,
    evToEbitda,
    revenueGrowth,
  };
}

function normalizePeerSymbols(
  value: unknown,
  symbol: string
): readonly string[] {
  const directRows = pickArray(value)
    .map((row) => {
      if (typeof row === 'string') {
        return row.trim().toUpperCase();
      }

      if (isRecord(row)) {
        return normalizeString(row['symbol'])?.toUpperCase() ?? null;
      }

      return null;
    })
    .filter((row): row is string => row !== null && row.length > 0);

  if (directRows.length > 0) {
    return [...new Set(directRows.filter((item) => item !== symbol))].slice(
      0,
      MAX_PEERS
    );
  }

  if (isRecord(value)) {
    const peerValue = value['peers'] ?? value['similarStocks'] ?? value['data'];

    if (typeof peerValue === 'string') {
      return [
        ...new Set(
          peerValue
            .split(',')
            .map((item) => item.trim().toUpperCase())
            .filter((item) => item.length > 0 && item !== symbol)
        ),
      ].slice(0, MAX_PEERS);
    }
  }

  return [];
}

function getExchangeRank(exchange: string): number {
  if (PRIMARY_EXCHANGES.has(exchange)) {
    return 0;
  }

  if (SECONDARY_EXCHANGES.has(exchange)) {
    return 1;
  }

  return 2;
}

async function searchFmpSymbol(
  query: string
): Promise<FmpSymbolResolution | null> {
  try {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length === 0) {
      return null;
    }

    const result = await fetchJson<unknown>(
      buildUrl('/stable/search-name', {
        query: trimmedQuery,
        limit: '10',
      })
    );

    if (!result.success) {
      console.error('[fmp] symbol search failed', {
        query,
        error: result.error,
      });

      return null;
    }

    const candidates = pickArray(result.data)
      .map(
        (
          row
        ): {
          readonly symbol: string;
          readonly exchange: string;
          readonly companyName: string | null;
          readonly isStrongNameMatch: boolean;
          readonly nameScore: number;
        } | null => {
          if (!isRecord(row)) {
            return null;
          }

          const symbol = normalizeString(row['symbol']);

          if (symbol === null) {
            return null;
          }

          const exchange =
            typeof row['exchange'] === 'string'
              ? row['exchange'].trim().toUpperCase()
              : '';
          const companyName =
            normalizeString(row['name']) ?? normalizeString(row['companyName']);

          return {
            companyName,
            symbol,
            exchange,
            isStrongNameMatch:
              companyName !== null &&
              hasStrongCompanyNameMatch(query, companyName),
            nameScore:
              companyName !== null
                ? scoreCompanyNameMatch(query, companyName)
                : scoreCompanyNameMatch(query, symbol),
          };
        }
      )
      .filter(
        (
          row
        ): row is {
          readonly companyName: string | null;
          readonly isStrongNameMatch: boolean;
          readonly nameScore: number;
          readonly symbol: string;
          readonly exchange: string;
        } => row !== null
      );

    if (candidates.length === 0) {
      return null;
    }

    const exactMatches = candidates.filter(
      (candidate) => candidate.isStrongNameMatch
    );
    const rankedCandidates = [
      ...(exactMatches.length > 0 ? exactMatches : candidates),
    ].sort((left, right) => {
      if (right.nameScore !== left.nameScore) {
        return right.nameScore - left.nameScore;
      }

      const exchangeRankGap =
        getExchangeRank(left.exchange) - getExchangeRank(right.exchange);

      if (exchangeRankGap !== 0) {
        return exchangeRankGap;
      }

      return left.symbol.localeCompare(right.symbol);
    });
    const preferred = rankedCandidates[0] ?? null;

    if (preferred === null) {
      return null;
    }

    if (isKnownPrivateCompanyQuery(query) && !preferred.isStrongNameMatch) {
      console.info('[fmp] rejecting weak match for likely private company', {
        query,
        candidate: preferred.companyName ?? preferred.symbol,
        symbol: preferred.symbol,
      });

      return null;
    }

    return {
      symbol: preferred.symbol,
      companyName: preferred.companyName,
    };
  } catch (error: unknown) {
    console.error('[fmp] symbol search failed', {
      query,
      error: String(error),
    });

    return null;
  }
}

export async function fetchFmpLiveQuote(
  symbol: string,
  timeoutMs = 900,
): Promise<ApiResult<FmpLiveQuote>> {
  const upperSymbol = symbol.trim().toUpperCase();

  if (!hasApiKey()) {
    return {
      success: false,
      error: 'FMP_API_KEY is not configured.',
    };
  }

  if (upperSymbol.length === 0) {
    return {
      success: false,
      error: 'A symbol is required for FMP live quote lookup.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const quoteResult = await fetchJson<unknown>(
      buildUrl('/stable/quote', { symbol: upperSymbol }),
      { signal: controller.signal },
    );

    if (!quoteResult.success) {
      return quoteResult;
    }

    const row =
      firstRecord(quoteResult.data) ??
      (isRecord(quoteResult.data) ? quoteResult.data : null);
    if (row === null) {
      return {
        success: false,
        error: `No FMP quote row returned for ${upperSymbol}.`,
      };
    }

    const price =
      normalizeNumber(row.price) ??
      normalizeNumber(row.currentPrice) ??
      normalizeNumber(row.previousClose);

    if (price === null) {
      return {
        success: false,
        error: `No usable FMP quote price returned for ${upperSymbol}.`,
      };
    }

    const asOfDate = todayIsoDate();

    return {
      success: true,
      data: {
        asOfDate,
        displayPrice: `${formatUsdPrice(price)} as of ${asOfDate}`,
        price,
        symbol: upperSymbol,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchFmpData(query: string): Promise<ApiResult<FmpData>> {
  if (!hasApiKey()) {
    return {
      success: false,
      error: 'FMP API key not configured',
    };
  }

  const resolved = await searchFmpSymbol(query);

  if (resolved === null || resolved.symbol.trim().length === 0) {
    return {
      success: false,
      error: `FMP: no symbol found for "${query}"`,
    };
  }

  const upperSymbol = resolved.symbol.trim().toUpperCase();

  const [
    historicalMultiplesResult,
    enterpriseValuesResult,
    analystEstimatesResult,
    priceTargetResult,
    peersResult,
  ] = await Promise.all([
    fetchJson<unknown>(
      buildUrl('/stable/key-metrics', { symbol: upperSymbol })
    ),
    fetchJson<unknown>(
      buildUrl('/stable/enterprise-values', { symbol: upperSymbol })
    ),
    fetchJson<unknown>(
      buildUrl('/stable/analyst-estimates', {
        symbol: upperSymbol,
        period: 'annual',
        page: '0',
        limit: String(MAX_FORWARD_ESTIMATES),
      })
    ),
    fetchJson<unknown>(
      buildUrl('/stable/price-target-consensus', { symbol: upperSymbol })
    ),
    fetchJson<unknown>(
      buildUrl('/stable/stock-peers', { symbol: upperSymbol })
    ),
  ]);

  if (!historicalMultiplesResult.success) {
    console.error('[fmp] key-metrics fetch failed', {
      symbol: upperSymbol,
      error: historicalMultiplesResult.error,
    });
  }

  if (!enterpriseValuesResult.success) {
    console.error('[fmp] enterprise-values fetch failed', {
      symbol: upperSymbol,
      error: enterpriseValuesResult.error,
    });
  }

  if (!analystEstimatesResult.success) {
    console.error('[fmp] analyst-estimates fetch failed', {
      symbol: upperSymbol,
      error: analystEstimatesResult.error,
    });
  }

  if (!priceTargetResult.success) {
    console.error('[fmp] price-target-consensus fetch failed', {
      symbol: upperSymbol,
      error: priceTargetResult.error,
    });
  }

  if (!peersResult.success) {
    console.error('[fmp] stock-peers fetch failed', {
      symbol: upperSymbol,
      error: peersResult.error,
    });
  }

  const historicalMultiples = historicalMultiplesResult.success
    ? normalizeHistoricalMultiples(historicalMultiplesResult.data)
    : [];
  const enterpriseValues = enterpriseValuesResult.success
    ? normalizeEnterpriseValues(enterpriseValuesResult.data)
    : [];
  const analystEstimates = analystEstimatesResult.success
    ? normalizeAnalystEstimates(analystEstimatesResult.data)
    : [];
  const priceTargetConsensus = priceTargetResult.success
    ? normalizePriceTargetConsensus(priceTargetResult.data)
    : null;
  const peerProfilesDirect = peersResult.success
    ? normalizePeerProfiles(peersResult.data)
    : [];
  const peerSymbolsFromResponse = peersResult.success
    ? normalizePeerSymbols(peersResult.data, upperSymbol)
    : [];
  const peerMetricSymbols =
    SUBJECT_PEER_METRIC_SYMBOLS[upperSymbol]?.filter(
      (peerSymbol) => peerSymbol !== upperSymbol
    ) ?? [];

  let peers = peerProfilesDirect;
  const currentPeerSymbols = new Set(
    peers.map((peer) => peer.symbol.trim().toUpperCase())
  );
  const peerSymbolsToFetch = [
    ...new Set([...peerSymbolsFromResponse, ...peerMetricSymbols]),
  ].filter((peerSymbol) => {
    const normalized = peerSymbol.trim().toUpperCase();

    return normalized.length > 0 && !currentPeerSymbols.has(normalized);
  });

  if (peerSymbolsToFetch.length > 0) {
    const peerProfileResults = await Promise.all(
      peerSymbolsToFetch.map((peerSymbol) => fetchPeerProfile(peerSymbol))
    );

    peers = [...peers, ...peerProfileResults];
  }

  peers = await Promise.all(peers.map((peer) => enrichPeerProfile(peer)));

  const hasAnyData =
    historicalMultiples.length > 0 ||
    enterpriseValues.length > 0 ||
    analystEstimates.length > 0 ||
    priceTargetConsensus !== null ||
    peers.length > 0;

  if (!hasAnyData) {
    return {
      success: false,
      error: `No usable FMP coverage for: "${upperSymbol}"`,
    };
  }

  const unavailableSegments = [
    historicalMultiples.length === 0 ? 'historical multiples' : null,
    enterpriseValues.length === 0 ? 'enterprise values' : null,
    analystEstimates.length === 0 ? 'forward estimates' : null,
    priceTargetConsensus === null ? 'price targets' : null,
    peers.length === 0 ? 'peer set' : null,
  ].filter((item): item is string => item !== null);

  return {
    success: true,
    data: {
      symbol: upperSymbol,
      companyName: resolved.companyName,
      historicalMultiples,
      enterpriseValues,
      analystEstimates,
      priceTargetConsensus,
      peers,
      note:
        unavailableSegments.length === 0
          ? undefined
          : `FMP coverage is partial for ${upperSymbol}: missing ${unavailableSegments.join(
              ', '
            )}.`,
    },
  };
}
