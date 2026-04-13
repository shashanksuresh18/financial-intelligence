import type {
  ApiResult,
  GleifAddress,
  GleifData,
  GleifEntity,
  GleifRecord,
  GleifRegistration,
  GleifSearchResponse,
} from "@/lib/types";
import { buildCompanySearchVariants } from "@/lib/company-search";

const BASE_URL = "https://api.gleif.org/api/v1";
const PAGE_SIZE = 5;

function buildSearchUrl(query: string): string {
  return `${BASE_URL}/lei-records?filter[fulltext]=${encodeURIComponent(query)}&page[size]=${PAGE_SIZE}&page[number]=1`;
}

async function fetchGleif<T>(url: string): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.api+json",
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
      error: "Invalid JSON from GLEIF",
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeGleifName(
  value: unknown,
): { name: string; language: string } | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = value["name"];
  const language = value["language"];

  if (typeof name !== "string" || name.trim().length === 0) {
    return null;
  }

  if (typeof language !== "string") {
    return null;
  }

  return {
    name,
    language,
  };
}

function normalizeGleifAddress(value: unknown): GleifAddress | null {
  if (!isRecord(value)) {
    return null;
  }

  const lang = value["lang"];
  const city = value["city"];
  const country = value["country"];
  const rawAddressLines = value["addressLines"];

  if (
    typeof lang !== "string" ||
    typeof city !== "string" ||
    typeof country !== "string" ||
    country.length !== 2
  ) {
    return null;
  }

  let addressLines: readonly string[] = [];

  if (rawAddressLines !== undefined) {
    if (!Array.isArray(rawAddressLines)) {
      return null;
    }

    if (!rawAddressLines.every((line) => typeof line === "string")) {
      return null;
    }

    addressLines = rawAddressLines;
  }

  const region = value["region"];
  const postalCode = value["postalCode"];

  return {
    lang,
    addressLines,
    city,
    region: typeof region === "string" ? region : undefined,
    country,
    postalCode: typeof postalCode === "string" ? postalCode : undefined,
  };
}

function normalizeGleifEntity(value: unknown): GleifEntity | null {
  if (!isRecord(value)) {
    return null;
  }

  const legalName = normalizeGleifName(value["legalName"]);

  if (legalName === null) {
    return null;
  }

  const legalAddress = normalizeGleifAddress(value["legalAddress"]);

  if (legalAddress === null) {
    return null;
  }

  const headquartersAddress = normalizeGleifAddress(
    value["headquartersAddress"],
  );

  if (headquartersAddress === null) {
    return null;
  }

  const jurisdiction = value["jurisdiction"];

  if (typeof jurisdiction !== "string" || jurisdiction.trim().length === 0) {
    return null;
  }

  const rawOtherNames = value["otherNames"];
  const otherNames = Array.isArray(rawOtherNames)
    ? rawOtherNames
        .map(normalizeGleifName)
        .filter(
          (
            name,
          ): name is {
            name: string;
            language: string;
          } => name !== null,
        )
    : [];

  const category = value["category"];
  const rawLegalForm = value["legalForm"];
  const legalFormId =
    isRecord(rawLegalForm) && typeof rawLegalForm["id"] === "string"
      ? rawLegalForm["id"]
      : "";

  const rawRegisteredAt = value["registeredAt"];
  const registeredAt =
    isRecord(rawRegisteredAt) && typeof rawRegisteredAt["id"] === "string"
      ? { id: rawRegisteredAt["id"] }
      : undefined;

  return {
    legalName,
    legalAddress,
    headquartersAddress,
    otherNames,
    jurisdiction,
    category: typeof category === "string" ? category : "",
    legalForm: { id: legalFormId },
    registeredAt,
  };
}

function normalizeGleifRegistration(
  value: unknown,
): GleifRegistration | null {
  if (!isRecord(value)) {
    return null;
  }

  const initialRegistrationDate = value["initialRegistrationDate"];
  const lastUpdateDate = value["lastUpdateDate"];
  const status = value["status"];
  const nextRenewalDate = value["nextRenewalDate"];
  const managingLou = value["managingLou"];

  if (
    typeof initialRegistrationDate !== "string" ||
    typeof lastUpdateDate !== "string" ||
    typeof status !== "string" ||
    typeof nextRenewalDate !== "string" ||
    typeof managingLou !== "string"
  ) {
    return null;
  }

  return {
    initialRegistrationDate,
    lastUpdateDate,
    status,
    nextRenewalDate,
    managingLou,
  };
}

function normalizeGleifRecord(value: unknown): GleifRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = value["type"];
  const id = value["id"];
  const attributes = value["attributes"];

  if (
    typeof type !== "string" ||
    typeof id !== "string" ||
    id.trim().length === 0 ||
    !isRecord(attributes)
  ) {
    return null;
  }

  const lei = attributes["lei"];
  const entity = normalizeGleifEntity(attributes["entity"]);
  const registration = normalizeGleifRegistration(attributes["registration"]);

  if (
    typeof lei !== "string" ||
    lei.trim().length === 0 ||
    entity === null ||
    registration === null
  ) {
    return null;
  }

  return {
    type,
    id,
    attributes: {
      lei,
      entity,
      registration,
    },
  };
}

function normalizeSearchResponse(value: unknown): GleifSearchResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const data = value["data"];

  if (!Array.isArray(data)) {
    return null;
  }

  const rawMeta = value["meta"];
  const meta = isRecord(rawMeta) ? rawMeta : {};

  return {
    data: data
      .map(normalizeGleifRecord)
      .filter((record): record is GleifRecord => record !== null),
    meta: {
      total: typeof meta["total"] === "number" ? meta["total"] : 0,
      page: typeof meta["page"] === "number" ? meta["page"] : 1,
    },
  };
}

function pickBestMatch(
  records: readonly GleifRecord[],
  query: string,
): GleifRecord | null {
  if (records.length === 0) {
    return null;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const exactIssuedMatch = records.find((record) => {
    const legalName = record.attributes.entity.legalName.name.trim().toLowerCase();

    return (
      legalName === normalizedQuery &&
      record.attributes.registration.status === "ISSUED"
    );
  });

  if (exactIssuedMatch) {
    return exactIssuedMatch;
  }

  const exactMatch = records.find((record) => {
    return (
      record.attributes.entity.legalName.name.trim().toLowerCase() ===
      normalizedQuery
    );
  });

  if (exactMatch) {
    return exactMatch;
  }

  const issuedMatch = records.find(
    (record) => record.attributes.registration.status === "ISSUED",
  );

  if (issuedMatch) {
    return issuedMatch;
  }

  return records[0] ?? null;
}

export async function fetchGleifData(
  query: string,
): Promise<ApiResult<GleifData>> {
  const variants = buildCompanySearchVariants(query);
  const variantResults = await Promise.all(
    variants.map(async (variant) => {
      const url = buildSearchUrl(variant);
      const result = await fetchGleif<unknown>(url);

      if (!result.success) {
        console.error("[gleif] fetchGleif failed", {
          query,
          variant,
          error: result.error,
        });

        return [] as readonly GleifRecord[];
      }

      const normalized = normalizeSearchResponse(result.data);

      if (normalized === null) {
        console.error("[gleif] invalid response shape", {
          query,
          variant,
        });

        return [] as readonly GleifRecord[];
      }

      return normalized.data;
    }),
  );

  const allMatches = variantResults
    .flat()
    .reduce<GleifRecord[]>((accumulator, record) => {
      if (accumulator.some((item) => item.id === record.id)) {
        return accumulator;
      }

      return [...accumulator, record];
    }, []);

  if (allMatches.length === 0) {
    console.error("[gleif] no results", { query, variants });

    return {
      success: false,
      error: `No GLEIF results for: "${query}"`,
    };
  }

  const record = pickBestMatch(allMatches, query);

  return {
    success: true,
    data: {
      record,
      allMatches,
    },
  };
}
