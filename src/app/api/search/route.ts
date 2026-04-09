import { NextRequest, NextResponse } from "next/server";

import { searchCompaniesHouse } from "@/lib/datasources/companies-house";
import { searchFinnhub } from "@/lib/datasources/finnhub";
import { searchGleif } from "@/lib/datasources/gleif";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  const [finnhub, companiesHouse, gleif] = await Promise.all([
    searchFinnhub(query),
    searchCompaniesHouse(query),
    searchGleif(query),
  ]);

  return NextResponse.json({
    ok: true,
    placeholder: true,
    results: [...finnhub, ...companiesHouse, ...gleif],
  });
}
