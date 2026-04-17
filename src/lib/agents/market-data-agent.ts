import type {
  DataSource,
  DataSourceResult,
  FinancialMetric,
  WaterfallInput,
  WaterfallResult,
} from "@/lib/types";
import { fetchClaudeFallbackData } from "@/lib/datasources/claude-fallback";
import { fetchCompaniesHouseData } from "@/lib/datasources/companies-house";
import { fetchFinnhubData } from "@/lib/datasources/finnhub";
import { fetchFmpData } from "@/lib/datasources/fmp";
import { fetchGleifData } from "@/lib/datasources/gleif";
import { fetchSecEdgarData } from "@/lib/datasources/sec-edgar";

const CH_SKIP_MCAP_THRESHOLD_USDm = 50_000;
const INTERNATIONAL_EXCHANGE_SUFFIXES = new Set([
  "L",
  "AS",
  "PA",
  "DE",
  "MI",
  "ST",
  "CO",
  "HE",
  "VX",
  "NS",
  "BO",
  "KS",
  "KQ",
  "AX",
  "NZ",
  "HK",
  "T",
  "TW",
  "SI",
  "PR",
  "WS",
  "U",
  "W",
  "RT",
  "CL",
]);

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

function isUsPrimaryListingSymbol(symbol: string): boolean {
  const suffixSegments = symbol.toUpperCase().split(".").slice(1);
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
  finnhubResult: Awaited<ReturnType<typeof fetchFinnhubData>>,
): boolean {
  if (!finnhubResult.success) {
    return false;
  }

  const {
    basicFinancials,
    isAmbiguous = false,
    symbol,
    symbolType,
  } = finnhubResult.data;
  const marketCap = basicFinancials?.metric.marketCapitalization ?? 0;

  return (
    !isAmbiguous &&
    isUsPrimaryListingSymbol(symbol) &&
    symbolType?.trim().toLowerCase() === "common stock" &&
    marketCap > CH_SKIP_MCAP_THRESHOLD_USDm
  );
}

function buildActiveSources(result: WaterfallResult): readonly DataSource[] {
  return [
    ...(result.finnhub !== null ? (["finnhub"] as const) : []),
    ...(result.fmp !== null ? (["fmp"] as const) : []),
    ...(result.secEdgar !== null ? (["sec-edgar"] as const) : []),
    ...(result.companiesHouse !== null ? (["companies-house"] as const) : []),
    ...(result.gleif !== null ? (["gleif"] as const) : []),
    ...(result.claudeFallback !== null ? (["claude-fallback"] as const) : []),
  ];
}

export async function runWaterfall(
  input: WaterfallInput,
): Promise<WaterfallResult> {
  const finnhubPromise = fetchFinnhubData(input.query);
  const gleifPromise = fetchGleifData(input.query);

  const finnhubResult = await finnhubPromise;
  const skipCompaniesHouse = shouldSkipCompaniesHouseLookup(finnhubResult);
  const tickerHint =
    finnhubResult.success && finnhubResult.data.symbol.trim().length > 0
      ? finnhubResult.data.symbol
      : undefined;
  const companiesHouseResultPromise = skipCompaniesHouse
    ? Promise.resolve(null)
    : fetchCompaniesHouseData(input.query);

  const [edgarResult, chResult, gleifResult] = await Promise.all([
    fetchSecEdgarData(input.query, { tickerHint }),
    companiesHouseResultPromise,
    gleifPromise,
  ]);

  const finnhub = wrapSource("finnhub", finnhubResult);
  const fmp =
    finnhubResult.success
      ? wrapSource("fmp", await fetchFmpData(finnhubResult.data.symbol))
      : null;
  const secEdgar = wrapSource("sec-edgar", edgarResult);
  const companiesHouse =
    chResult === null ? null : wrapSource("companies-house", chResult);
  const gleif = wrapSource("gleif", gleifResult);

  const anyData =
    finnhub !== null ||
    fmp !== null ||
    secEdgar !== null ||
    companiesHouse !== null ||
    gleif !== null;
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
    console.error("[analyzer] running Claude fallback", {
      query: input.query,
      mode: anyData ? "supplement" : "all-sources-failed",
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

    claudeFallback = wrapSource("claude-fallback", fallbackResult);
  }

  const baseResult: WaterfallResult = {
    query: input.query,
    finnhub,
    fmp,
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
