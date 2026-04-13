import { NextRequest, NextResponse } from "next/server";

import { analyzeCompany, attachReportDeltas } from "@/lib/analyzer";
import { db } from "@/lib/db";
import { buildNarrativeSummary, parseNarrativeSections } from "@/lib/narrative-sections";
import {
  placeholderAnalysisReport,
  type AnalysisReport,
  type AnalyzeApiResponse,
} from "@/lib/types";

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "object" && error !== null) {
    return { ...error as Record<string, unknown> };
  }

  return { error: String(error) };
}

function normalizeReportShape(report: AnalysisReport): AnalysisReport {
  const sections =
    report.sections.length === 1 && report.sections[0]?.title === "Analyst Brief"
      ? parseNarrativeSections(report.narrative)
      : report.sections ?? [];
  const summary = buildNarrativeSummary(report.narrative, sections);

  return {
    ...report,
    entityResolution:
      report.entityResolution ?? placeholderAnalysisReport.entityResolution,
    summary,
    sections,
    deltas: report.deltas ?? [],
    newsHighlights: report.newsHighlights ?? [],
    streetView: report.streetView ?? null,
    valuationView: report.valuationView ?? null,
    peerComparison: report.peerComparison ?? [],
    earningsHighlights: report.earningsHighlights ?? [],
    insiderActivity: report.insiderActivity ?? [],
    evidenceSignals: report.evidenceSignals ?? [],
    coverageGaps: report.coverageGaps ?? [],
    disagreementNotes: report.disagreementNotes ?? [],
    sectionAudit: report.sectionAudit ?? [],
  };
}

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
  const forceRefresh =
    body.forceRefresh === true || body.forceFresh === true;

  try {
    const cached = forceRefresh
      ? null
      : await db.analysisCache.findUnique({ where: { companyId } });

    if (forceRefresh) {
      console.info("[analyze] cache bypass requested", { company, companyId });
    }

    if (cached && new Date(cached.expiresAt) > new Date()) {
      const report = normalizeReportShape(JSON.parse(cached.report) as AnalysisReport);

      return NextResponse.json({ ok: true, report });
    }

    const previousReport = cached === null
      ? null
      : normalizeReportShape(JSON.parse(cached.report) as AnalysisReport);
    const nextReport = await analyzeCompany(company);
    const report = attachReportDeltas(previousReport, nextReport);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.analysisCache.upsert({
      where: { companyId },
      create: { companyId, report: JSON.stringify(report), expiresAt },
      update: { report: JSON.stringify(report), expiresAt },
    });

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error("[analyze] analysis failed", {
      company,
      error: serializeError(error),
    });

    return NextResponse.json(
      { ok: false, error: "Analysis failed" },
      { status: 500 },
    );
  }
}
