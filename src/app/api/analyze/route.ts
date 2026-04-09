import { NextRequest, NextResponse } from "next/server";

import { analyzeCompany } from "@/lib/analyzer";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const company =
    typeof body.company === "string" && body.company.trim().length > 0
      ? body.company
      : "Placeholder Company";

  const report = await analyzeCompany(company);

  return NextResponse.json({
    ok: true,
    placeholder: true,
    report,
  });
}
