import type {
  DataSource,
  ValidationCoverageLabel,
  ValidationCrossCheck,
  ValidationGap,
  ValidationReport,
  ValidationSeverity,
  ValidationTension,
  WaterfallResult,
} from "@/lib/types";
import {
  extractLatestFact,
  REVENUE_CONCEPTS,
} from "@/lib/datasources/sec-edgar";
import { scoreCompanyNameMatch } from "@/lib/company-search";

const DAY_MS = 86_400_000;
const COMPANY_NAME_MATCH_THRESHOLD = 70;

const CHECK_ENTITY_NAME_CONSISTENCY = "Entity name consistency";
const CHECK_SEC_COMPANIES_HOUSE_ENTITY_MISMATCH =
  "Companies House and SEC reference different entities";
const CHECK_REVENUE = "Revenue — FMP vs SEC";
const CHECK_MARKET_CAP = "Market cap — Finnhub vs FMP";
const CHECK_EARNINGS_DIRECTION = "Earnings direction vs consensus";
const CHECK_COMPANY_STATUS = "Company status — active";
const CHECK_FILING_FRESHNESS = "Filing freshness";
const CHECK_TICKER_IDENTIFIER = "Ticker identifier consistency";

function buildCoverageLabel(result: WaterfallResult): ValidationCoverageLabel {
  if (result.finnhub?.data.isAmbiguous === true) {
    return "Ambiguous Entity";
  }

  if (
    result.secEdgar !== null &&
    result.fmp !== null &&
    result.finnhub !== null
  ) {
    return "Strong Public";
  }

  if (
    result.exaDeep !== null &&
    result.finnhub === null &&
    result.fmp === null &&
    result.secEdgar === null
  ) {
    return "Limited Private";
  }

  if (
    result.claudeFallback !== null &&
    result.finnhub === null &&
    result.fmp === null &&
    result.secEdgar === null &&
    result.companiesHouse === null &&
    result.gleif === null &&
    result.exaDeep === null
  ) {
    return "Thin";
  }

  if (result.companiesHouse !== null || result.gleif !== null) {
    return "Registry-led";
  }

  return "Thin";
}

function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(
      /(?:\b(?:INC\.?|CORP\.?|LLC\.?|LTD\.?|PLC\.?|AG|SA|NV|BV|GMBH|SE|KG|AB|ASA|OYJ)\b\.?\s*)+$/g,
      "",
    )
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function formatRevenue(value: number): string {
  return Math.abs(value) >= 1_000_000_000
    ? `${(value / 1_000_000_000).toFixed(1)}B`
    : `${(value / 1_000_000).toFixed(0)}M`;
}

function runEntityNameConsistencyCheck(
  result: WaterfallResult,
): ValidationCrossCheck | null {
  const nameEntries: Array<{
    readonly source: "finnhub" | "sec-edgar" | "companies-house" | "gleif";
    readonly name: string;
    readonly token: string;
  }> = [];

  const finnhubName = result.finnhub?.data.companyName ?? null;

  if (finnhubName !== null) {
    const normalizedName = normalizeCompanyName(finnhubName);

    nameEntries.push({
      source: "finnhub",
      name: finnhubName,
      token: normalizedName.split(" ")[0] ?? "",
    });
  }

  const secName =
    result.secEdgar?.data.companyInfo?.name ??
    result.secEdgar?.data.xbrlFacts?.entityName ??
    null;

  if (secName !== null) {
    const normalizedName = normalizeCompanyName(secName);

    nameEntries.push({
      source: "sec-edgar",
      name: secName,
      token: normalizedName.split(" ")[0] ?? "",
    });
  }

  const companiesHouseName =
    result.companiesHouse?.data.company?.company_name ?? null;

  if (companiesHouseName !== null) {
    const normalizedName = normalizeCompanyName(companiesHouseName);

    nameEntries.push({
      source: "companies-house",
      name: companiesHouseName,
      token: normalizedName.split(" ")[0] ?? "",
    });
  }

  const gleifName =
    result.gleif?.data.record?.attributes.entity.legalName.name ?? null;

  if (gleifName !== null) {
    const normalizedName = normalizeCompanyName(gleifName);

    nameEntries.push({
      source: "gleif",
      name: gleifName,
      token: normalizedName.split(" ")[0] ?? "",
    });
  }

  if (nameEntries.length === 0) {
    return null;
  }

  const uniqueTokens = new Set(
    nameEntries
      .map((entry) => entry.token)
      .filter((token) => token.length > 0),
  );
  const passed = nameEntries.length <= 1 || uniqueTokens.size <= 1;

  return {
    check: CHECK_ENTITY_NAME_CONSISTENCY,
    passed,
    detail: passed
      ? `Entity names are consistent across ${nameEntries.length} sources.`
      : `Name mismatch: ${nameEntries
        .map((entry) => `${entry.source}:${entry.name}`)
        .join(", ")}.`,
    sources: nameEntries.map((entry) => entry.source),
  };
}

function runRevenueCheck(result: WaterfallResult): ValidationCrossCheck | null {
  if (result.secEdgar === null || result.fmp === null) {
    return null;
  }

  if (result.secEdgar.data.xbrlFacts === null) {
    return null;
  }

  const secRevenue = extractLatestFact(
    result.secEdgar.data.xbrlFacts,
    REVENUE_CONCEPTS,
  );
  const fmpRevenue =
    result.fmp.data.analystEstimates[0]?.estimatedRevenueAvg ?? null;

  if (
    secRevenue === null ||
    fmpRevenue === null ||
    secRevenue === 0 ||
    fmpRevenue === 0
  ) {
    return null;
  }

  const divergencePct =
    (Math.abs(secRevenue - fmpRevenue) /
      Math.max(Math.abs(secRevenue), Math.abs(fmpRevenue))) *
    100;

  return {
    check: CHECK_REVENUE,
    passed: divergencePct <= 5,
    detail: `SEC trailing revenue ${formatRevenue(secRevenue)} vs FMP forward estimate ${formatRevenue(fmpRevenue)} (${divergencePct.toFixed(1)}% gap; period mismatch expected).`,
    sources: ["sec-edgar", "fmp"],
  };
}

function getSecEntityName(result: WaterfallResult): string | null {
  return (
    result.secEdgar?.data.companyInfo?.name ??
    result.secEdgar?.data.xbrlFacts?.entityName ??
    null
  );
}

function getCompaniesHouseEntityName(result: WaterfallResult): string | null {
  return (
    result.companiesHouse?.data.profile?.company_name ??
    result.companiesHouse?.data.company?.company_name ??
    null
  );
}

function runSecCompaniesHouseEntityCheck(
  result: WaterfallResult,
): ValidationCrossCheck | null {
  if (result.secEdgar === null || result.companiesHouse === null) {
    return null;
  }

  const secName = getSecEntityName(result);
  const companiesHouseName = getCompaniesHouseEntityName(result);

  if (secName === null || companiesHouseName === null) {
    return null;
  }

  const matchScore = Math.max(
    scoreCompanyNameMatch(secName, companiesHouseName),
    scoreCompanyNameMatch(companiesHouseName, secName),
  );
  const passed = matchScore >= COMPANY_NAME_MATCH_THRESHOLD;

  return {
    check: CHECK_SEC_COMPANIES_HOUSE_ENTITY_MISMATCH,
    passed,
    detail: passed
      ? `SEC filer "${secName}" and Companies House company "${companiesHouseName}" clear the ${COMPANY_NAME_MATCH_THRESHOLD}-point match threshold.`
      : `SEC filer "${secName}" and Companies House company "${companiesHouseName}" score ${matchScore}, below the ${COMPANY_NAME_MATCH_THRESHOLD}-point match threshold; Companies House is likely the wrong entity.`,
    sources: ["sec-edgar", "companies-house"],
    ...(passed ? {} : { flag: "likely_wrong_entity" as const }),
  };
}

function runMarketCapCheck(result: WaterfallResult): ValidationCrossCheck | null {
  if (result.finnhub === null || result.fmp === null) {
    return null;
  }

  const finnhubMarketCap =
    result.finnhub.data.basicFinancials?.metric.marketCapitalization ?? null;
  const fmpMarketCap =
    result.fmp.data.enterpriseValues[0]?.marketCapitalization ?? null;

  if (
    finnhubMarketCap === null ||
    fmpMarketCap === null ||
    finnhubMarketCap === 0 ||
    fmpMarketCap === 0
  ) {
    return null;
  }

  const fmpMarketCapMillions = fmpMarketCap / 1_000_000;
  const divergencePct =
    (Math.abs(finnhubMarketCap - fmpMarketCapMillions) /
      Math.max(finnhubMarketCap, fmpMarketCapMillions)) *
    100;

  return {
    check: CHECK_MARKET_CAP,
    passed: divergencePct <= 2,
    detail: `Finnhub market cap ${finnhubMarketCap.toFixed(0)}M vs FMP ${fmpMarketCapMillions.toFixed(0)}M (${divergencePct.toFixed(1)}% gap).`,
    sources: ["finnhub", "fmp"],
  };
}

function runEarningsDirectionCheck(
  result: WaterfallResult,
): ValidationCrossCheck | null {
  if (result.finnhub === null) {
    return null;
  }

  const latestEarnings = result.finnhub.data.earnings[0] ?? null;
  const latestRecommendation =
    [...result.finnhub.data.recommendations].sort((left, right) =>
      right.period.localeCompare(left.period),
    )[0] ?? null;

  if (
    latestEarnings === null ||
    latestRecommendation === null ||
    latestEarnings.surprisePercent === null
  ) {
    return null;
  }

  const surprisePercent = latestEarnings.surprisePercent;
  const consensusBullish =
    latestRecommendation.strongBuy + latestRecommendation.buy >
    latestRecommendation.strongSell + latestRecommendation.sell;
  const passed = !(
    (surprisePercent < -10 && consensusBullish) ||
    (surprisePercent > 10 && !consensusBullish)
  );

  return {
    check: CHECK_EARNINGS_DIRECTION,
    passed,
    detail: `${latestEarnings.period} surprise ${surprisePercent.toFixed(1)}% vs consensus ${consensusBullish ? "bullish" : "bearish"}.`,
    sources: ["finnhub"],
  };
}

function runCompanyStatusCheck(
  result: WaterfallResult,
): ValidationCrossCheck | null {
  const statuses: Array<{
    readonly source: "companies-house" | "gleif";
    readonly status: string;
    readonly isActive: boolean;
  }> = [];

  const companiesHouseStatus =
    result.companiesHouse?.data.company?.company_status ?? null;

  if (companiesHouseStatus !== null) {
    statuses.push({
      source: "companies-house",
      status: companiesHouseStatus,
      isActive: companiesHouseStatus === "active",
    });
  }

  const gleifStatus =
    result.gleif?.data.record?.attributes.registration.status ?? null;

  if (gleifStatus !== null) {
    statuses.push({
      source: "gleif",
      status: gleifStatus,
      isActive: gleifStatus === "ISSUED",
    });
  }

  if (statuses.length === 0) {
    return null;
  }

  return {
    check: CHECK_COMPANY_STATUS,
    passed: statuses.every((entry) => entry.isActive),
    detail: statuses
      .map((entry) => `${entry.source}:${entry.status}`)
      .join(", ")
      .concat("."),
    sources: statuses.map((entry) => entry.source),
  };
}

function runFilingFreshnessCheck(
  result: WaterfallResult,
): ValidationCrossCheck | null {
  const detailParts: string[] = [];
  const sources: DataSource[] = [];
  let passed = true;

  if (result.secEdgar !== null && result.secEdgar.data.recentFilings.length > 0) {
    const latestFiling = result.secEdgar.data.recentFilings[0];
    const daysSinceFiling =
      (Date.now() - new Date(latestFiling.filingDate).getTime()) / DAY_MS;
    const secFresh = daysSinceFiling <= 90;

    passed &&= secFresh;
    sources.push("sec-edgar");
    detailParts.push(
      `SEC latest filing ${daysSinceFiling.toFixed(0)} days ago (${secFresh ? "fresh" : "stale"})`,
    );
  }

  if (result.companiesHouse !== null) {
    const overdue =
      result.companiesHouse.data.profile?.accounts?.next_accounts?.overdue ??
      false;

    passed &&= !overdue;
    sources.push("companies-house");
    detailParts.push(`Companies House overdue=${overdue}`);
  }

  if (sources.length === 0) {
    return null;
  }

  return {
    check: CHECK_FILING_FRESHNESS,
    passed,
    detail: `${detailParts.join("; ")}.`,
    sources,
  };
}

function runTickerIdentifierCheck(
  result: WaterfallResult,
): ValidationCrossCheck | null {
  if (result.secEdgar === null || result.finnhub === null) {
    return null;
  }

  const secTickers = result.secEdgar.data.companyInfo?.tickers ?? [];

  if (secTickers.length === 0) {
    return null;
  }

  const finnhubSymbol = result.finnhub.data.symbol.toUpperCase();
  const secNormalized = secTickers.map((ticker) => ticker.toUpperCase());
  const passed =
    secNormalized.includes(finnhubSymbol) || finnhubSymbol.includes(".");

  return {
    check: CHECK_TICKER_IDENTIFIER,
    passed,
    detail: `SEC tickers [${secNormalized.join(", ")}] vs Finnhub symbol ${finnhubSymbol}.`,
    sources: ["sec-edgar", "finnhub"],
  };
}

function runCrossChecks(
  result: WaterfallResult,
): readonly ValidationCrossCheck[] {
  return [
    runEntityNameConsistencyCheck(result),
    runSecCompaniesHouseEntityCheck(result),
    runRevenueCheck(result),
    runMarketCapCheck(result),
    runEarningsDirectionCheck(result),
    runCompanyStatusCheck(result),
    runFilingFreshnessCheck(result),
    runTickerIdentifierCheck(result),
  ].filter(
    (check): check is ValidationCrossCheck => check !== null,
  );
}

function getTensionSeverity(check: string): ValidationSeverity {
  switch (check) {
    case CHECK_ENTITY_NAME_CONSISTENCY:
    case CHECK_SEC_COMPANIES_HOUSE_ENTITY_MISMATCH:
      return "high";
    case CHECK_REVENUE:
      return "medium";
    case CHECK_MARKET_CAP:
      return "medium";
    case CHECK_EARNINGS_DIRECTION:
      return "low";
    case CHECK_COMPANY_STATUS:
      return "high";
    case CHECK_FILING_FRESHNESS:
      return "medium";
    case CHECK_TICKER_IDENTIFIER:
      return "medium";
    default:
      return "low";
  }
}

function detectTensions(
  crossChecks: readonly ValidationCrossCheck[],
): readonly ValidationTension[] {
  return crossChecks
    .filter((crossCheck) => !crossCheck.passed)
    .map((crossCheck) => ({
      check: crossCheck.check,
      detail: crossCheck.detail,
      sources: crossCheck.sources,
      severity: getTensionSeverity(crossCheck.check),
      ...(crossCheck.flag !== undefined ? { flag: crossCheck.flag } : {}),
    }));
}

function detectGaps(result: WaterfallResult): readonly ValidationGap[] {
  const gaps: ValidationGap[] = [];
  const finnhubSymbol = result.finnhub?.data.symbol.toUpperCase() ?? null;
  const finnhubMarketCap =
    result.finnhub?.data.basicFinancials?.metric.marketCapitalization ?? 0;
  const secXbrlFacts = result.secEdgar?.data.xbrlFacts ?? null;

  if (
    finnhubSymbol !== null &&
    !finnhubSymbol.includes(".") &&
    secXbrlFacts === null
  ) {
    gaps.push({
      gap: "No SEC XBRL for US-listed company",
      detail: `${finnhubSymbol} appears to be a US listing but SEC EDGAR returned no structured XBRL facts. Filing-backed financials are unavailable.`,
      severity: "high",
    });
  }

  const gleifJurisdiction =
    result.gleif?.data.record?.attributes.entity.jurisdiction.toUpperCase() ??
    null;
  const looksUkFromGleif =
    gleifJurisdiction !== null && gleifJurisdiction.startsWith("GB");
  const looksUkFromFinnhub = finnhubSymbol?.endsWith(".L") ?? false;

  if ((looksUkFromGleif || looksUkFromFinnhub) && result.companiesHouse === null) {
    const reason = looksUkFromGleif
      ? `GLEIF jurisdiction ${gleifJurisdiction}`
      : `Finnhub symbol ${finnhubSymbol}`;

    gaps.push({
      gap: "No Companies House data for UK entity",
      detail: `Entity appears UK-registered (${reason}) but Companies House lookup returned no results.`,
      severity: "high",
    });
  }

  if (
    result.finnhub !== null &&
    finnhubMarketCap > 5000 &&
    result.finnhub.data.recommendations.length === 0
  ) {
    gaps.push({
      gap: "No analyst coverage despite market cap >$5B",
      detail: `Market cap of ${finnhubMarketCap}M exceeds the $5B threshold but no analyst recommendations were found.`,
      severity: "medium",
    });
  }

  if (result.finnhub !== null) {
    const latestNewsTimestamp = result.finnhub.data.news.reduce(
      (latest, item) => Math.max(latest, item.datetime * 1000),
      0,
    );

    if (
      result.finnhub.data.news.length === 0 ||
      latestNewsTimestamp < Date.now() - 30 * DAY_MS
    ) {
      gaps.push({
        gap: "No news coverage in the past 30 days",
        detail: "Finnhub returned no headlines dated within the last 30 days, which limits freshness for monitoring scenarios.",
        severity: "medium",
      });
    }
  }

  if (
    result.exaDeep !== null &&
    result.exaDeep.data.fundingTotal === null &&
    result.exaDeep.data.lastValuation === null
  ) {
    gaps.push({
      gap: "Exa Deep result missing funding or valuation data",
      detail: "Exa Deep Research identified the company but returned neither a funding total nor a last-known valuation, limiting private-company financial context.",
      severity: "medium",
    });
  }

  return gaps;
}

function computeDataQualityScore(
  tensions: readonly ValidationTension[],
  gaps: readonly ValidationGap[],
): number {
  let score = 100;

  score -= tensions.filter((tension) => tension.severity === "high").length * 20;
  score -=
    tensions.filter((tension) => tension.severity === "medium").length * 10;
  score -= gaps.filter((gap) => gap.severity === "high").length * 15;
  score -= gaps.filter((gap) => gap.severity === "medium").length * 5;

  return Math.max(0, score);
}

export function validateWaterfall(result: WaterfallResult): ValidationReport {
  const coverageLabel = buildCoverageLabel(result);
  const crossChecks = runCrossChecks(result);
  const tensions = detectTensions(crossChecks);
  const gaps = detectGaps(result);
  const dataQualityScore = computeDataQualityScore(tensions, gaps);

  return {
    coverageLabel,
    dataQualityScore,
    tensions,
    gaps,
    crossChecks,
  };
}
