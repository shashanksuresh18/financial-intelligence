import type {
  DataSource,
  EntityIdentifier,
  EntityResolution,
  WaterfallResult,
} from "@/lib/types";

function addEntityIdentifier(
  identifiers: EntityIdentifier[],
  identifier: EntityIdentifier | null,
): void {
  if (identifier === null) {
    return;
  }

  const duplicate = identifiers.some(
    (item) =>
      item.label === identifier.label &&
      item.value === identifier.value &&
      item.source === identifier.source,
  );

  if (!duplicate) {
    identifiers.push(identifier);
  }
}

function normalizeEntityName(value: string): string {
  return value
    .toUpperCase()
    .normalize("NFKC")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function hasUkLegalSuffix(value: string): boolean {
  const normalized = normalizeEntityName(value);

  return (
    normalized.endsWith(" PLC") ||
    normalized.endsWith(" LTD") ||
    normalized.endsWith(" LIMITED") ||
    normalized.endsWith(" LLP") ||
    normalized.endsWith(" LP")
  );
}

function shouldUseCompaniesHouseCorroboration(params: {
  query: string;
  finnhubName: string | null;
  companiesHouseCompany: {
    readonly company_name: string;
    readonly company_status: string;
  } | null;
}): boolean {
  const { query, finnhubName, companiesHouseCompany } = params;

  if (companiesHouseCompany === null) {
    return false;
  }

  if (finnhubName === null) {
    return true;
  }

  if (
    normalizeEntityName(finnhubName) !==
    normalizeEntityName(companiesHouseCompany.company_name)
  ) {
    return false;
  }

  if (companiesHouseCompany.company_status.toLowerCase() !== "active") {
    return false;
  }

  return (
    hasUkLegalSuffix(query) ||
    hasUkLegalSuffix(finnhubName) ||
    hasUkLegalSuffix(companiesHouseCompany.company_name)
  );
}

export function buildEntityResolution(
  query: string,
  result: WaterfallResult,
): EntityResolution {
  const secName =
    result.secEdgar?.data.companyInfo?.name ??
    result.secEdgar?.data.xbrlFacts?.entityName ??
    null;
  const rawCompaniesHouseCompany = result.companiesHouse?.data.company ?? null;
  const gleifRecord = result.gleif?.data.record ?? null;
  const gleifName = gleifRecord?.attributes.entity.legalName.name ?? null;
  const finnhubSymbol = result.finnhub?.data.symbol ?? null;
  const finnhubName = result.finnhub?.data.companyName ?? null;
  const companiesHouseCompany = shouldUseCompaniesHouseCorroboration({
    query,
    finnhubName,
    companiesHouseCompany: rawCompaniesHouseCompany,
  })
    ? rawCompaniesHouseCompany
    : null;

  const canonicalName =
    secName ??
    finnhubName ??
    companiesHouseCompany?.company_name ??
    gleifName ??
    query;
  const primarySource: DataSource | null =
    secName !== null
      ? "sec-edgar"
      : finnhubName !== null
        ? "finnhub"
        : companiesHouseCompany !== null
          ? "companies-house"
          : gleifName !== null
            ? "gleif"
            : finnhubSymbol !== null
              ? "finnhub"
              : result.claudeFallback !== null
                ? "claude-fallback"
                : null;

  const identifiers: EntityIdentifier[] = [];

  addEntityIdentifier(identifiers, {
    label: "Canonical Name",
    value: canonicalName,
    source: primarySource ?? "claude-fallback",
  });

  if (result.secEdgar?.data.companyInfo?.tickers.length) {
    for (const ticker of result.secEdgar.data.companyInfo.tickers.slice(0, 2)) {
      addEntityIdentifier(identifiers, {
        label: "Ticker",
        value: ticker,
        source: "sec-edgar",
      });
    }
  } else if (finnhubSymbol !== null) {
    addEntityIdentifier(identifiers, {
      label: "Ticker",
      value: finnhubSymbol,
      source: "finnhub",
    });
  }

  if (result.secEdgar?.data.cik) {
    addEntityIdentifier(identifiers, {
      label: "CIK",
      value: result.secEdgar.data.cik,
      source: "sec-edgar",
    });
  }

  if (result.secEdgar?.data.companyInfo?.exchanges.length) {
    addEntityIdentifier(identifiers, {
      label: "Exchange",
      value: result.secEdgar.data.companyInfo.exchanges.join(", "),
      source: "sec-edgar",
    });
  }

  if (companiesHouseCompany !== null) {
    addEntityIdentifier(identifiers, {
      label: "Company Number",
      value: companiesHouseCompany.company_number,
      source: "companies-house",
    });
    addEntityIdentifier(identifiers, {
      label: "Status",
      value: companiesHouseCompany.company_status,
      source: "companies-house",
    });

    const jurisdiction =
      companiesHouseCompany.registered_office_address.country ?? "United Kingdom";

    addEntityIdentifier(identifiers, {
      label: "Jurisdiction",
      value: jurisdiction,
      source: "companies-house",
    });
  }

  if (gleifRecord !== null) {
    addEntityIdentifier(identifiers, {
      label: "LEI",
      value: gleifRecord.attributes.lei,
      source: "gleif",
    });
    addEntityIdentifier(identifiers, {
      label: "Jurisdiction",
      value: gleifRecord.attributes.entity.jurisdiction,
      source: "gleif",
    });
    addEntityIdentifier(identifiers, {
      label: "Status",
      value: gleifRecord.attributes.registration.status,
      source: "gleif",
    });
  }

  const matchedSources = [...new Set(identifiers.map((item) => item.source))];
  const note =
    primarySource === "sec-edgar"
      ? matchedSources.length > 1
        ? "Resolved against SEC EDGAR with corroborating market and registry identifiers."
        : "Resolved primarily from SEC EDGAR filing metadata."
      : primarySource === "finnhub"
        ? companiesHouseCompany !== null || gleifRecord !== null
          ? "Resolved through market-symbol mapping with secondary registry corroboration."
          : "Resolved through market-symbol mapping; filing and registry corroboration are limited."
        : primarySource === "companies-house"
          ? gleifRecord !== null
            ? "Resolved through UK registry records with LEI corroboration."
            : "Resolved through Companies House registry records."
          : primarySource === "gleif"
            ? "Resolved through LEI registry data with limited filing corroboration."
            : "Resolution depends primarily on the original query and fallback evidence.";

  return {
    displayName: canonicalName,
    canonicalName,
    primarySource,
    matchedSources,
    identifiers,
    note,
  };
}
