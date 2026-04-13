import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import type { MonitorApiResponse, MonitorItem } from "@/lib/types";

async function getAllItems(): Promise<readonly MonitorItem[]> {
  const records = await db.monitoredCompany.findMany({
    orderBy: { createdAt: "desc" },
  });

  return records.map((record) => ({
    id: record.id,
    label: record.companyName,
    status: record.status as "idle" | "watching",
    updatedAt: record.updatedAt.toISOString(),
  }));
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
    return NextResponse.json({ ok: true, items: await getAllItems() });
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

    return NextResponse.json({ ok: true, items: await getAllItems() });
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
    return NextResponse.json({ ok: true, items: await getAllItems() });
  } catch (error) {
    console.error("[monitor] failed to reload items", { id, error });

    return NextResponse.json(
      { ok: false, items: [], error: "Failed to load monitor items" },
      { status: 500 },
    );
  }
}
