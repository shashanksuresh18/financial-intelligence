import Exa, { type DeepOutputSchema } from "exa-js";
import type { ApiResult, ExaDeepData } from "@/lib/types";

const EXA_API_KEY = process.env.EXA_API_KEY?.trim() ?? "";
const exa = EXA_API_KEY.length > 0 ? new Exa(EXA_API_KEY) : null;

const EXA_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    companyName: {
      type: "string",
      description: "Canonical company name.",
    },
    overview: {
      type: "string",
      description: "2-4 sentence business description covering model and current scale.",
    },
    estimatedRevenue: {
      type: ["string", "null"],
      description: "Latest public revenue figure or estimate with period, e.g. '$3B (FY2024)'.",
    },
    fundingTotal: {
      type: ["string", "null"],
      description: "Total funding raised, e.g. '$2.4B across 8 rounds'.",
    },
    lastValuation: {
      type: ["string", "null"],
      description: "Latest public valuation figure, e.g. '$95B (Series G, 2024)'.",
    },
    foundedYear: {
      type: ["string", "null"],
      description: "Year the company was founded, e.g. '2010'.",
    },
    headquarters: {
      type: ["string", "null"],
      description: "Primary headquarters location, e.g. 'San Francisco, CA'.",
    },
    keyInvestors: {
      type: "array",
      items: { type: "string" },
      description: "Up to 5 named key investors.",
    },
    competitors: {
      type: "array",
      items: { type: "string" },
      description: "Up to 5 named competitors.",
    },
    recentNews: {
      type: "string",
      description: "2-3 notable recent developments joined as a single string.",
    },
  },
  required: [
    "companyName",
    "overview",
    "estimatedRevenue",
    "fundingTotal",
    "lastValuation",
    "foundedYear",
    "headquarters",
    "keyInvestors",
    "competitors",
    "recentNews",
  ],
} satisfies DeepOutputSchema;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
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

function normalizeExaDeepData(value: unknown): ExaDeepData | null {
  if (!isRecord(value)) {
    return null;
  }

  const companyName = normalizeRequiredString(value["companyName"]);
  const overview = normalizeRequiredString(value["overview"]);

  if (companyName === null || overview === null) {
    return null;
  }

  return {
    companyName,
    overview,
    estimatedRevenue: normalizeNullableString(value["estimatedRevenue"]),
    fundingTotal: normalizeNullableString(value["fundingTotal"]),
    lastValuation: normalizeNullableString(value["lastValuation"]),
    foundedYear: normalizeNullableString(value["foundedYear"]),
    headquarters: normalizeNullableString(value["headquarters"]),
    keyInvestors: normalizeStringArray(value["keyInvestors"]),
    competitors: normalizeStringArray(value["competitors"]),
    recentNews: normalizeRequiredString(value["recentNews"]) ?? "",
  };
}

function parseStructuredContent(content: unknown): Record<string, unknown> | null {
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

export async function fetchExaDeepData(
  query: string,
): Promise<ApiResult<ExaDeepData>> {
  if (exa === null) {
    return {
      success: false,
      error: "EXA_API_KEY not configured",
    };
  }

  try {
    const queryString =
      `Research the company "${query}". Provide a structured overview covering: ` +
      `business model and current scale, estimated revenue, total funding raised, ` +
      `last known valuation, founded year, headquarters, key investors, main competitors, ` +
      `and recent notable news or developments.`;
    // The original research.create/poll flow is preserved in git history and can be restored if
    // private-company output quality regresses for cases like SpaceX.
    const searchResult = await exa.search(queryString, {
      type: "deep",
      outputSchema: EXA_OUTPUT_SCHEMA,
    });
    const parsed = parseStructuredContent(searchResult.output?.content);

    if (parsed === null) {
      console.error("[exa-deep] output missing or unparseable", { query });

      return {
        success: false,
        error: "exa output missing required fields",
      };
    }

    const normalized = normalizeExaDeepData(parsed);

    if (normalized === null) {
      return {
        success: false,
        error: "exa output missing required fields",
      };
    }

    return {
      success: true,
      data: normalized,
    };
  } catch (error: unknown) {
    console.error("[exa-deep] fetch failed", { query, error });

    return {
      success: false,
      error: String(error),
    };
  }
}
