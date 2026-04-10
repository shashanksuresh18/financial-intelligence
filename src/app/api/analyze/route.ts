import { NextRequest, NextResponse } from "next/server";

import { analyzeCompany } from "@/lib/analyzer";
import { db } from "@/lib/db";
import type { AnalysisReport, AnalyzeApiResponse } from "@/lib/types";

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AnalyzeApiResponse>> {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const company =
    typeof body.company === "string" ? body.company.trim() : "";

  if (company.length === 0) {
    return NextResponse.json(
      { ok: false, error: "company is required" },
      { status: 400 },
    );
  }

  const companyId = company.toLowerCase();

  try {
    const cached = await db.analysisCache.findUnique({ where: { companyId } });

    if (cached && new Date(cached.expiresAt) > new Date()) {
      const report = JSON.parse(cached.report) as AnalysisReport;

      return NextResponse.json({ ok: true, report });
    }

    const report = await analyzeCompany(company);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.analysisCache.upsert({
      where: { companyId },
      create: { companyId, report: JSON.stringify(report), expiresAt },
      update: { report: JSON.stringify(report), expiresAt },
    });

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error("[analyze] analysis failed", { company, error });

    return NextResponse.json(
      { ok: false, error: "Analysis failed" },
      { status: 500 },
    );
  }
}
