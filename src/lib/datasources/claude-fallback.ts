import Anthropic from "@anthropic-ai/sdk";
import type {
  ApiResult,
  ClaudeFallbackResult,
  FinancialMetric,
} from "@/lib/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;
const DISCLAIMER =
  "Data sourced via AI web search. Figures may be incomplete or outdated. " +
  "Verify against primary sources before acting on this information.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildPrompt(query: string): string {
  return `Research the company "${query}" using web search. Provide:
1. A 2-3 sentence summary of the company and its current financial position.
2. Any financial metrics you find (revenue, net income, headcount, valuation, etc.)
   formatted as a JSON code block at the end of your response, like this:

\`\`\`json
{"metrics":[{"label":"Revenue","value":"$10B","period":"FY2024"},{"label":"Net Income","value":"$1.2B","period":"FY2024"}]}
\`\`\`

If no metrics are available, output: \`\`\`json
{"metrics":[]}
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
): Promise<ApiResult<ClaudeFallbackResult>> {
  let client: Anthropic;

  try {
    client = new Anthropic();
  } catch (error: unknown) {
    console.error("[claude-fallback] API error", { query, error });

    return {
      success: false,
      error: String(error),
    };
  }

  let response: Awaited<ReturnType<Anthropic["messages"]["create"]>>;

  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: buildPrompt(query) }],
    });
  } catch (error: unknown) {
    console.error("[claude-fallback] API error", { query, error });

    return {
      success: false,
      error: String(error),
    };
  }

  const fullText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (fullText.length === 0) {
    return {
      success: false,
      error: "Claude returned no text content",
    };
  }

  const extractedMetrics = parseMetrics(fullText);
  const narrative = extractNarrative(fullText);

  return {
    success: true,
    data: {
      narrative,
      extractedMetrics,
      disclaimer: DISCLAIMER,
    },
  };
}
