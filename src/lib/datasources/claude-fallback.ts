import Anthropic from "@anthropic-ai/sdk";
import type {
  ApiResult,
  ClaudeFallbackResult,
  FinancialMetric,
} from "@/lib/types";

const MODEL_CANDIDATES = [
  process.env.ANTHROPIC_WEB_MODEL?.trim(),
  process.env.ANTHROPIC_MODEL?.trim(),
  "claude-sonnet-4-20250514",
].filter((value): value is string => typeof value === "string" && value.length > 0);
const MAX_TOKENS = 2200;
const DISCLAIMER =
  "Data sourced via AI web search and public web documents. Figures may be incomplete, stale, or inconsistently reported. " +
  "Verify against primary filings, annual reports, or registry documents before acting on this information.";

type ClaudeFallbackContext = {
  readonly canonicalName?: string;
  readonly companyNumber?: string;
  readonly jurisdiction?: string;
  readonly companyType?: string;
  readonly lei?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const typedError = error as Error & {
      readonly status?: number;
      readonly error?: unknown;
      readonly cause?: unknown;
    };

    return {
      name: typedError.name,
      message: typedError.message,
      status: typedError.status ?? null,
      error: typedError.error ?? null,
      cause: typedError.cause ?? null,
    };
  }

  if (typeof error === "object" && error !== null) {
    return { ...error as Record<string, unknown> };
  }

  return { error: String(error) };
}

function buildContextLines(context?: ClaudeFallbackContext): string {
  if (context === undefined) {
    return "- No structured registry context is available.";
  }

  const lines = [
    context.canonicalName
      ? `- Canonical name hint: ${context.canonicalName}`
      : null,
    context.companyNumber
      ? `- Company number hint: ${context.companyNumber}`
      : null,
    context.jurisdiction
      ? `- Jurisdiction hint: ${context.jurisdiction}`
      : null,
    context.companyType
      ? `- Company type hint: ${context.companyType}`
      : null,
    context.lei
      ? `- LEI hint: ${context.lei}`
      : null,
  ].filter((value): value is string => value !== null);

  return lines.length > 0 ? lines.join("\n") : "- No structured registry context is available.";
}

function buildPrompt(query: string, context?: ClaudeFallbackContext): string {
  return `Research the company "${query}" using Anthropic web search to assemble a private-company diligence snapshot.

Structured context hints:
${buildContextLines(context)}

Goal:
- Surface a small, evidence-first financial snapshot for an investment team evaluating a private company.
- Prefer exact, recent, public-web figures over generic commentary.
- Use web search to find official or near-official sources when possible.

Source priority:
1. Official annual reports, audited accounts, registry filings, or regulatory documents.
2. Company website, newsroom, investor/press releases, or published fact sheets.
3. Reputable financial/business reporting only when primary sources are unavailable.

Candidate fields to look for:
- Revenue
- Net income / profit / loss
- Total assets
- Equity / net assets
- Cash / liquidity
- Deposits / loan book / AUM / GMV when relevant
- Headcount
- Customer count / active users
- Latest funding round
- Implied valuation
- Last accounts date
- Next accounts due date

Rules:
- Do NOT invent, smooth, or estimate missing numbers.
- Only include metrics you can support from search results.
- Prefer the latest exact period/date and specify it.
- If multiple figures conflict, prefer official filings and mention the conflict briefly.
- If only metadata is available, say so plainly.
- Keep the narrative concise and useful for an institutional diligence readout.

Output:
1. A short narrative of 4-6 sentences covering scale, performance visibility, capital/valuation visibility, and the biggest data gaps.
2. A final JSON code block at the end of the response using this exact top-level shape:

\`\`\`json
{
  "metrics": [
    {"label":"Revenue","value":"$10B","period":"FY2024"},
    {"label":"Net Income","value":"$1.2B","period":"FY2024"}
  ],
  "coverage_gaps": [
    "Example gap"
  ],
  "source_notes": [
    "Revenue FY2024 from company annual report published 2025-03-01"
  ]
}
\`\`\`

If no metrics are available, output: \`\`\`json
{"metrics":[],"coverage_gaps":[],"source_notes":[]}
\`\`\``;
}

function findLastJsonBlock(
  text: string,
): { readonly content: string; readonly start: number; readonly end: number } | null {
  const pattern = /```json\s*([\s\S]*?)\s*```/g;
  let lastMatch: RegExpExecArray | null = null;
  let lastEnd = 0;
  let match: RegExpExecArray | null = pattern.exec(text);

  while (match !== null) {
    lastMatch = match;
    lastEnd = pattern.lastIndex;
    match = pattern.exec(text);
  }

  if (lastMatch === null) {
    return null;
  }

  return {
    content: lastMatch[1] ?? "",
    start: lastMatch.index,
    end: lastEnd,
  };
}

function normalizeMetric(value: unknown): FinancialMetric | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = value["label"];

  if (typeof label !== "string" || label.trim().length === 0) {
    return null;
  }

  const rawValue = value["value"];
  const normalizedValue =
    typeof rawValue === "string" ||
    typeof rawValue === "number" ||
    rawValue === null
      ? rawValue
      : null;
  const period = value["period"];

  return {
    label,
    value: normalizedValue,
    period: typeof period === "string" && period.trim().length > 0 ? period : undefined,
    source: "claude-fallback",
  };
}

function parseMetrics(text: string): readonly FinancialMetric[] {
  const lastJsonBlock = findLastJsonBlock(text);

  if (lastJsonBlock === null) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(lastJsonBlock.content);

    if (!isRecord(parsed) || !Array.isArray(parsed["metrics"])) {
      console.warn("[claude-fallback] invalid metrics JSON structure");

      return [];
    }

    return parsed["metrics"]
      .map(normalizeMetric)
      .filter((metric): metric is FinancialMetric => metric !== null);
  } catch (error: unknown) {
    console.warn("[claude-fallback] failed to parse metrics JSON", {
      error: String(error),
    });

    return [];
  }
}

function extractNarrative(text: string): string {
  const lastJsonBlock = findLastJsonBlock(text);

  if (lastJsonBlock === null) {
    return text.trim();
  }

  const narrative = `${text.slice(0, lastJsonBlock.start)}${text.slice(lastJsonBlock.end)}`.trim();

  return narrative.length > 0 ? narrative : text;
}

export async function fetchClaudeFallbackData(
  query: string,
  context?: ClaudeFallbackContext,
): Promise<ApiResult<ClaudeFallbackResult>> {
  let client: Anthropic;

  try {
    client = new Anthropic();
  } catch (error: unknown) {
    console.error("[claude-fallback] API error", {
      query,
      context,
      error: serializeError(error),
      modelCandidates: MODEL_CANDIDATES,
    });

    return {
      success: false,
      error: String(error),
    };
  }

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 6,
        }],
        messages: [{ role: "user", content: buildPrompt(query, context) }],
      });

      const fullText = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (fullText.length === 0) {
        console.error("[claude-fallback] messages.create returned no text", {
          query,
          model,
        });

        continue;
      }

      const extractedMetrics = parseMetrics(fullText);
      const narrative = extractNarrative(fullText);

      console.info("[claude-fallback] messages.create succeeded", {
        query,
        model,
        metricsCount: extractedMetrics.length,
        textLength: fullText.length,
      });

      return {
        success: true,
        data: {
          narrative,
          extractedMetrics,
          disclaimer: DISCLAIMER,
        },
      };
    } catch (error: unknown) {
      console.error("[claude-fallback] messages.create failed", {
        query,
        context,
        model,
        error: serializeError(error),
      });
    }
  }

  return {
    success: false,
    error: "Claude web fallback did not return usable content.",
  };
}
