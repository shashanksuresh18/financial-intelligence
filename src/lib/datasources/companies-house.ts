import type {
  ApiResult,
  CompaniesHouseAddress,
  CompaniesHouseAccounts,
  CompaniesHouseCompany,
  CompaniesHouseData,
  CompaniesHouseFiling,
  CompaniesHouseProfile,
  CompaniesHouseSearchResponse,
} from "@/lib/types";
import { buildCompanySearchVariants } from "@/lib/company-search";

const BASE_URL = "https://api.company-information.service.gov.uk";
const MAX_RESULTS = 5;
const LEGAL_SUFFIXES = new Set([
  "co",
  "company",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "limited",
  "llc",
  "llp",
  "ltd",
  "plc",
]);

function getApiKey(): string {
  return process.env.COMPANIES_HOUSE_API_KEY ?? "";
}

function buildAuthHeader(): string {
  return `Basic ${btoa(`${getApiKey()}:`)}`;
}

function buildSearchUrl(query: string): string {
  return `${BASE_URL}/search/companies?q=${encodeURIComponent(query)}&items_per_page=${MAX_RESULTS}`;
}

function buildCompanyProfileUrl(companyNumber: string): string {
  return `${BASE_URL}/company/${encodeURIComponent(companyNumber)}`;
}

function buildFilingHistoryUrl(companyNumber: string): string {
  return `${BASE_URL}/company/${encodeURIComponent(companyNumber)}/filing-history?category=accounts&items_per_page=5`;
}

async function fetchCompaniesHouse<T>(url: string): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Authorization: buildAuthHeader(),
        Accept: "application/json",
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

    return {
      success: true,
      data: data as T,
    };
  } catch {
    return {
      success: false,
      error: "Invalid JSON from Companies House",
    };
  }
}

function normalizeAddress(value: unknown): CompaniesHouseAddress {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const address = value as Record<string, unknown>;
  const addressLine1 = address["address_line_1"];
  const addressLine2 = address["address_line_2"];
  const locality = address["locality"];
  const postalCode = address["postal_code"];
  const country = address["country"];

  return {
    address_line_1:
      typeof addressLine1 === "string" ? addressLine1 : undefined,
    address_line_2:
      typeof addressLine2 === "string" ? addressLine2 : undefined,
    locality: typeof locality === "string" ? locality : undefined,
    postal_code: typeof postalCode === "string" ? postalCode : undefined,
    country: typeof country === "string" ? country : undefined,
  };
}

function normalizeCompanyKey(value: string): string {
  const tokens = value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1] ?? "")) {
    tokens.pop();
  }

  return tokens.join(" ");
}

function normalizeAccounts(value: unknown): CompaniesHouseAccounts | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const accounts = value as Record<string, unknown>;
  const accountingReferenceDate =
    typeof accounts["accounting_reference_date"] === "object" &&
      accounts["accounting_reference_date"] !== null
      ? accounts["accounting_reference_date"] as Record<string, unknown>
      : null;
  const lastAccounts =
    typeof accounts["last_accounts"] === "object" &&
      accounts["last_accounts"] !== null
      ? accounts["last_accounts"] as Record<string, unknown>
      : null;
  const nextAccounts =
    typeof accounts["next_accounts"] === "object" &&
      accounts["next_accounts"] !== null
      ? accounts["next_accounts"] as Record<string, unknown>
      : null;

  return {
    ...(accountingReferenceDate !== null
      ? {
        accounting_reference_date: {
          day:
            typeof accountingReferenceDate["day"] === "string"
              ? accountingReferenceDate["day"]
              : undefined,
          month:
            typeof accountingReferenceDate["month"] === "string"
              ? accountingReferenceDate["month"]
              : undefined,
        },
      }
      : {}),
    ...(lastAccounts !== null
      ? {
        last_accounts: {
          made_up_to:
            typeof lastAccounts["made_up_to"] === "string"
              ? lastAccounts["made_up_to"]
              : undefined,
          period_start_on:
            typeof lastAccounts["period_start_on"] === "string"
              ? lastAccounts["period_start_on"]
              : undefined,
          period_end_on:
            typeof lastAccounts["period_end_on"] === "string"
              ? lastAccounts["period_end_on"]
              : undefined,
          type:
            typeof lastAccounts["type"] === "string"
              ? lastAccounts["type"]
              : undefined,
        },
      }
      : {}),
    ...(nextAccounts !== null
      ? {
        next_accounts: {
          due_on:
            typeof nextAccounts["due_on"] === "string"
              ? nextAccounts["due_on"]
              : undefined,
          overdue:
            typeof nextAccounts["overdue"] === "boolean"
              ? nextAccounts["overdue"]
              : undefined,
          period_start_on:
            typeof nextAccounts["period_start_on"] === "string"
              ? nextAccounts["period_start_on"]
              : undefined,
          period_end_on:
            typeof nextAccounts["period_end_on"] === "string"
              ? nextAccounts["period_end_on"]
              : undefined,
        },
      }
      : {}),
    next_due:
      typeof accounts["next_due"] === "string" ? accounts["next_due"] : undefined,
  };
}

function isRelevantCompanyMatch(query: string, candidate: string): boolean {
  const normalizedQuery = normalizeCompanyKey(query);
  const normalizedCandidate = normalizeCompanyKey(candidate);

  if (normalizedQuery.length === 0 || normalizedCandidate.length === 0) {
    return false;
  }

  return (
    normalizedCandidate === normalizedQuery ||
    normalizedCandidate.startsWith(`${normalizedQuery} `) ||
    normalizedQuery.startsWith(`${normalizedCandidate} `)
  );
}

function normalizeCompany(value: unknown): CompaniesHouseCompany | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const company = value as Record<string, unknown>;
  const companyNumber = company["company_number"];
  const companyName = company["company_name"] ?? company["title"];

  if (
    typeof companyNumber !== "string" ||
    companyNumber.length === 0 ||
    typeof companyName !== "string"
  ) {
    return null;
  }

  const companyStatus = company["company_status"];
  const companyType = company["company_type"];
  const dateOfCreation = company["date_of_creation"];
  const description = company["description"];

  return {
    company_number: companyNumber,
    company_name: companyName,
    company_status: typeof companyStatus === "string" ? companyStatus : "",
    company_type: typeof companyType === "string" ? companyType : "",
    date_of_creation:
      typeof dateOfCreation === "string" ? dateOfCreation : "",
    description: typeof description === "string" ? description : "",
    registered_office_address: normalizeAddress(
      company["registered_office_address"] ?? company["address"],
    ),
  };
}

function normalizeCompanyProfile(value: unknown): CompaniesHouseProfile | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const profile = value as Record<string, unknown>;
  const companyNumber = profile["company_number"];
  const companyName = profile["company_name"];
  const companyStatus = profile["company_status"];
  const companyType = profile["type"];

  if (
    typeof companyNumber !== "string" ||
    typeof companyName !== "string" ||
    typeof companyStatus !== "string" ||
    typeof companyType !== "string"
  ) {
    return null;
  }

  return {
    company_number: companyNumber,
    company_name: companyName,
    company_status: companyStatus,
    company_type: companyType,
    date_of_creation:
      typeof profile["date_of_creation"] === "string"
        ? profile["date_of_creation"]
        : undefined,
    jurisdiction:
      typeof profile["jurisdiction"] === "string"
        ? profile["jurisdiction"]
        : undefined,
    sic_codes: Array.isArray(profile["sic_codes"])
      ? profile["sic_codes"].filter((item): item is string => typeof item === "string")
      : [],
    registered_office_address: normalizeAddress(profile["registered_office_address"]),
    accounts: normalizeAccounts(profile["accounts"]),
  };
}

function normalizeSearchResponse(
  value: unknown,
): CompaniesHouseSearchResponse | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const response = value as Record<string, unknown>;
  const items = response["items"];

  if (!Array.isArray(items)) {
    return null;
  }

  const totalResults = response["total_results"];
  const startIndex = response["start_index"];
  const itemsPerPage = response["items_per_page"];
  const kind = response["kind"];

  return {
    items: items
      .map(normalizeCompany)
      .filter(
        (company): company is CompaniesHouseCompany => company !== null,
      ),
    total_results:
      typeof totalResults === "number" ? totalResults : 0,
    start_index: typeof startIndex === "number" ? startIndex : 0,
    items_per_page:
      typeof itemsPerPage === "number" ? itemsPerPage : 0,
    kind: typeof kind === "string" ? kind : "",
  };
}

function normalizeFilingHistory(value: unknown): readonly CompaniesHouseFiling[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const response = value as Record<string, unknown>;
  const items = response["items"];

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item): CompaniesHouseFiling | null => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const filing = item as Record<string, unknown>;
      const links =
        typeof filing["links"] === "object" && filing["links"] !== null
          ? filing["links"] as Record<string, unknown>
          : null;

      if (
        typeof filing["date"] !== "string" ||
        typeof filing["category"] !== "string" ||
        typeof filing["type"] !== "string"
      ) {
        return null;
      }

      return {
        date: filing["date"],
        category: filing["category"],
        type: filing["type"],
        description:
          typeof filing["description"] === "string"
            ? filing["description"]
            : "accounts-filing",
        pages:
          typeof filing["pages"] === "number" ? filing["pages"] : undefined,
        document_metadata:
          links !== null && typeof links["document_metadata"] === "string"
            ? links["document_metadata"]
            : undefined,
      };
    })
    .filter((item): item is CompaniesHouseFiling => item !== null);
}

function pickBestMatch(
  companies: readonly CompaniesHouseCompany[],
  query: string,
): CompaniesHouseCompany | null {
  const relevantCompanies = companies.filter((company) =>
    isRelevantCompanyMatch(query, company.company_name)
  );

  if (relevantCompanies.length === 0) {
    return null;
  }

  const normalizedQuery = normalizeCompanyKey(query);
  const exactMatch = relevantCompanies.find(
    (company) => normalizeCompanyKey(company.company_name) === normalizedQuery,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const activeMatch = relevantCompanies.find(
    (company) => company.company_status === "active",
  );

  if (activeMatch) {
    return activeMatch;
  }

  return relevantCompanies[0] ?? null;
}

export async function fetchCompaniesHouseData(
  query: string,
): Promise<ApiResult<CompaniesHouseData>> {
  const variants = buildCompanySearchVariants(query);
  const variantResults = await Promise.all(
    variants.map(async (variant) => {
      const url = buildSearchUrl(variant);
      const result = await fetchCompaniesHouse<unknown>(url);

      if (!result.success) {
        console.error("[companies-house] fetchCompaniesHouse failed", {
          query,
          variant,
          error: result.error,
        });

        return [] as readonly CompaniesHouseCompany[];
      }

      const normalized = normalizeSearchResponse(result.data);

      if (normalized === null) {
        console.error("[companies-house] invalid response shape", {
          query,
          variant,
        });

        return [] as readonly CompaniesHouseCompany[];
      }

      return normalized.items;
    }),
  );

  const allMatches = variantResults
    .flat()
    .reduce<CompaniesHouseCompany[]>((accumulator, company) => {
      if (
        accumulator.some(
          (item) => item.company_number === company.company_number,
        )
      ) {
        return accumulator;
      }

      return [...accumulator, company];
    }, []);

  if (allMatches.length === 0) {
    console.error("[companies-house] no results", { query, variants });

    return {
      success: false,
      error: `No Companies House results for: "${query}"`,
    };
  }

  const company = pickBestMatch(allMatches, query);
  let profile: CompaniesHouseProfile | null = null;
  let accountsFilings: readonly CompaniesHouseFiling[] = [];

  if (company !== null) {
    const [profileResult, filingResult] = await Promise.all([
      fetchCompaniesHouse<unknown>(buildCompanyProfileUrl(company.company_number)),
      fetchCompaniesHouse<unknown>(buildFilingHistoryUrl(company.company_number)),
    ]);

    if (profileResult.success) {
      profile = normalizeCompanyProfile(profileResult.data);
    } else {
      console.error("[companies-house] company profile failed", {
        query,
        companyNumber: company.company_number,
        error: profileResult.error,
      });
    }

    if (filingResult.success) {
      accountsFilings = normalizeFilingHistory(filingResult.data);
    } else {
      console.error("[companies-house] filing history failed", {
        query,
        companyNumber: company.company_number,
        error: filingResult.error,
      });
    }
  }

  return {
    success: true,
    data: {
      company,
      allMatches,
      profile,
      accountsFilings,
    },
  };
}
