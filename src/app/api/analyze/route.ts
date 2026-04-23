import { NextRequest, NextResponse } from "next/server";

import { analyzeCompany, attachReportDeltas } from "@/lib/analyzer";
import {
  hasUkCompanyNameSuffix,
  isKnownUkCompanyQuery,
} from "@/lib/company-search";
import { db } from "@/lib/db";
import { buildInvestmentMemo } from "@/lib/investment-memo";
import {
  enrichNewsHighlight,
  summarizeNewsSentiment,
} from "@/lib/news-sentiment";
import { buildNarrativeSummary, parseNarrativeSections } from "@/lib/narrative-sections";
import {
  buildPrivateResearchDevelopments,
  buildRecentDevelopments,
} from "@/lib/recent-developments";
import {
  placeholderAnalysisReport,
  type AnalysisReport,
  type AnalyzeApiResponse,
  type InvestmentMemo,
  type WaterfallResult,
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
  const normalizedNewsHighlights = (report.newsHighlights ?? []).map(enrichNewsHighlight);
  const rebuiltRecentDevelopments =
    normalizedNewsHighlights.length > 0
      ? buildRecentDevelopments(report.company, normalizedNewsHighlights)
      : buildPrivateResearchDevelopments(
          report.company,
          report.evidenceSignals.find(
            (signal) => signal.title === "Recent private-company developments are available",
          )?.detail ?? null,
          report.updatedAt,
        );
  const normalizedBase = {
    ...report,
    entityResolution:
      report.entityResolution ?? placeholderAnalysisReport.entityResolution,
    sections,
    deltas: report.deltas ?? [],
    newsHighlights: normalizedNewsHighlights,
    streetView: report.streetView ?? null,
    valuationView: report.valuationView ?? null,
    peerComparison: report.peerComparison ?? [],
    earningsHighlights: report.earningsHighlights ?? [],
    insiderActivity: report.insiderActivity ?? [],
    evidenceSignals: report.evidenceSignals ?? [],
    coverageGaps: report.coverageGaps ?? [],
    disagreementNotes: report.disagreementNotes ?? [],
    sectionAudit: report.sectionAudit ?? [],
    validationReport:
      report.validationReport ?? placeholderAnalysisReport.validationReport,
    newsSentiment:
      report.newsSentiment ?? summarizeNewsSentiment(report.newsHighlights ?? []),
    recentDevelopments:
      rebuiltRecentDevelopments.length > 0
        ? rebuiltRecentDevelopments
        : (report.recentDevelopments?.length ?? 0) > 0
        ? report.recentDevelopments
        : rebuiltRecentDevelopments,
    sources: report.sources ?? [],
  };
  const fallbackWaterfallResult: WaterfallResult = {
    query: normalizedBase.company,
    finnhub: null,
    fmp: null,
    secEdgar: null,
    companiesHouse: null,
    gleif: null,
    exaDeep: null,
    claudeFallback: null,
    activeSources: normalizedBase.sources,
  };
  const hasModernMemoShape =
    typeof report.investmentMemo === "object" &&
    report.investmentMemo !== null &&
    "recommendation" in report.investmentMemo &&
    "conviction" in report.investmentMemo &&
    "role" in report.investmentMemo &&
    "verdict" in report.investmentMemo;
  const hasAnalystMemoShape =
    hasModernMemoShape &&
    "displayRecommendationLabel" in report.investmentMemo &&
    "convictionSummary" in report.investmentMemo;
  const rebuiltMemo = buildInvestmentMemo({
    company: normalizedBase.company,
    entityResolution: normalizedBase.entityResolution,
    confidence: normalizedBase.confidence,
    metrics: normalizedBase.metrics,
    streetView: normalizedBase.streetView,
    valuationView: normalizedBase.valuationView,
    earningsHighlights: normalizedBase.earningsHighlights,
    newsHighlights: normalizedBase.newsHighlights,
    evidenceSignals: normalizedBase.evidenceSignals,
    coverageGaps: normalizedBase.coverageGaps,
    disagreementNotes: normalizedBase.disagreementNotes,
    sectionAudit: normalizedBase.sectionAudit,
    sections,
    narrative: normalizedBase.narrative,
    sources: normalizedBase.sources,
    validationReport: normalizedBase.validationReport,
    waterfallResult: fallbackWaterfallResult,
  });
  const investmentMemo =
    hasAnalystMemoShape
      ? {
          ...rebuiltMemo,
          stressTest:
            (report.investmentMemo as InvestmentMemo).stressTest ??
            rebuiltMemo.stressTest ??
            null,
        }
      : {
          ...rebuiltMemo,
          stressTest:
            hasModernMemoShape
              ? (report.investmentMemo as InvestmentMemo).stressTest ??
                rebuiltMemo.stressTest ??
                null
              : rebuiltMemo.stressTest ?? null,
        };
  const summary =
    investmentMemo.verdict.trim().length > 0
      ? investmentMemo.verdict
      : buildNarrativeSummary(normalizedBase.narrative, sections);

  return {
    ...normalizedBase,
    summary,
    investmentMemo,
  };
}

function shouldBypassCachedReport(
  companyQuery: string,
  report: AnalysisReport,
): boolean {
  const tokenCount = companyQuery
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;

  if (
    tokenCount !== 1 ||
    hasUkCompanyNameSuffix(companyQuery) ||
    isKnownUkCompanyQuery(companyQuery)
  ) {
    return false;
  }

  const primarySource = report.entityResolution.primarySource;
  const matchedSources = new Set(report.entityResolution.matchedSources);

  return (
    primarySource === "companies-house" &&
    report.validationReport.coverageLabel === "Registry-led" &&
    !matchedSources.has("sec-edgar") &&
    !matchedSources.has("finnhub") &&
    !matchedSources.has("fmp")
  );
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
    const cachedReport =
      cached === null
        ? null
        : normalizeReportShape(JSON.parse(cached.report) as AnalysisReport);

    if (forceRefresh) {
      console.info("[analyze] cache bypass requested", { company, companyId });
    }

    const shouldBypassCache =
      cachedReport !== null && shouldBypassCachedReport(company, cachedReport);

    if (cached && new Date(cached.expiresAt) > new Date()) {
      if (!shouldBypassCache && cachedReport !== null) {
        return NextResponse.json({ ok: true, report: cachedReport });
      }

      console.info("[analyze] cached report bypassed for likely entity mismatch", {
        company,
        companyId,
        cachedEntity: cachedReport?.company ?? null,
        primarySource: cachedReport?.entityResolution.primarySource ?? null,
      });
    }

    const previousReport =
      shouldBypassCache || cachedReport === null ? null : cachedReport;
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
