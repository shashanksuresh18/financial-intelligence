import { NextRequest, NextResponse } from "next/server";

import type { GleifRecord, SearchResult } from "@/lib/types";

import { fetchCompaniesHouseData } from "@/lib/datasources/companies-house";
import { searchSymbols, toSearchResults } from "@/lib/datasources/finnhub";
import { fetchGleifData } from "@/lib/datasources/gleif";

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  const [finnhubResult, companiesHouseResult, gleifResult] = await Promise.all([
    searchSymbols(query),
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

  const finnhub = finnhubResult.success
    ? toSearchResults(finnhubResult.data.result)
    : [];
  const companiesHouse = companiesHouseResult.success
    ? toCompaniesHouseSearchResults(companiesHouseResult.data.allMatches)
    : [];
  const gleif = gleifResult.success
    ? toGleifSearchResults(gleifResult.data.allMatches)
    : [];

  return NextResponse.json({
    ok: true,
    placeholder: true,
    results: [...finnhub, ...companiesHouse, ...gleif],
  });
}
