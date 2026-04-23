import type {
  ApiResult,
  SecCompanyInfo,
  SecEdgarData,
  SecFiling,
  SecXbrlConcept,
  SecXbrlFact,
  SecXbrlFacts,
  SecXbrlUnit,
} from '@/lib/types';

const BASE_URL = 'https://data.sec.gov';
const SUBMISSIONS_BASE = 'https://data.sec.gov/submissions';
const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEARCH_URL =
  'https://efts.sec.gov/LATEST/search-index?q=%22{query}%22&dateRange=custom&startdt=2020-01-01&enddt={today}&forms=10-K';
const USER_AGENT =
  process.env.SEC_EDGAR_USER_AGENT?.trim() ||
  'FinancialIntelligence/1.0 contact@example.com';
export const REVENUE_CONCEPTS = [
  'Revenues',
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'SalesRevenueNet',
  'SalesRevenueGoodsNet',
] as const;
export const NET_INCOME_CONCEPTS = [
  'NetIncomeLoss',
  'NetIncomeLossAvailableToCommonStockholdersBasic',
] as const;
export const GROSS_PROFIT_CONCEPTS = [
  'GrossProfit',
] as const;
export const OPERATING_CASH_FLOW_CONCEPTS = [
  'NetCashProvidedByUsedInOperatingActivities',
  'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  'NetCashProvidedByUsedInContinuingOperations',
] as const;
export const CAPEX_CONCEPTS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'CapitalExpendituresIncurredButNotYetPaid',
  'PropertyPlantAndEquipmentAdditions',
] as const;
const MAX_RECENT_FILINGS = 20;

type EdgarSearchHit = {
  readonly _source?: {
    readonly entity_id?: string;
  };
};

type EdgarSearchResponse = {
  readonly hits?: {
    readonly hits?: readonly EdgarSearchHit[];
  };
};

type SecEdgarLookupOptions = {
  readonly cikHint?: string;
  readonly tickerHint?: string;
};

type ResolvedEdgarLookup = {
  readonly cik: string;
  readonly companyInfo: SecCompanyInfo | null;
};

type SecTickerMapEntry = {
  readonly ticker?: unknown;
  readonly cik_str?: unknown;
};

let tickerCikMapPromise: Promise<Map<string, string> | null> | null = null;

function padCik(cik: string | number): string {
  return String(cik).trim().padStart(10, '0');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function looksLikeTicker(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(value.trim());
}

function buildTickerVariants(ticker: string): readonly string[] {
  const normalized = ticker.trim().toUpperCase();
  const variants = [
    normalized,
    normalized.replace(/\./g, '-'),
    normalized.replace(/-/g, '.'),
  ].filter(
    (candidate, index, array) =>
      candidate.length > 0 && array.indexOf(candidate) === index
  );

  return variants;
}

function buildSuccessResult<T>(data: unknown): ApiResult<T> {
  return {
    success: true,
    data: data as T,
  };
}

async function fetchEdgar<T>(url: string): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });
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

    return buildSuccessResult<T>(data);
  } catch {
    return {
      success: false,
      error: 'Invalid JSON from SEC EDGAR',
    };
  }
}

function normalizeTickerCikMap(value: unknown): Map<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }

  const tickerMap = new Map<string, string>();

  for (const entry of Object.values(value)) {
    if (!isRecord(entry)) {
      continue;
    }

    const ticker = normalizeString((entry as SecTickerMapEntry).ticker)
      .trim()
      .toUpperCase();
    const cikValue = (entry as SecTickerMapEntry).cik_str;
    const cik =
      typeof cikValue === 'number' || typeof cikValue === 'string'
        ? String(cikValue).trim()
        : '';

    if (ticker.length === 0 || cik.length === 0) {
      continue;
    }

    tickerMap.set(ticker, padCik(cik));
  }

  return tickerMap.size > 0 ? tickerMap : null;
}

async function getTickerCikMap(): Promise<Map<string, string> | null> {
  if (tickerCikMapPromise === null) {
    tickerCikMapPromise = (async () => {
      const result = await fetchEdgar<unknown>(TICKER_MAP_URL);

      if (!result.success) {
        console.error('[sec-edgar] ticker map fetch failed', {
          url: TICKER_MAP_URL,
          error: result.error,
        });
        tickerCikMapPromise = null;
        return null;
      }

      const tickerMap = normalizeTickerCikMap(result.data);

      if (tickerMap === null) {
        console.error('[sec-edgar] ticker map returned an unexpected shape', {
          url: TICKER_MAP_URL,
        });
        tickerCikMapPromise = null;
        return null;
      }

      return tickerMap;
    })();
  }

  return tickerCikMapPromise;
}

async function lookupTickerCik(ticker: string): Promise<string | null> {
  const tickerMap = await getTickerCikMap();

  if (tickerMap === null) {
    return null;
  }

  for (const variant of buildTickerVariants(ticker)) {
    const cik = tickerMap.get(variant);

    if (cik !== undefined) {
      return cik;
    }
  }

  return null;
}

function normalizeRecentFilings(
  value: unknown
): SecCompanyInfo['filings']['recent'] | null {
  if (!isRecord(value)) {
    return null;
  }

  const accessionNumber = value['accessionNumber'];
  const filingDate = value['filingDate'];
  const form = value['form'];
  const primaryDocument = value['primaryDocument'];
  const primaryDocDescription = value['primaryDocDescription'];

  if (
    !isStringArray(accessionNumber) ||
    !isStringArray(filingDate) ||
    !isStringArray(form) ||
    !isStringArray(primaryDocument) ||
    !isStringArray(primaryDocDescription)
  ) {
    return null;
  }

  return {
    accessionNumber,
    filingDate,
    form,
    primaryDocument,
    primaryDocDescription,
  };
}

function normalizeCompanyInfo(value: unknown): SecCompanyInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  const cik = value['cik'];
  const filings = value['filings'];

  if (
    (typeof cik !== 'string' && typeof cik !== 'number') ||
    !isRecord(filings)
  ) {
    return null;
  }

  const recent = normalizeRecentFilings(filings['recent']);

  if (recent === null) {
    return null;
  }

  return {
    cik: String(cik),
    name: normalizeString(value['name']),
    sic: normalizeString(value['sic']),
    sicDescription: normalizeString(value['sicDescription']),
    tickers: isStringArray(value['tickers']) ? value['tickers'] : [],
    exchanges: isStringArray(value['exchanges']) ? value['exchanges'] : [],
    filings: {
      recent,
    },
  };
}

function normalizeXbrlFact(value: unknown): SecXbrlFact | null {
  if (!isRecord(value)) {
    return null;
  }

  const val = value['val'];
  const accn = value['accn'];
  const fy = value['fy'];
  const fp = value['fp'];
  const form = value['form'];
  const filed = value['filed'];
  const frame = value['frame'];
  const start = value['start'];
  const end = value['end'];

  if (
    !isNumber(val) ||
    typeof accn !== 'string' ||
    (fy !== null && !isNumber(fy)) ||
    typeof fp !== 'string' ||
    typeof form !== 'string' ||
    typeof filed !== 'string' ||
    (frame !== undefined && frame !== null && typeof frame !== 'string') ||
    (start !== undefined && typeof start !== 'string') ||
    typeof end !== 'string'
  ) {
    return null;
  }

  return {
    val,
    accn,
    fy,
    fp,
    form,
    filed,
    frame: typeof frame === 'string' ? frame : null,
    ...(typeof start === 'string' ? { start } : {}),
    end,
  };
}

function normalizeXbrlUnit(value: unknown): SecXbrlUnit | null {
  if (!isRecord(value)) {
    return null;
  }

  return Object.entries(value).reduce<SecXbrlUnit>(
    (units, [unitName, facts]) => {
      if (!Array.isArray(facts)) {
        return units;
      }

      const normalizedFacts = facts
        .map(normalizeXbrlFact)
        .filter((fact): fact is SecXbrlFact => fact !== null);

      if (normalizedFacts.length === 0) {
        return units;
      }

      return {
        ...units,
        [unitName]: normalizedFacts,
      };
    },
    {}
  );
}

function normalizeXbrlConcept(value: unknown): SecXbrlConcept | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = value['label'];
  const description = value['description'];
  const units = normalizeXbrlUnit(value['units']);

  if (
    typeof label !== 'string' ||
    typeof description !== 'string' ||
    units === null
  ) {
    return null;
  }

  return {
    label,
    description,
    units,
  };
}

function normalizeTaxonomy(
  value: unknown
): Record<string, SecXbrlConcept> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const taxonomy = Object.entries(value).reduce<Record<string, SecXbrlConcept>>(
    (result, [conceptName, conceptValue]) => {
      const concept = normalizeXbrlConcept(conceptValue);

      if (concept === null) {
        return result;
      }

      return {
        ...result,
        [conceptName]: concept,
      };
    },
    {}
  );

  return Object.keys(taxonomy).length > 0 ? taxonomy : undefined;
}

function normalizeXbrlFacts(value: unknown): SecXbrlFacts | null {
  if (!isRecord(value)) {
    return null;
  }

  const cik = value['cik'];
  const entityName = value['entityName'];
  const facts = value['facts'];

  if (!isNumber(cik) || typeof entityName !== 'string' || !isRecord(facts)) {
    return null;
  }

  const usGaap = normalizeTaxonomy(facts['us-gaap']);
  const dei = normalizeTaxonomy(facts['dei']);
  const ifrsFull = normalizeTaxonomy(facts['ifrs-full']);

  return {
    cik,
    entityName,
    facts: {
      ...(usGaap ? { 'us-gaap': usGaap } : {}),
      ...(dei ? { dei } : {}),
      ...(ifrsFull ? { 'ifrs-full': ifrsFull } : {}),
    },
  };
}

function zipFilings(
  recent: SecCompanyInfo['filings']['recent']
): readonly SecFiling[] {
  if (
    recent.accessionNumber.length === 0 ||
    recent.filingDate.length === 0 ||
    recent.form.length === 0 ||
    recent.primaryDocument.length === 0 ||
    recent.primaryDocDescription.length === 0
  ) {
    return [];
  }

  const filingCount = Math.min(
    MAX_RECENT_FILINGS,
    recent.accessionNumber.length,
    recent.filingDate.length,
    recent.form.length,
    recent.primaryDocument.length,
    recent.primaryDocDescription.length
  );

  return Array.from(
    { length: filingCount },
    (_, index): SecFiling => ({
      accessionNumber: recent.accessionNumber[index] ?? '',
      filingDate: recent.filingDate[index] ?? '',
      form: recent.form[index] ?? '',
      primaryDocument: recent.primaryDocument[index] ?? '',
      primaryDocDescription: recent.primaryDocDescription[index] ?? '',
    })
  );
}

function getAnnualUsdFacts(
  concept: SecXbrlConcept | undefined
): readonly SecXbrlFact[] {
  return concept?.units['USD']?.filter((fact) => fact.form === '10-K') ?? [];
}

export function extractLatestFact(
  facts: SecXbrlFacts,
  concepts: readonly string[]
): number | null {
  const taxonomies = [facts.facts['us-gaap'], facts.facts['ifrs-full']];

  for (const taxonomy of taxonomies) {
    if (taxonomy === undefined) {
      continue;
    }

    for (const conceptName of concepts) {
      const annualFacts = getAnnualUsdFacts(taxonomy[conceptName]);

      if (annualFacts.length === 0) {
        continue;
      }

      const latestFact = [...annualFacts].sort((left, right) =>
        right.filed.localeCompare(left.filed)
      )[0];

      if (latestFact !== undefined) {
        return latestFact.val;
      }
    }
  }

  return null;
}

function buildCikUrl(cik: string): string {
  return `${SUBMISSIONS_BASE}/CIK${padCik(cik)}.json`;
}

function buildFactsUrl(cik: string): string {
  return `${BASE_URL}/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
}

function buildSearchUrl(companyName: string): string {
  const today = new Date().toISOString().slice(0, 10);

  return SEARCH_URL.replace('{query}', encodeURIComponent(companyName)).replace(
    '{today}',
    today
  );
}

function normalizeSearchResponse(value: unknown): EdgarSearchResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const hits = value['hits'];

  if (!isRecord(hits) || !Array.isArray(hits['hits'])) {
    return null;
  }

  const normalizedHits = hits['hits']
    .map((hit): EdgarSearchHit | null => {
      if (!isRecord(hit)) {
        return null;
      }

      const source = hit['_source'];

      if (!isRecord(source)) {
        return null;
      }

      const entityId = source['entity_id'];

      if (typeof entityId !== 'string' || entityId.length === 0) {
        return null;
      }

      return {
        _source: {
          entity_id: entityId,
        },
      };
    })
    .filter(
      (
        hit
      ): hit is {
        readonly _source?: {
          readonly entity_id?: string;
        };
      } => hit !== null
    );

  return {
    hits: {
      hits: normalizedHits,
    },
  };
}

function extractEntityId(value: unknown): string | null {
  const searchResponse = normalizeSearchResponse(value);
  const firstHit = searchResponse?.hits?.hits?.[0];
  const entityId = firstHit?._source?.entity_id;

  return typeof entityId === 'string' && entityId.length > 0 ? entityId : null;
}

export async function searchEdgarCik(
  companyName: string
): Promise<ApiResult<string>> {
  if (looksLikeTicker(companyName)) {
    const cikFromTickerMap = await lookupTickerCik(companyName);

    if (cikFromTickerMap !== null) {
      return {
        success: true,
        data: cikFromTickerMap,
      };
    }
  }

  const url = buildSearchUrl(companyName);
  const result = await fetchEdgar<unknown>(url);

  if (!result.success) {
    return result;
  }

  const cik = extractEntityId(result.data);

  if (typeof cik !== 'string' || cik.length === 0) {
    return {
      success: false,
      error: `No CIK found for: "${companyName}"`,
    };
  }

  return {
    success: true,
    data: cik,
  };
}

async function resolveEdgarLookup(
  query: string,
  options: SecEdgarLookupOptions = {}
): Promise<ApiResult<ResolvedEdgarLookup>> {
  if (options.cikHint !== undefined && options.cikHint.trim().length > 0) {
    return {
      success: true,
      data: {
        cik: padCik(options.cikHint),
        companyInfo: null,
      },
    };
  }

  if (
    options.tickerHint !== undefined &&
    options.tickerHint.trim().length > 0
  ) {
    const normalizedTicker = options.tickerHint.trim().toUpperCase();
    const tickerCik = await lookupTickerCik(normalizedTicker);

    if (tickerCik !== null) {
      const tickerCompanyInfoResult = await getCompanyInfo(tickerCik);

      if (
        tickerCompanyInfoResult.success &&
        tickerCompanyInfoResult.data.tickers.some(
          (ticker) => ticker.trim().toUpperCase() === normalizedTicker
        )
      ) {
        return {
          success: true,
          data: {
            cik: tickerCik,
            companyInfo: tickerCompanyInfoResult.data,
          },
        };
      }

      console.error('[sec-edgar] ticker hint could not be validated', {
        query,
        tickerHint: normalizedTicker,
        cik: tickerCik,
        companyInfoError: tickerCompanyInfoResult.success
          ? null
          : tickerCompanyInfoResult.error,
      });
    } else {
      console.error('[sec-edgar] ticker hint not found in SEC ticker map', {
        query,
        tickerHint: normalizedTicker,
      });
    }
  }

  const cikResult = await searchEdgarCik(query);

  if (!cikResult.success) {
    return cikResult;
  }

  return {
    success: true,
    data: {
      cik: padCik(cikResult.data),
      companyInfo: null,
    },
  };
}

export async function getCompanyInfo(
  cik: string
): Promise<ApiResult<SecCompanyInfo>> {
  const url = buildCikUrl(cik);
  const result = await fetchEdgar<unknown>(url);

  if (!result.success) {
    return result;
  }

  const companyInfo = normalizeCompanyInfo(result.data);

  if (companyInfo === null) {
    return {
      success: false,
      error: 'Unexpected EDGAR submissions response shape',
    };
  }

  return {
    success: true,
    data: companyInfo,
  };
}

export async function getXbrlFacts(
  cik: string
): Promise<ApiResult<SecXbrlFacts>> {
  const url = buildFactsUrl(cik);
  const result = await fetchEdgar<unknown>(url);

  if (!result.success) {
    return result;
  }

  const xbrlFacts = normalizeXbrlFacts(result.data);

  if (xbrlFacts === null) {
    return {
      success: false,
      error: 'Unexpected EDGAR XBRL facts response shape',
    };
  }

  return {
    success: true,
    data: xbrlFacts,
  };
}

export async function fetchSecEdgarData(
  query: string,
  options: SecEdgarLookupOptions = {}
): Promise<ApiResult<SecEdgarData>> {
  const lookupResult = await resolveEdgarLookup(query, options);

  if (!lookupResult.success) {
    console.error('[sec-edgar] searchEdgarCik failed', {
      query,
      error: lookupResult.error,
    });

    return lookupResult;
  }

  const cik = padCik(lookupResult.data.cik);
  const [companyInfoResult, xbrlResult] = await Promise.all([
    lookupResult.data.companyInfo === null
      ? getCompanyInfo(cik)
      : Promise.resolve({
          success: true as const,
          data: lookupResult.data.companyInfo,
        }),
    getXbrlFacts(cik),
  ]);

  if (!companyInfoResult.success) {
    console.error('[sec-edgar] getCompanyInfo failed', {
      cik,
      error: companyInfoResult.error,
    });
  }

  if (!xbrlResult.success) {
    console.error('[sec-edgar] getXbrlFacts failed', {
      cik,
      error: xbrlResult.error,
    });
  }

  if (xbrlResult.success) {
    const latestRevenue = extractLatestFact(xbrlResult.data, REVENUE_CONCEPTS);
    const latestNetIncome = extractLatestFact(
      xbrlResult.data,
      NET_INCOME_CONCEPTS
    );

    if (latestRevenue === null && latestNetIncome === null) {
      console.error('[sec-edgar] fetchSecEdgarData missing annual facts', {
        cik,
      });
    }
  }

  return {
    success: true,
    data: {
      cik,
      companyInfo: companyInfoResult.success ? companyInfoResult.data : null,
      recentFilings: companyInfoResult.success
        ? zipFilings(companyInfoResult.data.filings.recent)
        : [],
      xbrlFacts: xbrlResult.success ? xbrlResult.data : null,
    },
  };
}
