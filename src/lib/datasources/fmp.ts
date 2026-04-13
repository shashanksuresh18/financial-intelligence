import type {
  ApiResult,
  FmpAnalystEstimate,
  FmpData,
  FmpEnterpriseValue,
  FmpHistoricalMultiple,
  FmpPeerProfile,
  FmpPriceTargetConsensus,
} from "@/lib/types";

const BASE_URL = "https://financialmodelingprep.com";
const MAX_HISTORICAL_ROWS = 8;
const MAX_FORWARD_ESTIMATES = 3;
const MAX_PEERS = 5;

function getApiKey(): string {
  return process.env.FMP_API_KEY ?? "";
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
  return typeof value === "object" && value !== null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
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
      error: "Invalid JSON response from FMP",
    };
  }
}

function pickArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value)) {
    for (const key of ["data", "results", "items", "historical", "peers"]) {
      const candidate = value[key];

      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }

  return [];
}

function normalizeHistoricalMultiples(
  value: unknown,
): readonly FmpHistoricalMultiple[] {
  const rows = pickArray(value);

  return rows
    .map((row): FmpHistoricalMultiple | null => {
      if (!isRecord(row)) {
        return null;
      }

      const date = normalizeString(row["date"]);

      if (date === null) {
        return null;
      }

      return {
        date,
        peRatio: normalizeNumber(row["peRatio"]),
        pbRatio: normalizeNumber(row["pbRatio"]),
        evToEbitda:
          normalizeNumber(row["enterpriseValueOverEBITDA"]) ??
          normalizeNumber(row["evToEbitda"]) ??
          normalizeNumber(row["evToEbitdaTTM"]),
        evToSales:
          normalizeNumber(row["evToSales"]) ??
          normalizeNumber(row["enterpriseValueOverSales"]),
      };
    })
    .filter((row): row is FmpHistoricalMultiple => row !== null)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, MAX_HISTORICAL_ROWS);
}

function normalizeEnterpriseValues(
  value: unknown,
): readonly FmpEnterpriseValue[] {
  const rows = pickArray(value);

  return rows
    .map((row): FmpEnterpriseValue | null => {
      if (!isRecord(row)) {
        return null;
      }

      const date = normalizeString(row["date"]);

      if (date === null) {
        return null;
      }

      return {
        date,
        enterpriseValue: normalizeNumber(row["enterpriseValue"]),
        marketCapitalization:
          normalizeNumber(row["marketCapitalization"]) ??
          normalizeNumber(row["marketCap"]),
        stockPrice:
          normalizeNumber(row["stockPrice"]) ??
          normalizeNumber(row["price"]),
      };
    })
    .filter((row): row is FmpEnterpriseValue => row !== null)
    .sort((left, right) => right.date.localeCompare(left.date));
}

function normalizeAnalystEstimates(
  value: unknown,
): readonly FmpAnalystEstimate[] {
  const rows = pickArray(value);

  return rows
    .map((row): FmpAnalystEstimate | null => {
      if (!isRecord(row)) {
        return null;
      }

      const date = normalizeString(row["date"]);

      if (date === null) {
        return null;
      }

      return {
        date,
        estimatedRevenueAvg:
          normalizeNumber(row["estimatedRevenueAvg"]) ??
          normalizeNumber(row["revenueAvg"]) ??
          normalizeNumber(row["revenueEstimateAvg"]),
        estimatedEpsAvg:
          normalizeNumber(row["estimatedEpsAvg"]) ??
          normalizeNumber(row["epsAvg"]) ??
          normalizeNumber(row["epsEstimateAvg"]),
      };
    })
    .filter((row): row is FmpAnalystEstimate => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, MAX_FORWARD_ESTIMATES);
}

function normalizePriceTargetConsensus(
  value: unknown,
): FmpPriceTargetConsensus | null {
  const row =
    Array.isArray(value) && value.length > 0 ? value[0] : value;

  if (!isRecord(row)) {
    return null;
  }

  const consensus: FmpPriceTargetConsensus = {
    targetHigh: normalizeNumber(row["targetHigh"]),
    targetLow: normalizeNumber(row["targetLow"]),
    targetMedian:
      normalizeNumber(row["targetMedian"]) ??
      normalizeNumber(row["targetMean"]),
    targetConsensus:
      normalizeNumber(row["targetConsensus"]) ??
      normalizeNumber(row["targetMean"]) ??
      normalizeNumber(row["targetPriceConsensus"]),
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

      const symbol = normalizeString(row["symbol"]);

      if (symbol === null) {
        return null;
      }

      return {
        symbol,
        companyName:
          normalizeString(row["companyName"]) ??
          normalizeString(row["name"]) ??
          symbol,
        currentPrice:
          normalizeNumber(row["currentPrice"]) ??
          normalizeNumber(row["price"]),
        marketCap:
          normalizeNumber(row["marketCap"]) ??
          normalizeNumber(row["marketCapitalization"]),
        peRatio:
          normalizeNumber(row["peRatio"]) ??
          normalizeNumber(row["pe"]),
        revenueGrowth:
          normalizeNumber(row["revenueGrowth"]) ??
          normalizeNumber(row["revenueGrowthTTMYoy"]),
        evToEbitda:
          normalizeNumber(row["evToEbitda"]) ??
          normalizeNumber(row["enterpriseValueOverEBITDA"]),
      };
    })
    .filter((row): row is FmpPeerProfile => row !== null)
    .slice(0, MAX_PEERS);
}

function normalizePeerSymbols(value: unknown, symbol: string): readonly string[] {
  const directRows = pickArray(value)
    .map((row) => {
      if (typeof row === "string") {
        return row.trim().toUpperCase();
      }

      if (isRecord(row)) {
        return normalizeString(row["symbol"])?.toUpperCase() ?? null;
      }

      return null;
    })
    .filter((row): row is string => row !== null && row.length > 0);

  if (directRows.length > 0) {
    return [...new Set(directRows.filter((item) => item !== symbol))].slice(0, MAX_PEERS);
  }

  if (isRecord(value)) {
    const peerValue =
      value["peers"] ?? value["similarStocks"] ?? value["data"];

    if (typeof peerValue === "string") {
      return [...new Set(
        peerValue
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter((item) => item.length > 0 && item !== symbol),
      )].slice(0, MAX_PEERS);
    }
  }

  return [];
}

export async function fetchFmpData(symbol: string): Promise<ApiResult<FmpData>> {
  if (!hasApiKey()) {
    return {
      success: false,
      error: "FMP API key not configured",
    };
  }

  const upperSymbol = symbol.trim().toUpperCase();

  if (upperSymbol.length === 0) {
    return {
      success: false,
      error: "FMP symbol is required",
    };
  }

  const [
    historicalMultiplesResult,
    enterpriseValuesResult,
    analystEstimatesResult,
    priceTargetResult,
    peersResult,
  ] = await Promise.all([
    fetchJson<unknown>(buildUrl("/stable/key-metrics", { symbol: upperSymbol })),
    fetchJson<unknown>(buildUrl("/stable/enterprise-values", { symbol: upperSymbol })),
    fetchJson<unknown>(
      buildUrl("/stable/analyst-estimates", {
        symbol: upperSymbol,
        period: "annual",
        page: "0",
        limit: String(MAX_FORWARD_ESTIMATES),
      }),
    ),
    fetchJson<unknown>(buildUrl("/stable/price-target-consensus", { symbol: upperSymbol })),
    fetchJson<unknown>(buildUrl("/stable/stock-peers", { symbol: upperSymbol })),
  ]);

  if (!historicalMultiplesResult.success) {
    console.error("[fmp] key-metrics fetch failed", {
      symbol: upperSymbol,
      error: historicalMultiplesResult.error,
    });
  }

  if (!enterpriseValuesResult.success) {
    console.error("[fmp] enterprise-values fetch failed", {
      symbol: upperSymbol,
      error: enterpriseValuesResult.error,
    });
  }

  if (!analystEstimatesResult.success) {
    console.error("[fmp] analyst-estimates fetch failed", {
      symbol: upperSymbol,
      error: analystEstimatesResult.error,
    });
  }

  if (!priceTargetResult.success) {
    console.error("[fmp] price-target-consensus fetch failed", {
      symbol: upperSymbol,
      error: priceTargetResult.error,
    });
  }

  if (!peersResult.success) {
    console.error("[fmp] stock-peers fetch failed", {
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
  const peerSymbols =
    peerProfilesDirect.length > 0 || !peersResult.success
      ? []
      : normalizePeerSymbols(peersResult.data, upperSymbol);

  let peers = peerProfilesDirect;

  if (peers.length === 0 && peerSymbols.length > 0) {
    const peerProfileResults = await Promise.all(
      peerSymbols.map(async (peerSymbol) => {
        const result = await fetchJson<unknown>(
          buildUrl("/stable/profile", { symbol: peerSymbol }),
        );

        if (!result.success) {
          console.error("[fmp] profile fetch failed", {
            symbol: peerSymbol,
            error: result.error,
          });

          return null;
        }

        const normalized = normalizePeerProfiles(result.data);

        return normalized[0] ?? {
          symbol: peerSymbol,
          companyName: peerSymbol,
          currentPrice: null,
          marketCap: null,
          peRatio: null,
          revenueGrowth: null,
          evToEbitda: null,
        };
      }),
    );

    peers = peerProfileResults.filter(
      (item): item is FmpPeerProfile => item !== null,
    );
  }

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
    historicalMultiples.length === 0 ? "historical multiples" : null,
    enterpriseValues.length === 0 ? "enterprise values" : null,
    analystEstimates.length === 0 ? "forward estimates" : null,
    priceTargetConsensus === null ? "price targets" : null,
    peers.length === 0 ? "peer set" : null,
  ].filter((item): item is string => item !== null);

  return {
    success: true,
    data: {
      symbol: upperSymbol,
      historicalMultiples,
      enterpriseValues,
      analystEstimates,
      priceTargetConsensus,
      peers,
      note:
        unavailableSegments.length === 0
          ? undefined
          : `FMP coverage is partial for ${upperSymbol}: missing ${unavailableSegments.join(
              ", ",
            )}.`,
    },
  };
}
