import { NextResponse } from "next/server";

import type { MonitorItem } from "@/lib/types";

const monitorItems: MonitorItem[] = [
  {
    id: "monitor-placeholder",
    label: "Placeholder watchlist item",
    status: "idle",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
];

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    placeholder: true,
    items: monitorItems,
  });
}
