import { NextRequest, NextResponse } from "next/server";

import { exploreTheme } from "@/lib/agents/theme-agent";
import type { ThemeApiResponse } from "@/lib/types";

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ThemeApiResponse>> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const theme = typeof body.theme === "string" ? body.theme.trim() : "";

  if (theme.length === 0) {
    return NextResponse.json(
      { ok: false, error: "theme is required" },
      { status: 400 },
    );
  }

  if (theme.length > 500) {
    return NextResponse.json(
      { ok: false, error: "theme must be under 500 characters" },
      { status: 400 },
    );
  }

  try {
    const result = await exploreTheme(theme);

    if (result.companies.length === 0 && result.themeDescription.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No companies found for this theme. Try a broader search or check the spelling.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[themes] route error", { theme, error });

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unable to load theme data. Please try again or check your connection.",
      },
      { status: 500 },
    );
  }
}
