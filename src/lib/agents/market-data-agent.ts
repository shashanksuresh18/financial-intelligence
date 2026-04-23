import type {
  DataSource,
  DataSourceResult,
  ExaDeepData,
  FmpData,
  FinancialMetric,
  WaterfallInput,
  WaterfallResult,
} from '@/lib/types';
import {
  buildCompanySearchVariants,
  hasUkCompanyNameSuffix,
  hasStrongCompanyNameMatch,
  isKnownPrivateCompanyQuery,
  isKnownUkCompanyQuery,
} from '@/lib/company-search';
import { fetchClaudeFallbackData } from '@/lib/datasources/claude-fallback';
import { fetchCompaniesHouseData } from '@/lib/datasources/companies-house';
import { fetchExaDeepData } from '@/lib/datasources/exa-deep';
import { fetchFinnhubData } from '@/lib/datasources/finnhub';
import { fetchFmpData } from '@/lib/datasources/fmp';
import { fetchGleifData } from '@/lib/datasources/gleif';
import { fetchSecEdgarData } from '@/lib/datasources/sec-edgar';

const US_EXCHANGE_CODES = new Set(['NYSE', 'NASDAQ', 'AMEX', 'NYSEARCA']);
const UK_EXCHANGE_CODES = new Set(['LSE', 'AIM', 'ISE']);
const INTERNATIONAL_EXCHANGE_SUFFIXES = new Set([
  'L',
  'AS',
  'PA',
  'DE',
  'MI',
  'ST',
  'CO',
  'HE',
  'VX',
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
  'PR',
  'WS',
  'U',
  'W',
  'RT',
  'CL',
]);

type FinnhubFetchResult = Awaited<ReturnType<typeof fetchFinnhubData>>;
type FmpFetchResult = Awaited<ReturnType<typeof fetchFmpData>>;
type SecEdgarFetchResult = Awaited<ReturnType<typeof fetchSecEdgarData>>;

type CompaniesHouseDecision = {
  readonly skip: boolean;
  readonly reason: string | null;
  readonly entity: string;
};

function wrapSource<T>(
  source: DataSource,
  result:
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: string }
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

function isUsPrimaryListingSymbol(symbol: string): boolean {
  const suffixSegments = symbol.toUpperCase().split('.').slice(1);
  const primarySuffix = suffixSegments[0] ?? null;

  if (primarySuffix === null) {
    return true;
  }

  if (INTERNATIONAL_EXCHANGE_SUFFIXES.has(primarySuffix)) {
    return false;
  }

  return /^[A-Z]{1,2}$/.test(primarySuffix);
}

function shouldSkipCompaniesHouseLookup(
  finnhubResult: Awaited<ReturnType<typeof fetchFinnhubData>>
): boolean {
  if (!finnhubResult.success) {
    return false;
  }

  const {
    isAmbiguous = false,
    symbol,
    symbolType,
  } = finnhubResult.data;

  return (
    !isAmbiguous &&
    isUsPrimaryListingSymbol(symbol) &&
    symbolType?.trim().toLowerCase() === 'common stock'
  );
}

function getSecEntityName(result: SecEdgarFetchResult): string | null {
  if (!result.success) {
    return null;
  }

  return result.data.companyInfo?.name ?? result.data.xbrlFacts?.entityName ?? null;
}

function hasUkListingSignal(
  finnhubResult: FinnhubFetchResult,
  secEdgarResult: SecEdgarFetchResult
): boolean {
  if (
    finnhubResult.success &&
    finnhubResult.data.symbol.trim().toUpperCase().endsWith('.L')
  ) {
    return true;
  }

  if (!secEdgarResult.success || secEdgarResult.data.companyInfo === null) {
    return false;
  }

  return secEdgarResult.data.companyInfo.exchanges.some((exchange) =>
    UK_EXCHANGE_CODES.has(exchange.trim().toUpperCase())
  );
}

function hasExplicitUkNameSignal(
  query: string,
  finnhubResult: FinnhubFetchResult,
  secEdgarResult: SecEdgarFetchResult,
  fmpResult: DataSourceResult<FmpData> | null
): boolean {
  if (hasUkCompanyNameSuffix(query)) {
    return true;
  }

  const candidateNames = [
    finnhubResult.success ? finnhubResult.data.companyName : null,
    getSecEntityName(secEdgarResult),
    fmpResult?.data.companyName ?? null,
  ];

  return candidateNames.some(
    (name) => name !== null && hasUkCompanyNameSuffix(name)
  );
}

function hasValidSecFilings(secEdgarResult: SecEdgarFetchResult): boolean {
  return (
    secEdgarResult.success &&
    secEdgarResult.data.cik.trim().length > 0 &&
    secEdgarResult.data.recentFilings.length > 0
  );
}

function getCompaniesHouseEntityName(params: {
  readonly query: string;
  readonly finnhubResult: FinnhubFetchResult;
  readonly secEdgarResult: SecEdgarFetchResult;
  readonly fmpResult: DataSourceResult<FmpData> | null;
}): string {
  return (
    getSecEntityName(params.secEdgarResult) ??
    (params.finnhubResult.success ? params.finnhubResult.data.companyName : null) ??
    params.fmpResult?.data.companyName ??
    params.query
  );
}

function hasStrongFmpPublicMatch(
  query: string,
  fmpResult: DataSourceResult<FmpData> | null,
): boolean {
  if (fmpResult === null || fmpResult.data.companyName === null) {
    return false;
  }

  if (!hasStrongCompanyNameMatch(query, fmpResult.data.companyName)) {
    return false;
  }

  return (
    fmpResult.data.historicalMultiples.length > 0 ||
    fmpResult.data.enterpriseValues.length > 0 ||
    fmpResult.data.analystEstimates.length > 0 ||
    fmpResult.data.priceTargetConsensus !== null
  );
}

function resolveCompaniesHouseDecision(params: {
  readonly query: string;
  readonly finnhubResult: FinnhubFetchResult;
  readonly secEdgarResult: SecEdgarFetchResult;
  readonly fmpResult: DataSourceResult<FmpData> | null;
}): CompaniesHouseDecision {
  const entity = getCompaniesHouseEntityName(params);
  const hasExplicitUkSignal =
    isKnownUkCompanyQuery(params.query) ||
    hasUkListingSignal(params.finnhubResult, params.secEdgarResult) ||
    hasExplicitUkNameSignal(
      params.query,
      params.finnhubResult,
      params.secEdgarResult,
      params.fmpResult
    );

  if (hasExplicitUkSignal) {
    return {
      skip: false,
      reason: null,
      entity,
    };
  }

  if (isKnownPrivateCompanyQuery(params.query)) {
    return {
      skip: true,
      reason: 'known_private_company',
      entity,
    };
  }

  if (
    params.query
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0).length === 1
  ) {
    return {
      skip: true,
      reason: 'generic_single_token_non_uk_query',
      entity,
    };
  }

  if (hasStrongFmpPublicMatch(params.query, params.fmpResult)) {
    return {
      skip: true,
      reason: 'strong_public_match_on_fmp',
      entity,
    };
  }

  if (hasValidSecFilings(params.secEdgarResult)) {
    return {
      skip: true,
      reason: 'us_listed_with_sec_data',
      entity,
    };
  }

  if (shouldSkipCompaniesHouseLookup(params.finnhubResult)) {
    return {
      skip: true,
      reason: 'us_primary_listing_on_finnhub',
      entity,
    };
  }

  if (
    params.secEdgarResult.success &&
    params.secEdgarResult.data.companyInfo?.exchanges.some((exchange) =>
      US_EXCHANGE_CODES.has(exchange.trim().toUpperCase())
    )
  ) {
    return {
      skip: true,
      reason: 'us_exchange_indicator',
      entity,
    };
  }

  return {
    skip: false,
    reason: null,
    entity,
  };
}

function isLikelyPrivate(
  query: string,
  finnhubResult: Awaited<ReturnType<typeof fetchFinnhubData>>,
  fmpResult: DataSourceResult<FmpData> | null
): boolean {
  // A symbol with no quote and no basic financials is a false-match or inaccessible listing.
  const noFinnhubTicker =
    !finnhubResult.success ||
    finnhubResult.data.symbol.trim().length === 0 ||
    (finnhubResult.data.quote === null &&
      finnhubResult.data.basicFinancials === null);
  // Peers-only FMP data is not sufficient — a false-matched ticker may have peers
  // but no financial metrics (key-metrics/enterprise-values require a real listing).
  const noFmpFinancials =
    fmpResult === null ||
    (fmpResult.data.historicalMultiples.length === 0 &&
      fmpResult.data.enterpriseValues.length === 0 &&
      fmpResult.data.analystEstimates.length === 0 &&
      fmpResult.data.priceTargetConsensus === null);
  const hasStrongFinnhubMatch =
    finnhubResult.success &&
    finnhubResult.data.companyName !== null &&
    hasStrongCompanyNameMatch(query, finnhubResult.data.companyName);
  const hasStrongFmpMatch =
    fmpResult !== null &&
    fmpResult.data.companyName !== null &&
    hasStrongCompanyNameMatch(query, fmpResult.data.companyName);
  const shouldForcePrivateFallback =
    isKnownPrivateCompanyQuery(query) &&
    !hasStrongFinnhubMatch &&
    !hasStrongFmpMatch;

  return shouldForcePrivateFallback || (noFinnhubTicker && noFmpFinancials);
}

function buildActiveSources(result: WaterfallResult): readonly DataSource[] {
  return [
    ...(result.finnhub !== null ? (['finnhub'] as const) : []),
    ...(result.fmp !== null ? (['fmp'] as const) : []),
    ...(result.secEdgar !== null ? (['sec-edgar'] as const) : []),
    ...(result.companiesHouse !== null ? (['companies-house'] as const) : []),
    ...(result.gleif !== null ? (['gleif'] as const) : []),
    ...(result.exaDeep !== null ? (['exa-deep'] as const) : []),
    ...(result.claudeFallback !== null ? (['claude-fallback'] as const) : []),
  ];
}

function forcePrivateCompanyRoute(query: string): boolean {
  return isKnownPrivateCompanyQuery(query);
}

function createSkippedFinnhubResult(query: string): FinnhubFetchResult {
  return {
    success: false,
    error: `Finnhub skipped for known private company "${query}"`,
  };
}

async function resolveAlternativePublicSources(
  query: string,
): Promise<{
  readonly finnhubResult: FinnhubFetchResult;
  readonly secEdgarResult: SecEdgarFetchResult;
} | null> {
  const variants = buildCompanySearchVariants(query).slice(1);

  for (const variant of variants) {
    const finnhubResult = await fetchFinnhubData(variant);
    const tickerHint =
      finnhubResult.success && finnhubResult.data.symbol.trim().length > 0
        ? finnhubResult.data.symbol
        : undefined;
    const secEdgarResult = await fetchSecEdgarData(variant, { tickerHint });

    if (finnhubResult.success || secEdgarResult.success) {
      console.info('[market-data-agent] recovered public lookup from query variant', {
        query,
        variant,
        finnhub: finnhubResult.success,
        secEdgar: secEdgarResult.success,
      });

      return {
        finnhubResult,
        secEdgarResult,
      };
    }
  }

  return null;
}

export async function runWaterfall(
  input: WaterfallInput
): Promise<WaterfallResult> {
  const shouldForcePrivateRoute = forcePrivateCompanyRoute(input.query);

  if (shouldForcePrivateRoute) {
    console.info('[market-data-agent] forcing private-company route', {
      query: input.query,
    });
  }

  const finnhubPromise: Promise<FinnhubFetchResult> = shouldForcePrivateRoute
    ? Promise.resolve(createSkippedFinnhubResult(input.query))
    : fetchFinnhubData(input.query);
  const fmpPromise: Promise<FmpFetchResult | null> = shouldForcePrivateRoute
    ? Promise.resolve(null)
    : fetchFmpData(input.query);
  const gleifPromise = fetchGleifData(input.query);

  let finnhubResult = await finnhubPromise;
  const tickerHint =
    finnhubResult.success && finnhubResult.data.symbol.trim().length > 0
      ? finnhubResult.data.symbol
      : undefined;

  const [initialEdgarResult, gleifResult, fmpResult] = await Promise.all([
    fetchSecEdgarData(input.query, { tickerHint }),
    gleifPromise,
    fmpPromise,
  ]);
  let edgarResult = initialEdgarResult;

  if (!shouldForcePrivateRoute && !finnhubResult.success && !edgarResult.success) {
    const alternativePublicSources = await resolveAlternativePublicSources(
      input.query
    );

    if (alternativePublicSources !== null) {
      finnhubResult = alternativePublicSources.finnhubResult;
      edgarResult = alternativePublicSources.secEdgarResult;
    }
  }
  const fmp = fmpResult === null ? null : wrapSource('fmp', fmpResult);
  const companiesHouseDecision = resolveCompaniesHouseDecision({
    query: input.query,
    finnhubResult,
    secEdgarResult: edgarResult,
    fmpResult: fmp,
  });
  const chResult = companiesHouseDecision.skip
    ? null
    : await fetchCompaniesHouseData(input.query);

  if (companiesHouseDecision.skip) {
    console.info('[market-data-agent] Companies House skipped', {
      reason: companiesHouseDecision.reason,
      entity: companiesHouseDecision.entity,
    });
  }

  const finnhub = wrapSource('finnhub', finnhubResult);
  const secEdgar = wrapSource('sec-edgar', edgarResult);
  const companiesHouse =
    chResult === null ? null : wrapSource('companies-house', chResult);
  const gleif = wrapSource('gleif', gleifResult);
  const exaDeep: DataSourceResult<ExaDeepData> | null = isLikelyPrivate(
    input.query,
    finnhubResult,
    fmp
  )
    ? wrapSource('exa-deep', await fetchExaDeepData(input.query))
    : null;

  const anyData =
    finnhub !== null ||
    fmp !== null ||
    secEdgar !== null ||
    companiesHouse !== null ||
    gleif !== null ||
    exaDeep !== null;
  const shouldSupplementWithClaude =
    finnhub === null &&
    fmp === null &&
    secEdgar === null &&
    (companiesHouse !== null || gleif !== null);

  let claudeFallback: DataSourceResult<{
    readonly narrative: string;
    readonly extractedMetrics: readonly FinancialMetric[];
    readonly disclaimer: string;
  }> | null = null;

  if (!anyData || shouldSupplementWithClaude) {
    console.error('[analyzer] running Claude fallback', {
      query: input.query,
      mode: anyData ? 'supplement' : 'all-sources-failed',
    });

    const fallbackResult = await fetchClaudeFallbackData(input.query, {
      canonicalName:
        companiesHouse?.data.profile?.company_name ??
        companiesHouse?.data.company?.company_name ??
        gleif?.data.record?.attributes.entity.legalName.name ??
        undefined,
      companyNumber:
        companiesHouse?.data.profile?.company_number ??
        companiesHouse?.data.company?.company_number ??
        undefined,
      jurisdiction:
        companiesHouse?.data.profile?.jurisdiction ??
        companiesHouse?.data.company?.registered_office_address.country ??
        undefined,
      companyType:
        companiesHouse?.data.profile?.company_type ??
        companiesHouse?.data.company?.company_type ??
        undefined,
      lei: gleif?.data.record?.id ?? undefined,
    });

    claudeFallback = wrapSource('claude-fallback', fallbackResult);
  }

  const baseResult: WaterfallResult = {
    query: input.query,
    finnhub,
    fmp,
    secEdgar,
    companiesHouse,
    gleif,
    exaDeep,
    claudeFallback,
    activeSources: [],
  };

  return {
    ...baseResult,
    activeSources: buildActiveSources(baseResult),
  };
}
