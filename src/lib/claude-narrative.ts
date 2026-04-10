import Anthropic from "@anthropic-ai/sdk";

import type { NarrativeInput } from "@/lib/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800;
const FALLBACK_NARRATIVE = "Analysis data is available in the metrics table above.";

function formatMetrics(input: NarrativeInput): string {
  const xbrlFacts = input.waterfallResult.secEdgar?.data.xbrlFacts;
  const quote = input.waterfallResult.finnhub?.data.quote;
  const fallbackNarrative =
    input.waterfallResult.claudeFallback?.data.narrative.trim() ?? "";

  const formatCurrency = (
    value: number,
    maximumFractionDigits: number,
  ): string =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits,
      minimumFractionDigits: maximumFractionDigits,
    }).format(value);

  const extractLatestFact = (concepts: readonly string[]): number | null => {
    if (xbrlFacts === null || xbrlFacts === undefined) {
      return null;
    }

    const taxonomies = [xbrlFacts.facts["us-gaap"], xbrlFacts.facts["ifrs-full"]];

    for (const taxonomy of taxonomies) {
      if (taxonomy === undefined) {
        continue;
      }

      for (const conceptName of concepts) {
        const annualFacts =
          taxonomy[conceptName]?.units["USD"]?.filter(
            (fact) => fact.form === "10-K",
          ) ?? [];
        const latestFact = [...annualFacts].sort((left, right) =>
          right.filed.localeCompare(left.filed),
        )[0];

        if (latestFact !== undefined) {
          return latestFact.val;
        }
      }
    }

    return null;
  };

  const revenue = extractLatestFact([
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
  ]);
  const netIncome = extractLatestFact([
    "NetIncomeLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
  ]);

  const lines = [
    ...(revenue !== null
      ? [`- Revenue: ${formatCurrency(revenue, 0)} (Latest FY)`]
      : []),
    ...(netIncome !== null
      ? [`- Net Income: ${formatCurrency(netIncome, 0)} (Latest FY)`]
      : []),
    ...(quote !== null && quote !== undefined && quote.t !== 0
      ? [`- Current Price: ${formatCurrency(quote.c, 2)}`]
      : []),
    ...(fallbackNarrative.length > 0
      ? [
          `- Claude fallback summary: ${fallbackNarrative.replace(/\s+/g, " ")}`,
        ]
      : []),
  ];

  return lines.length > 0 ? lines.join("\n") : "No structured financial data available.";
}

function buildPrompt(input: NarrativeInput): string {
  return `You are a financial analyst. Write a 3-paragraph analyst brief for ${input.company}.

Available data (from: ${input.waterfallResult.activeSources.join(", ")}):
${formatMetrics(input)}

Confidence level: ${input.confidence.level} (${input.confidence.rationale})

Rules:
- Only cite figures from the data above. Do not invent or estimate any numbers.
- Paragraph 1: company overview and market position.
- Paragraph 2: financial highlights - use exact figures if present, acknowledge gaps if not.
- Paragraph 3: data quality note referencing confidence level and active sources.
- Maximum 200 words total.`;
}

export async function generateNarrative(
  input: NarrativeInput,
): Promise<string> {
  let client: Anthropic;

  try {
    client = new Anthropic();
  } catch (error: unknown) {
    console.error("[claude-narrative] API error", {
      company: input.company,
      error,
    });

    return FALLBACK_NARRATIVE;
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: buildPrompt(input),
        },
      ],
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return text.length > 0 ? text : FALLBACK_NARRATIVE;
  } catch (error: unknown) {
    console.error("[claude-narrative] API error", {
      company: input.company,
      error,
    });

    return FALLBACK_NARRATIVE;
  }
}
