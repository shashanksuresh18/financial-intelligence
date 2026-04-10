import type {
  ApiResult,
  CompaniesHouseAddress,
  CompaniesHouseCompany,
  CompaniesHouseData,
  CompaniesHouseSearchResponse,
} from "@/lib/types";

const BASE_URL = "https://api.company-information.service.gov.uk";
const MAX_RESULTS = 5;

function getApiKey(): string {
  return process.env.COMPANIES_HOUSE_API_KEY ?? "";
}

function buildAuthHeader(): string {
  return `Basic ${btoa(`${getApiKey()}:`)}`;
}

function buildSearchUrl(query: string): string {
  return `${BASE_URL}/search/companies?q=${encodeURIComponent(query)}&items_per_page=${MAX_RESULTS}`;
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

function normalizeCompany(value: unknown): CompaniesHouseCompany | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const company = value as Record<string, unknown>;
  const companyNumber = company["company_number"];
  const companyName = company["company_name"];

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
      company["registered_office_address"],
    ),
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

function pickBestMatch(
  companies: readonly CompaniesHouseCompany[],
  query: string,
): CompaniesHouseCompany | null {
  if (companies.length === 0) {
    return null;
  }

  const normalizedQuery = query.toLowerCase();
  const exactMatch = companies.find(
    (company) => company.company_name.toLowerCase() === normalizedQuery,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const activeMatch = companies.find(
    (company) => company.company_status === "active",
  );

  if (activeMatch) {
    return activeMatch;
  }

  return companies[0] ?? null;
}

export async function fetchCompaniesHouseData(
  query: string,
): Promise<ApiResult<CompaniesHouseData>> {
  const url = buildSearchUrl(query);
  const result = await fetchCompaniesHouse<unknown>(url);

  if (!result.success) {
    console.error("[companies-house] fetchCompaniesHouse failed", {
      query,
      error: result.error,
    });

    return {
      success: false,
      error: result.error,
    };
  }

  const normalized = normalizeSearchResponse(result.data);

  if (normalized === null) {
    console.error("[companies-house] invalid response shape", { query });

    return {
      success: false,
      error: "Unexpected Companies House response shape",
    };
  }

  if (normalized.items.length === 0) {
    console.error("[companies-house] no results", { query });

    return {
      success: false,
      error: `No Companies House results for: "${query}"`,
    };
  }

  return {
    success: true,
    data: {
      company: pickBestMatch(normalized.items, query),
      allMatches: normalized.items,
    },
  };
}
