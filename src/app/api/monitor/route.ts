import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import type { AnalysisReport, MonitorApiResponse, MonitorItem } from "@/lib/types";

function summarizeSections(report: AnalysisReport): {
  readonly supported: number;
  readonly partial: number;
  readonly limited: number;
} {
  return report.sectionAudit.reduce(
    (summary, item) => ({
      supported: summary.supported + (item.status === "supported" ? 1 : 0),
      partial: summary.partial + (item.status === "partial" ? 1 : 0),
      limited: summary.limited + (item.status === "limited" ? 1 : 0),
    }),
    { supported: 0, partial: 0, limited: 0 },
  );
}

function resolveMonitorUpdatedAt(
  recordUpdatedAt: Date,
  parsedReport: AnalysisReport | null,
): string {
  if (parsedReport === null) {
    return recordUpdatedAt.toISOString();
  }

  const reportTimestamp = Date.parse(parsedReport.updatedAt);
  const recordTimestamp = recordUpdatedAt.getTime();

  if (Number.isNaN(reportTimestamp)) {
    return recordUpdatedAt.toISOString();
  }

  return new Date(Math.max(recordTimestamp, reportTimestamp)).toISOString();
}

async function buildMonitorPayload(): Promise<{
  readonly items: readonly MonitorItem[];
  readonly summary: NonNullable<MonitorApiResponse["summary"]>;
}> {
  const records = await db.monitoredCompany.findMany({
    orderBy: { createdAt: "desc" },
  });

  const items = await Promise.all(
    records.map(async (record) => {
      const cached = await db.analysisCache.findUnique({
        where: { companyId: record.companyName.toLowerCase() },
      });
      const parsedReport =
        cached === null ? null : JSON.parse(cached.report) as AnalysisReport;
      const sectionSummary =
        parsedReport === null ? null : summarizeSections(parsedReport);

      return {
        id: record.id,
        label: record.companyName,
        status: record.status as "idle" | "watching",
        updatedAt: resolveMonitorUpdatedAt(record.updatedAt, parsedReport),
        snapshot:
          parsedReport === null || sectionSummary === null
            ? null
            : {
              confidenceScore: parsedReport.confidence.score,
              confidenceLevel: parsedReport.confidence.level,
              supported: sectionSummary.supported,
              partial: sectionSummary.partial,
              limited: sectionSummary.limited,
              sourceCount: parsedReport.sources.length,
              metricCount: parsedReport.metrics.length,
              updatedAt: parsedReport.updatedAt,
            },
      } satisfies MonitorItem;
    }),
  );

  const itemsWithSnapshots = items.filter(
    (item): item is MonitorItem & { snapshot: NonNullable<MonitorItem["snapshot"]> } =>
      item.snapshot !== null && item.snapshot !== undefined,
  );
  const averageConfidence =
    itemsWithSnapshots.length === 0
      ? null
      : Math.round(
        itemsWithSnapshots.reduce(
          (total, item) => total + item.snapshot.confidenceScore,
          0,
        ) / itemsWithSnapshots.length,
      );
  const averageSources =
    itemsWithSnapshots.length === 0
      ? null
      : Number(
        (
          itemsWithSnapshots.reduce(
            (total, item) => total + item.snapshot.sourceCount,
            0,
          ) / itemsWithSnapshots.length
        ).toFixed(1),
      );
  const averageMetrics =
    itemsWithSnapshots.length === 0
      ? null
      : Number(
        (
          itemsWithSnapshots.reduce(
            (total, item) => total + item.snapshot.metricCount,
            0,
          ) / itemsWithSnapshots.length
        ).toFixed(1),
      );
  const strongest =
    itemsWithSnapshots.length === 0
      ? null
      : [...itemsWithSnapshots].sort(
        (left, right) =>
          right.snapshot.confidenceScore - left.snapshot.confidenceScore,
      )[0];
  const weakest =
    itemsWithSnapshots.length === 0
      ? null
      : [...itemsWithSnapshots].sort(
        (left, right) =>
          left.snapshot.confidenceScore - right.snapshot.confidenceScore,
      )[0];

  return {
    items,
    summary: {
      watchedCount: items.length,
      withSnapshotsCount: itemsWithSnapshots.length,
      averageConfidence,
      averageSources,
      averageMetrics,
      supportedSections: itemsWithSnapshots.reduce(
        (total, item) => total + item.snapshot.supported,
        0,
      ),
      partialSections: itemsWithSnapshots.reduce(
        (total, item) => total + item.snapshot.partial,
        0,
      ),
      limitedSections: itemsWithSnapshots.reduce(
        (total, item) => total + item.snapshot.limited,
        0,
      ),
      strongestCompany: strongest?.label ?? null,
      weakestCompany: weakest?.label ?? null,
    },
  };
}

function isPrismaNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  );
}

export async function GET(): Promise<NextResponse<MonitorApiResponse>> {
  try {
    const payload = await buildMonitorPayload();

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    console.error("[monitor] failed to load items", { error });

    return NextResponse.json(
      { ok: false, items: [], error: "Failed to load monitor items" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<MonitorApiResponse>> {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const companyName =
    typeof body.companyName === "string" ? body.companyName.trim() : "";
  const companyId =
    typeof body.companyId === "string" ? body.companyId.trim() : "";

  if (companyName.length === 0 || companyId.length === 0) {
    return NextResponse.json(
      { ok: false, items: [], error: "companyName and companyId are required" },
      { status: 400 },
    );
  }

  try {
    const existing = await db.monitoredCompany.findFirst({
      where: { companyId },
    });

    if (existing === null) {
      await db.monitoredCompany.create({
        data: { companyName, companyId },
      });
    } else {
      await db.monitoredCompany.update({
        where: { id: existing.id },
        data: { companyName, companyId },
      });
    }

    const payload = await buildMonitorPayload();

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    console.error("[monitor] failed to create item", {
      companyName,
      companyId,
      error,
    });

    return NextResponse.json(
      { ok: false, items: [], error: "Failed to create monitor item" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
): Promise<NextResponse<MonitorApiResponse>> {
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";

  if (id.length === 0) {
    return NextResponse.json(
      { ok: false, items: [], error: "id is required" },
      { status: 400 },
    );
  }

  try {
    await db.monitoredCompany.delete({ where: { id } });
  } catch (error) {
    if (!isPrismaNotFoundError(error)) {
      console.error("[monitor] failed to delete item", { id, error });

      return NextResponse.json(
        { ok: false, items: [], error: "Failed to delete monitor item" },
        { status: 500 },
      );
    }
  }

  try {
    const payload = await buildMonitorPayload();

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    console.error("[monitor] failed to reload items", { id, error });

    return NextResponse.json(
      { ok: false, items: [], error: "Failed to load monitor items" },
      { status: 500 },
    );
  }
}
