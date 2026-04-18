import Exa, { type DeepOutputSchema } from "exa-js";

import type { ThemeCompany, ThemeResult } from "@/lib/types";

const THEME_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    themeName: {
      type: "string",
      description:
        "Concise canonical name for the investment theme, e.g. 'EV Charging Infrastructure'.",
    },
    themeDescription: {
      type: "string",
      description: "2-3 sentence explanation of what the theme is and why it matters.",
    },
    companies: {
      type: "array",
      description:
        "5-10 companies with meaningful exposure to this theme, ranked by exposure score descending.",
      items: {
        type: "object",
        properties: {
          companyName: {
            type: "string",
            description: "Canonical company name.",
          },
          ticker: {
            type: ["string", "null"],
            description: "Stock ticker if publicly listed, else null.",
          },
          exposureScore: {
            type: "number",
            description:
              "0-100 score representing depth of exposure to this theme.",
          },
          rationale: {
            type: "string",
            description: "1-2 sentence explanation of why this company has exposure.",
          },
        },
        required: ["companyName", "ticker", "exposureScore", "rationale"],
      },
    },
    keyDrivers: {
      type: "array",
      items: { type: "string" },
      description: "3-5 structural factors accelerating this theme.",
    },
    headwinds: {
      type: "array",
      items: { type: "string" },
      description: "3-5 risks or obstacles to the theme.",
    },
    relatedThemes: {
      type: "array",
      items: { type: "string" },
      description: "3-5 adjacent or overlapping investment themes.",
    },
  },
  required: [
    "themeName",
    "themeDescription",
    "companies",
    "keyDrivers",
    "headwinds",
    "relatedThemes",
  ],
} satisfies DeepOutputSchema;

let exaClient: Exa | null | undefined;

function getExaClient(): Exa | null {
  if (exaClient !== undefined) {
    return exaClient;
  }

  const apiKey = process.env.EXA_API_KEY?.trim() ?? "";
  exaClient = apiKey.length > 0 ? new Exa(apiKey) : null;

  return exaClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return normalizeRequiredString(value);
}

function normalizeStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeExposureScore(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue)
    ? Math.max(0, Math.min(100, Math.round(numericValue)))
    : 0;
}

function normalizeThemeCompany(value: unknown): ThemeCompany | null {
  if (!isRecord(value)) {
    return null;
  }

  const companyName = normalizeRequiredString(value["companyName"]);
  const rationale = normalizeRequiredString(value["rationale"]);

  if (companyName === null || rationale === null) {
    return null;
  }

  return {
    companyName,
    ticker: normalizeNullableString(value["ticker"]),
    exposureScore: normalizeExposureScore(value["exposureScore"]),
    rationale,
  };
}

function normalizeThemeResult(value: unknown, queryTimeMs: number): ThemeResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const themeName = normalizeRequiredString(value["themeName"]);
  const themeDescription = normalizeRequiredString(value["themeDescription"]);

  if (themeName === null || themeDescription === null) {
    return null;
  }

  const rawCompanies = Array.isArray(value["companies"]) ? value["companies"] : [];
  const companies = rawCompanies
    .map(normalizeThemeCompany)
    .filter((company): company is ThemeCompany => company !== null)
    .sort((left, right) => right.exposureScore - left.exposureScore)
    .slice(0, 10);

  return {
    themeName,
    themeDescription,
    companies,
    keyDrivers: normalizeStringArray(value["keyDrivers"]),
    headwinds: normalizeStringArray(value["headwinds"]),
    relatedThemes: normalizeStringArray(value["relatedThemes"]),
    queryTimeMs,
  };
}

function emptyThemeResult(theme: string, queryTimeMs: number): ThemeResult {
  return {
    themeName: theme,
    themeDescription: "",
    companies: [],
    keyDrivers: [],
    headwinds: [],
    relatedThemes: [],
    queryTimeMs,
  };
}

function parseStructuredThemeContent(content: unknown): Record<string, unknown> | null {
  if (isRecord(content)) {
    return content;
  }

  if (typeof content !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildThemeInstructions(theme: string): string {
  return `
Research the investment theme: "${theme}".

Identify 5-10 companies with meaningful exposure to this theme. For each company, assess
how central this theme is to their business model and revenue streams (exposureScore 0-100).
Also identify the structural drivers accelerating the theme, the key risks and headwinds,
and 3-5 related adjacent themes that investors should explore alongside this one.

Focus on companies where this theme accounts for at least 20% of revenue or strategic
positioning. Include both public companies (with tickers) and major private players.
`.trim();
}

export async function exploreTheme(theme: string): Promise<ThemeResult> {
  const trimmedTheme = theme.trim();
  const startedAt = Date.now();
  const exa = getExaClient();

  if (trimmedTheme.length === 0 || exa === null) {
    if (trimmedTheme.length > 0 && exa === null) {
      console.error("[theme-agent] EXA_API_KEY not configured", { theme: trimmedTheme });
    }

    return emptyThemeResult(trimmedTheme, Date.now() - startedAt);
  }

  try {
    const searchResult = await exa.search(trimmedTheme, {
      type: "deep",
      numResults: 10,
      outputSchema: THEME_OUTPUT_SCHEMA,
      systemPrompt: buildThemeInstructions(trimmedTheme),
    });
    const queryTimeMs = Date.now() - startedAt;

    if (searchResult.output !== undefined && searchResult.output.grounding.length > 0) {
      console.debug("[theme-agent] grounding", {
        theme: trimmedTheme,
        grounding: searchResult.output.grounding,
      });
    }

    const parsedContent = parseStructuredThemeContent(searchResult.output?.content);

    if (parsedContent === null) {
      console.error("[theme-agent] invalid output content", {
        theme: trimmedTheme,
        hasOutput: searchResult.output !== undefined,
      });

      return emptyThemeResult(trimmedTheme, queryTimeMs);
    }

    return normalizeThemeResult(parsedContent, queryTimeMs) ??
      emptyThemeResult(trimmedTheme, queryTimeMs);
  } catch (error: unknown) {
    console.error("[theme-agent] explore failed", { theme: trimmedTheme, error });

    return emptyThemeResult(trimmedTheme, Date.now() - startedAt);
  }
}
