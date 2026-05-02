import type {
  DataSource,
  FinancialMetric,
  ReconciliationCheck,
  ReconciliationStatus,
  WaterfallResult,
} from "@/lib/types";

const MARKET_CAP_RECONCILE_TOLERANCE = 0.10;
const SHARE_COUNT_RECONCILE_TOLERANCE = 0.10;
const ENTERPRISE_VALUE_RECONCILE_TOLERANCE = 0.10;
const SOURCE_DATE_ALIGNMENT_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function relativeVariance(left: number, right: number): number {
  const denominator = Math.max(Math.abs(left), Math.abs(right));

  return denominator === 0 ? 0 : Math.abs(left - right) / denominator;
}

function metricNumber(metrics: readonly FinancialMetric[], label: string): number | null {
  const metric = metrics.find((item) => item.label.toLowerCase() === label.toLowerCase());

  return typeof metric?.value === "number" ? metric.value : null;
}

function finnhubMarketCapDollars(result: WaterfallResult): number | null {
  const marketCapUsdMillions =
    result.finnhub?.data.basicFinancials?.metric.marketCapitalization ?? null;

  return marketCapUsdMillions === null ? null : marketCapUsdMillions * 1_000_000;
}

function fmpMarketCapDollars(result: WaterfallResult): number | null {
  return result.fmp?.data.enterpriseValues[0]?.marketCapitalization ?? null;
}

function inferredShareCountVariance(result: WaterfallResult): number | null {
  const finnhubMarketCap = finnhubMarketCapDollars(result);
  const fmpMarketCap = fmpMarketCapDollars(result);
  const finnhubPrice = result.finnhub?.data.quote?.c ?? null;
  const fmpPrice = result.fmp?.data.enterpriseValues[0]?.stockPrice ?? null;

  if (
    finnhubMarketCap === null ||
    fmpMarketCap === null ||
    finnhubPrice === null ||
    fmpPrice === null ||
    finnhubPrice <= 0 ||
    fmpPrice <= 0
  ) {
    return null;
  }

  return relativeVariance(finnhubMarketCap / finnhubPrice, fmpMarketCap / fmpPrice);
}

function finnhubEnterpriseValueDollars(result: WaterfallResult): number | null {
  const enterpriseValueUsdMillions = result.finnhub?.data.basicFinancials?.metric.ev ?? null;

  return enterpriseValueUsdMillions === null ? null : enterpriseValueUsdMillions * 1_000_000;
}

function fmpEnterpriseValueDollars(result: WaterfallResult): number | null {
  return result.fmp?.data.enterpriseValues[0]?.enterpriseValue ?? null;
}

function checkMarketCap(result: WaterfallResult): ReconciliationCheck {
  const finnhub = finnhubMarketCapDollars(result);
  const fmp = fmpMarketCapDollars(result);

  if (finnhub === null || fmp === null) {
    return {
      field: "market-cap",
      status: "unavailable",
      sources: availableSources(["finnhub", "fmp"], result),
      note: "Market-cap reconciliation needs both Finnhub and FMP market-cap figures.",
    };
  }

  const variance = relativeVariance(finnhub, fmp);

  if (variance > MARKET_CAP_RECONCILE_TOLERANCE) {
    const shareCountVariance = inferredShareCountVariance(result);

    if (
      shareCountVariance !== null &&
      shareCountVariance <= SHARE_COUNT_RECONCILE_TOLERANCE
    ) {
      return {
        field: "market-cap",
        status: "reconciled",
        sources: ["finnhub", "fmp"],
        note: `Raw market caps differ (${formatPercent(variance)} variance), but implied share counts reconcile (${formatPercent(shareCountVariance)} variance), so the current Finnhub market cap is used for display.`,
      };
    }

    return {
      field: "market-cap",
      status: "unresolved",
      sources: ["finnhub", "fmp"],
      note: `Finnhub market cap is ${formatCurrency(finnhub)} while FMP market cap is ${formatCurrency(fmp)} (${formatPercent(variance)} variance, above the 10.0% tolerance).`,
    };
  }

  return {
    field: "market-cap",
    status: "reconciled",
    sources: ["finnhub", "fmp"],
    note: `Finnhub and FMP market caps reconcile within tolerance (${formatPercent(variance)} variance).`,
  };
}

function checkShareCount(result: WaterfallResult): ReconciliationCheck {
  const variance = inferredShareCountVariance(result);

  if (variance === null) {
    return {
      field: "share-count",
      status: "unavailable",
      sources: availableSources(["finnhub", "fmp"], result),
      note: "Share-count reconciliation needs market cap and current price from both vendors.",
    };
  }

  if (variance > SHARE_COUNT_RECONCILE_TOLERANCE) {
    return {
      field: "share-count",
      status: "unresolved",
      sources: ["finnhub", "fmp"],
      note: `Implied share counts diverge by ${formatPercent(variance)} across Finnhub and FMP.`,
    };
  }

  return {
    field: "share-count",
    status: "reconciled",
    sources: ["finnhub", "fmp"],
    note: `Implied share counts reconcile within tolerance (${formatPercent(variance)} variance).`,
  };
}

function checkEnterpriseValue(result: WaterfallResult): ReconciliationCheck {
  const fmpEv = fmpEnterpriseValueDollars(result);
  const finnhubEv = finnhubEnterpriseValueDollars(result);

  if (fmpEv === null || finnhubEv === null) {
    return {
      field: "enterprise-value",
      status: "unavailable",
      sources: availableSources(["finnhub", "fmp"], result),
      note: "Enterprise-value reconciliation needs both Finnhub EV and FMP EV.",
    };
  }

  const variance = relativeVariance(fmpEv, finnhubEv);

  if (variance > ENTERPRISE_VALUE_RECONCILE_TOLERANCE) {
    return {
      field: "enterprise-value",
      status: "unresolved",
      sources: ["finnhub", "fmp"],
      note: `Finnhub enterprise value is ${formatCurrency(finnhubEv)} while FMP enterprise value is ${formatCurrency(fmpEv)} (${formatPercent(variance)} variance).`,
    };
  }

  return {
    field: "enterprise-value",
    status: "reconciled",
    sources: ["finnhub", "fmp"],
    note: `Finnhub and FMP enterprise values reconcile within tolerance (${formatPercent(variance)} variance).`,
  };
}

function checkCashDebt(metrics: readonly FinancialMetric[]): ReconciliationCheck {
  const cash = metricNumber(metrics, "Cash and Equivalents") ?? metricNumber(metrics, "Cash");
  const debt = metricNumber(metrics, "Total Debt") ?? metricNumber(metrics, "Debt");

  if (cash === null && debt === null) {
    return {
      field: "cash-debt",
      status: "unavailable",
      sources: [],
      note: "Cash and debt were not both available as structured metrics, so net-debt reconciliation was skipped.",
    };
  }

  if (cash === null || debt === null) {
    return {
      field: "cash-debt",
      status: "partial",
      sources: ["sec-edgar"],
      note: "Only one side of cash/debt was available, so net-debt reconciliation is partial.",
    };
  }

  return {
    field: "cash-debt",
    status: "reconciled",
    sources: ["sec-edgar"],
    note: `Cash (${formatCurrency(cash)}) and debt (${formatCurrency(debt)}) are both available for net-debt checks.`,
  };
}

function checkCurrency(metrics: readonly FinancialMetric[]): ReconciliationCheck {
  const currencyLabels = metrics
    .filter((metric) => metric.format === "currency")
    .map((metric) => metric.label.toUpperCase());
  const hasUsd = currencyLabels.some((label) => label.includes("USD"));
  const hasGbp = currencyLabels.some((label) => label.includes("GBP") || label.includes("£"));

  if (!hasUsd && !hasGbp) {
    return {
      field: "currency",
      status: "unavailable",
      sources: [],
      note: "No explicit currency labels were attached to structured currency metrics.",
    };
  }

  if (hasUsd && hasGbp) {
    return {
      field: "currency",
      status: "unresolved",
      sources: [],
      note: "Structured currency metrics mix USD and GBP labels without an FX conversion layer.",
    };
  }

  return {
    field: "currency",
    status: "reconciled",
    sources: [],
    note: `Structured currency metrics use a single detected currency family (${hasUsd ? "USD" : "GBP"}).`,
  };
}

function checkDateAlignment(result: WaterfallResult): ReconciliationCheck {
  const finnhubFetchedAt = result.finnhub?.fetchedAt ?? null;
  const fmpFetchedAt = result.fmp?.fetchedAt ?? null;

  if (finnhubFetchedAt === null || fmpFetchedAt === null) {
    return {
      field: "date-alignment",
      status: "unavailable",
      sources: availableSources(["finnhub", "fmp"], result),
      note: "Source timestamp reconciliation needs both Finnhub and FMP fetch timestamps.",
    };
  }

  const finnhubTimestamp = Date.parse(finnhubFetchedAt);
  const fmpTimestamp = Date.parse(fmpFetchedAt);

  if (Number.isNaN(finnhubTimestamp) || Number.isNaN(fmpTimestamp)) {
    return {
      field: "date-alignment",
      status: "partial",
      sources: ["finnhub", "fmp"],
      note: "At least one source timestamp could not be parsed cleanly.",
    };
  }

  const days = Math.abs(finnhubTimestamp - fmpTimestamp) / MS_PER_DAY;

  if (days > SOURCE_DATE_ALIGNMENT_DAYS) {
    return {
      field: "date-alignment",
      status: "partial",
      sources: ["finnhub", "fmp"],
      note: `Finnhub quote and FMP valuation dates are ${days.toFixed(0)} days apart.`,
    };
  }

  return {
    field: "date-alignment",
    status: "reconciled",
    sources: ["finnhub", "fmp"],
    note: `Finnhub quote and FMP valuation dates are aligned within ${SOURCE_DATE_ALIGNMENT_DAYS} days.`,
  };
}

function availableSources(
  sources: readonly DataSource[],
  result: WaterfallResult,
): readonly DataSource[] {
  return sources.filter((source) => result.activeSources.includes(source));
}

export function reconcileSources(
  waterfallResult: WaterfallResult,
  metrics: readonly FinancialMetric[],
): ReconciliationStatus {
  const checks = [
    checkMarketCap(waterfallResult),
    checkShareCount(waterfallResult),
    checkEnterpriseValue(waterfallResult),
    checkCashDebt(metrics),
    checkCurrency(metrics),
    checkDateAlignment(waterfallResult),
  ];
  const hasUnresolved = checks.some((check) => check.status === "unresolved");
  const hasPartial = checks.some((check) => check.status === "partial");
  const overall = hasUnresolved ? "failed" : hasPartial ? "partial" : "clean";

  return {
    overall,
    checks,
    blocksValuationView: overall === "failed",
  };
}
