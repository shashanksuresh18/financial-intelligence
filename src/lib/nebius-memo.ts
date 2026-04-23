import { AMAKOR_MANDATE_CONTEXT } from "@/lib/amakor-mandate";
import {
  retrieveNebiusMemoContext,
  type RetrievedContextChunk,
} from "@/lib/nebius-retrieval";
import type {
  ConfidenceScore,
  CoverageGap,
  DataSource,
  DisagreementNote,
  EarningsHighlight,
  EntityResolution,
  EvidenceSignal,
  FinancialMetric,
  InvestmentMemo,
  NewsHighlight,
  StreetView,
  ValuationView,
} from "@/lib/types";

const DEFAULT_NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_WHY_NOW_ITEMS = 3;

type NebiusMemoInput = {
  readonly company: string;
  readonly memo: InvestmentMemo;
  readonly confidence: ConfidenceScore;
  readonly entityResolution: EntityResolution;
  readonly metrics: readonly FinancialMetric[];
  readonly streetView: StreetView | null;
  readonly valuationView: ValuationView | null;
  readonly earningsHighlights: readonly EarningsHighlight[];
  readonly newsHighlights: readonly NewsHighlight[];
  readonly evidenceSignals: readonly EvidenceSignal[];
  readonly coverageGaps: readonly CoverageGap[];
  readonly disagreementNotes: readonly DisagreementNote[];
  readonly sources: readonly DataSource[];
};

export type NebiusMemoOverrides = {
  readonly verdict?: string;
  readonly thesis?: string;
  readonly antiThesis?: string;
  readonly whyNow?: readonly string[];
  readonly keyDisqualifier?: string;
  readonly riskSummary?: string;
};

type NebiusChatResponse = {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?:
        | string
        | readonly {
            readonly type?: string;
            readonly text?: string;
          }[];
    };
  }[];
  readonly error?: {
    readonly message?: string;
  };
};

function isNebiusMemoEnabled(): boolean {
  return process.env.USE_NEBIUS_MEMO?.trim().toLowerCase() === "true";
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => normalizeString(item))
    .filter((item): item is string => item !== null)
    .slice(0, MAX_WHY_NOW_ITEMS);

  return normalized.length > 0 ? normalized : null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      const extracted = JSON.parse(text.slice(start, end + 1)) as unknown;

      return extracted !== null &&
        typeof extracted === "object" &&
        !Array.isArray(extracted)
        ? (extracted as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

function formatMetricValue(metric: FinancialMetric): string {
  if (metric.value === null) {
    return "n/a";
  }

  if (typeof metric.value === "string") {
    return metric.value;
  }

  if (metric.label === "Market Cap (USDm)" || metric.label === "Enterprise Value (USDm)") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(metric.value * 1_000_000);
  }

  if (metric.format === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(metric.value);
  }

  if (metric.format === "percent") {
    return `${metric.value.toFixed(1)}%`;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(metric.value);
}

function pickMetrics(metrics: readonly FinancialMetric[]): readonly string[] {
  const preferredLabels = [
    "Current Price",
    "Market Cap (USDm)",
    "Revenue",
    "Net Income",
    "Revenue Growth",
    "Operating Margin",
    "Gross Margin",
    "Free Cash Flow",
    "P/E (TTM)",
    "EV / EBITDA",
    "P/S (TTM)",
  ];

  return preferredLabels
    .map((label) => metrics.find((metric) => metric.label === label) ?? null)
    .filter((metric): metric is FinancialMetric => metric !== null)
    .map(
      (metric) =>
        `${metric.label}: ${formatMetricValue(metric)} (${metric.period ?? "current"}${metric.source ? `, ${metric.source}` : ""})`,
    );
}

function summarizeEntity(entityResolution: EntityResolution): Record<string, string> {
  return entityResolution.identifiers.reduce<Record<string, string>>((summary, identifier) => {
    summary[identifier.label] = identifier.value;
    return summary;
  }, {});
}

function summarizePriceTarget(streetView: StreetView | null): Record<string, unknown> | null {
  if (streetView?.priceTarget === null || streetView?.priceTarget === undefined) {
    return null;
  }

  return {
    targetMean: streetView.priceTarget.targetMean,
    targetLow: streetView.priceTarget.targetLow,
    targetHigh: streetView.priceTarget.targetHigh,
    upsidePercent: streetView.priceTarget.upsidePercent,
  };
}

function summarizeForwardEstimates(
  valuationView: ValuationView | null,
): readonly Record<string, unknown>[] {
  return (valuationView?.forwardEstimates ?? []).slice(0, 3).map((estimate) => ({
    period: estimate.period,
    revenueEstimate: estimate.revenueEstimate,
    epsEstimate: estimate.epsEstimate,
  }));
}

function summarizeValuationMetrics(
  valuationView: ValuationView | null,
): readonly Record<string, unknown>[] {
  return (valuationView?.metrics ?? []).slice(0, 4).map((metric) => ({
    label: metric.label,
    current: metric.current,
    historicalLow: metric.historicalLow,
    historicalHigh: metric.historicalHigh,
    forward: metric.forward,
  }));
}

function summarizeRetrievedContext(
  chunks: readonly RetrievedContextChunk[],
): readonly Record<string, unknown>[] {
  return chunks.map((chunk) => ({
    title: chunk.title,
    source: chunk.source,
    kind: chunk.kind,
    company: chunk.company,
    score: Number(chunk.score.toFixed(4)),
    content: chunk.content,
  }));
}

function buildPromptPayload(
  input: NebiusMemoInput,
  retrievedContext: readonly RetrievedContextChunk[],
): string {
  return JSON.stringify(
    {
      mandate_context: AMAKOR_MANDATE_CONTEXT,
      current_memo: {
        recommendation: input.memo.recommendation,
        displayRecommendationLabel: input.memo.displayRecommendationLabel,
        conviction: input.memo.conviction,
        convictionSummary: input.memo.convictionSummary,
        mandateFit: input.memo.mandateFit,
        role: input.memo.role,
        coverageProfile: input.memo.coverageProfile,
        verdict: input.memo.verdict,
        thesis: input.memo.thesis,
        antiThesis: input.memo.antiThesis,
        whyNow: input.memo.whyNow,
        keyDisqualifier: input.memo.keyDisqualifier,
        supportingReasons: input.memo.logic.supportingReasons,
        confidenceLimitingReasons: input.memo.logic.confidenceLimitingReasons,
      },
      evidence: {
        company: input.company,
        confidenceScore: input.confidence.score,
        confidenceLevel: input.confidence.level,
        sources: input.sources,
        entity: {
          canonicalName: input.entityResolution.displayName,
          summary: input.entityResolution.note,
          identifiers: summarizeEntity(input.entityResolution),
        },
        metrics: pickMetrics(input.metrics),
        priceTarget: summarizePriceTarget(input.streetView),
        forwardEstimates: summarizeForwardEstimates(input.valuationView),
        valuationMetrics: summarizeValuationMetrics(input.valuationView),
        latestEarnings: input.earningsHighlights.slice(0, 3).map((item) => ({
          period: item.period,
          actual: item.actual,
          estimate: item.estimate,
          surprisePercent: item.surprisePercent,
          source: item.source,
        })),
        latestNews: input.newsHighlights.slice(0, 3).map((item) => ({
          headline: item.headline,
          source: item.source,
          publishedAt: item.publishedAt,
          sentimentLabel: item.sentimentLabel,
          sentimentScore: item.sentimentScore,
          sentimentRationale: item.sentimentRationale,
        })),
        evidenceSignals: input.evidenceSignals.slice(0, 6).map((item) => ({
          title: item.title,
          detail: item.detail,
          tone: item.tone,
          sources: item.sources,
        })),
        coverageGaps: input.coverageGaps.slice(0, 6).map((item) => ({
          title: item.title,
          detail: item.detail,
          severity: item.severity,
        })),
        disagreementNotes: input.disagreementNotes.slice(0, 4).map((item) => ({
          title: item.title,
          detail: item.detail,
          sources: item.sources,
        })),
      },
      retrieval_context: summarizeRetrievedContext(retrievedContext),
    },
    null,
    2,
  );
}

function extractMessageContent(response: NebiusChatResponse): string | null {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .join("\n")
      .trim();

    return text.length > 0 ? text : null;
  }

  return null;
}

function normalizeOverrides(raw: Record<string, unknown>): NebiusMemoOverrides | null {
  const overrides: NebiusMemoOverrides = {
    verdict: normalizeString(raw.verdict) ?? undefined,
    thesis: normalizeString(raw.thesis) ?? undefined,
    antiThesis: normalizeString(raw.antiThesis) ?? undefined,
    whyNow: normalizeStringArray(raw.whyNow) ?? undefined,
    keyDisqualifier: normalizeString(raw.keyDisqualifier) ?? undefined,
    riskSummary: normalizeString(raw.riskSummary) ?? undefined,
  };

  return Object.values(overrides).some((value) => value !== undefined) ? overrides : null;
}

function buildSystemPrompt(): string {
  return [
    "You are a senior buy-side investment memo editor working for Amakor Capital.",
    "Rewrite only the selected memo fields to make them company-specific, concise, and grounded in the supplied evidence.",
    "Preserve the current internal recommendation, display recommendation label, role, and conviction exactly as provided; do not invent a new rating system.",
    "You may explicitly mention mandate fit or mandate mismatch if the evidence supports it.",
    "Treat the structured evidence block as authoritative. Use retrieval context only as supporting background, not as a replacement for the primary evidence.",
    "Never invent numbers, filings, margins, catalysts, or risks that are not present in the provided evidence.",
    "If a field cannot be improved safely, stay close to the current memo wording.",
    "Write like a concise buy-side analyst, not a verbose system summary.",
    "Return valid JSON only with these keys:",
    '{ "verdict": string, "thesis": string, "antiThesis": string, "whyNow": string[], "keyDisqualifier": string, "riskSummary": string }',
    "Constraints:",
    "- verdict: one sentence, start with the existing display recommendation label.",
    "- thesis: 1-2 sentences, specific to the company and evidence.",
    "- antiThesis: 1-2 sentences, specific to the biggest limiting factor.",
    "- whyNow: 1 to 3 short bullet-style strings.",
    "- keyDisqualifier: one sentence.",
    "- riskSummary: one sentence.",
  ].join(" ");
}

export function applyNebiusMemoOverrides(
  memo: InvestmentMemo,
  overrides: NebiusMemoOverrides | null,
): InvestmentMemo {
  if (overrides === null) {
    return memo;
  }

  return {
    ...memo,
    verdict: overrides.verdict ?? memo.verdict,
    thesis: overrides.thesis ?? memo.thesis,
    antiThesis: overrides.antiThesis ?? memo.antiThesis,
    whyNow: overrides.whyNow ?? memo.whyNow,
    keyDisqualifier: overrides.keyDisqualifier ?? memo.keyDisqualifier,
  };
}

export async function synthesizeNebiusMemo(
  input: NebiusMemoInput,
): Promise<NebiusMemoOverrides | null> {
  if (!isNebiusMemoEnabled()) {
    return null;
  }

  const apiKey = process.env.NEBIUS_API_KEY?.trim();
  const model = process.env.NEBIUS_LLM_MODEL?.trim();

  if (!apiKey || !model) {
    console.warn("[nebius-memo] skipped", {
      company: input.company,
      reason: "missing_api_key_or_model",
    });
    return null;
  }

  const baseUrl = (process.env.NEBIUS_BASE_URL?.trim() || DEFAULT_NEBIUS_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const retrievedContext = await retrieveNebiusMemoContext({
    company: input.company,
    memo: input.memo,
    evidenceSignals: input.evidenceSignals,
    coverageGaps: input.coverageGaps,
    disagreementNotes: input.disagreementNotes,
    earningsHighlights: input.earningsHighlights,
    newsHighlights: input.newsHighlights,
    sources: input.sources,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        temperature: 0.15,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },
          {
            role: "user",
            content: buildPromptPayload(input, retrievedContext),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 1200);
      console.error("[nebius-memo] request failed", {
        company: input.company,
        model,
        status: response.status,
        body,
      });
      return null;
    }

    const payload = (await response.json()) as NebiusChatResponse;
    const content = extractMessageContent(payload);

    if (content === null) {
      console.error("[nebius-memo] empty response", {
        company: input.company,
        model,
        error: payload.error?.message ?? null,
      });
      return null;
    }

    const parsed = parseJsonObject(content);

    if (parsed === null) {
      console.error("[nebius-memo] invalid json", {
        company: input.company,
        model,
        content,
      });
      return null;
    }

    const overrides = normalizeOverrides(parsed);

    console.info("[nebius-memo] completed", {
      company: input.company,
      model,
      retrievedContext: retrievedContext.length,
      applied: overrides !== null,
    });

    return overrides;
  } catch (error: unknown) {
    console.error("[nebius-memo] request error", {
      company: input.company,
      model,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
