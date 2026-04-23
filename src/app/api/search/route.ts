import { NextRequest, NextResponse } from "next/server";

import {
  buildCompanySearchVariants,
  getKnownPrivateCompanyCanonicalName,
  isKnownPrivateCompanyQuery,
  rankAndDedupeSearchResults,
} from "@/lib/company-search";
import type { GleifRecord, SearchResult } from "@/lib/types";

import { fetchCompaniesHouseData } from "@/lib/datasources/companies-house";
import { searchSymbols, toSearchResults } from "@/lib/datasources/finnhub";
import { fetchGleifData } from "@/lib/datasources/gleif";
import type { SearchApiResponse } from "@/lib/types";

function toCompaniesHouseSearchResults(
  matches: readonly {
    readonly company_number: string;
    readonly company_name: string;
    readonly company_status: string;
    readonly company_type: string;
    readonly description?: string;
  }[],
): readonly SearchResult[] {
  return matches.map((match) => ({
    id: `companies-house:${match.company_number}`,
    name: match.company_name,
    jurisdiction: "GB",
    description:
      match.description || match.company_status || match.company_type || undefined,
  }));
}

function toGleifSearchResults(
  matches: readonly GleifRecord[],
): readonly SearchResult[] {
  return matches.map((match) => ({
    id: `gleif:${match.id}`,
    name: match.attributes.entity.legalName.name,
    jurisdiction: match.attributes.entity.jurisdiction,
    description: match.attributes.registration.status,
  }));
}

function toPrivateCompanySearchResult(query: string): SearchResult {
  const displayName = getKnownPrivateCompanyCanonicalName(query) ?? query;

  return {
    id: `private:${displayName.toLowerCase()}`,
    name: displayName,
    displayName,
    subtitle: "Private company — research via Exa Deep",
    source: "private",
    ticker: null,
    companyNumber: null,
    canUseAnalyze: true,
  };
}

async function searchFinnhubWithVariants(
  query: string,
): Promise<{
  readonly success: boolean;
  readonly results: readonly SearchResult[];
  readonly error: string | null;
}> {
  const variants = buildCompanySearchVariants(query);
  const aggregatedResults: SearchResult[] = [];
  let sawSuccessfulLookup = false;
  let lastError: string | null = null;

  for (const variant of variants) {
    const result = await searchSymbols(variant);

    if (!result.success) {
      lastError = result.error;
      continue;
    }

    sawSuccessfulLookup = true;

    for (const item of toSearchResults(result.data.result)) {
      if (!aggregatedResults.some((existing) => existing.id === item.id)) {
        aggregatedResults.push(item);
      }
    }
  }

  if (sawSuccessfulLookup) {
    return {
      success: true,
      results: aggregatedResults,
      error: null,
    };
  }

  return {
    success: false,
    results: [],
    error: lastError ?? `No symbol search variants succeeded for "${query}"`,
  };
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SearchApiResponse>> {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }

  if (isKnownPrivateCompanyQuery(query)) {
    return NextResponse.json({
      ok: true,
      results: [toPrivateCompanySearchResult(query)],
    });
  }

  const [finnhubResult, companiesHouseResult, gleifResult] = await Promise.all([
    searchFinnhubWithVariants(query),
    fetchCompaniesHouseData(query),
    fetchGleifData(query),
  ]);

  if (!finnhubResult.success) {
    console.error("[search] Finnhub symbol search failed", {
      query,
      error: finnhubResult.error,
    });
  }

  if (!companiesHouseResult.success) {
    console.error("[search] Companies House search failed", {
      query,
      error: companiesHouseResult.error,
    });
  }

  if (!gleifResult.success) {
    console.error("[search] GLEIF search failed", {
      query,
      error: gleifResult.error,
    });
  }

  const finnhub = finnhubResult.success ? finnhubResult.results : [];
  const companiesHouse = companiesHouseResult.success
    ? toCompaniesHouseSearchResults(companiesHouseResult.data.allMatches)
    : [];
  const gleif = gleifResult.success
    ? toGleifSearchResults(gleifResult.data.allMatches)
    : [];

  return NextResponse.json({
    ok: true,
    results: rankAndDedupeSearchResults(query, [
      { source: "finnhub", results: finnhub },
      { source: "companies-house", results: companiesHouse },
      { source: "gleif", results: gleif },
    ]),
  });
}
