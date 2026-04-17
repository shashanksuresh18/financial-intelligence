import Anthropic from "@anthropic-ai/sdk";

import type { NarrativeInput, NarrativeResult } from "@/lib/types";
import { parseNarrativeSections } from "@/lib/narrative-sections";

const MODEL_CANDIDATES = [
  process.env.ANTHROPIC_MODEL?.trim(),
  "claude-sonnet-4-20250514",
].filter((value): value is string => typeof value === "string" && value.length > 0);
const MAX_TOKENS = 1400;
const FALLBACK_NARRATIVE =
  "Analysis data is available in the evidence panels, but a narrative brief could not be generated.";
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const typedError = error as Error & {
      readonly status?: number;
      readonly headers?: unknown;
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

function formatMetrics(input: NarrativeInput): string {
  const xbrlFacts = input.waterfallResult.secEdgar?.data.xbrlFacts;
  const finnhub = input.waterfallResult.finnhub?.data;
  const fmp = input.waterfallResult.fmp?.data;
  const companiesHouse = input.waterfallResult.companiesHouse?.data;
  const companiesHouseProfile = companiesHouse?.profile ?? null;
  const latestAccountsFiling = companiesHouse?.accountsFilings[0] ?? null;
  const quote = finnhub?.quote;
  const basicFinancials = finnhub?.basicFinancials?.metric;
  const priceTarget = finnhub?.priceTarget;
  const latestRecommendation = [...(finnhub?.recommendations ?? [])].sort(
    (left, right) => right.period.localeCompare(left.period),
  )[0];
  const latestEarnings = finnhub?.earnings.slice(0, 2) ?? [];
  const latestInsider = finnhub?.insiderTransactions[0];
  const recentNews = finnhub?.news.slice(0, 3) ?? [];
  const fallbackNarrative =
    input.waterfallResult.claudeFallback?.data.narrative.trim() ?? "";
  const fallbackMetrics = input.waterfallResult.claudeFallback?.data.extractedMetrics ?? [];
  const companiesHouseNextDue =
    companiesHouseProfile?.accounts?.next_accounts?.due_on ??
    companiesHouseProfile?.accounts?.next_due ??
    null;

  const formatCurrency = (
    value: number | null,
    maximumFractionDigits: number,
  ): string =>
    value === null
      ? "n/a"
      : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits,
        minimumFractionDigits: maximumFractionDigits,
      }).format(value);
  const formatNumber = (value: number): string =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value);
  const formatPercent = (value: number): string =>
    Math.abs(value) <= 1
      ? new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 1,
        style: "percent",
      }).format(value)
      : `${formatNumber(value)}%`;
  const latestHistoricalMultiple = fmp?.historicalMultiples[0];
  const historicalPeValues = (fmp?.historicalMultiples ?? [])
    .map((item) => item.peRatio)
    .filter((item): item is number => item !== null);
  const historicalEvToEbitdaValues = (fmp?.historicalMultiples ?? [])
    .map((item) => item.evToEbitda)
    .filter((item): item is number => item !== null);
  const forwardEstimates = fmp?.analystEstimates.slice(0, 2) ?? [];
  const priceTargetConsensus = fmp?.priceTargetConsensus;
  const peerLines = (fmp?.peers ?? []).slice(0, 3).map((item) => {
    const valuationBits = [
      item.peRatio === null ? null : `P/E ${formatNumber(item.peRatio)}x`,
      item.evToEbitda === null
        ? null
        : `EV / EBITDA ${formatNumber(item.evToEbitda)}x`,
      item.revenueGrowth === null
        ? null
        : `revenue growth ${formatPercent(item.revenueGrowth)}`,
    ].filter((value): value is string => value !== null);

    return `- Peer (${item.symbol}): ${item.companyName}${valuationBits.length === 0 ? "" : `; ${valuationBits.join(", ")}`
      }`;
  });

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
  const recommendationLine =
    latestRecommendation === undefined
      ? null
      : `- Street consensus (${latestRecommendation.period}): strong buy ${latestRecommendation.strongBuy}, buy ${latestRecommendation.buy}, hold ${latestRecommendation.hold}, sell ${latestRecommendation.sell}, strong sell ${latestRecommendation.strongSell}`;
  const earningsLines = latestEarnings.map((item) => {
    const surprisePart =
      item.surprisePercent === null
        ? "surprise unavailable"
        : `surprise ${formatPercent(item.surprisePercent)}`;

    return `- Earnings (${item.period}): actual ${item.actual === null ? "n/a" : formatNumber(item.actual)
      }, estimate ${item.estimate === null ? "n/a" : formatNumber(item.estimate)}, ${surprisePart}`;
  });
  const insiderLine =
    latestInsider === undefined
      ? null
      : `- Latest insider activity: ${latestInsider.name} ${latestInsider.transactionCode} on ${latestInsider.transactionDate} (${latestInsider.change === null ? "change unavailable" : `${formatNumber(latestInsider.change)} shares change`})`;
  const newsLines = recentNews.map((item) => {
    const publishedAt = new Date(item.datetime * 1000).toISOString().slice(0, 10);

    return `- Recent headline (${item.source}, ${publishedAt}): ${item.headline}`;
  });
  const fallbackMetricLines = fallbackMetrics.map((item) => {
    const value =
      typeof item.value === "number"
        ? formatNumber(item.value)
        : item.value === null
          ? "n/a"
          : item.value;

    return `- Web-enriched metric${item.period ? ` (${item.period})` : ""}: ${item.label} = ${value}`;
  });

  const lines = [
    ...(revenue !== null
      ? [`- Revenue: ${formatCurrency(revenue, 0)} (Latest FY)`]
      : []),
    ...(netIncome !== null
      ? [`- Net Income: ${formatCurrency(netIncome, 0)} (Latest FY)`]
      : []),
    ...(companiesHouseProfile?.date_of_creation !== undefined
      ? [`- UK incorporation date: ${companiesHouseProfile.date_of_creation}`]
      : []),
    ...(companiesHouseProfile?.company_type.trim().length
      ? [`- UK company type: ${companiesHouseProfile.company_type}`]
      : []),
    ...(companiesHouseProfile?.accounts?.last_accounts?.made_up_to !== undefined
      ? [
        `- Companies House last accounts made up to: ${companiesHouseProfile.accounts.last_accounts.made_up_to}${companiesHouseProfile.accounts.last_accounts.type ? ` (${companiesHouseProfile.accounts.last_accounts.type})` : ""
        }`,
      ]
      : []),
    ...(companiesHouseNextDue !== null
      ? [`- Companies House next accounts due: ${companiesHouseNextDue}`]
      : []),
    ...(companiesHouseProfile?.accounts?.next_accounts?.overdue === true
      ? ["- Companies House marks the next accounts as overdue"]
      : []),
    ...(latestAccountsFiling !== null
      ? [
        `- Latest Companies House accounts filing: ${latestAccountsFiling.date} (${latestAccountsFiling.type})`,
      ]
      : []),
    ...(quote !== null && quote !== undefined && quote.t !== 0
      ? [`- Current Price: ${formatCurrency(quote.c, 2)}`]
      : []),
    ...(basicFinancials?.peBasicExclExtraTTM !== null &&
      basicFinancials?.peBasicExclExtraTTM !== undefined
      ? [`- P/E (TTM): ${formatNumber(basicFinancials.peBasicExclExtraTTM)}x`]
      : []),
    ...(basicFinancials?.evEbitdaTTM !== null &&
      basicFinancials?.evEbitdaTTM !== undefined
      ? [`- EV / EBITDA (TTM): ${formatNumber(basicFinancials.evEbitdaTTM)}x`]
      : []),
    ...(basicFinancials?.revenueGrowthTTMYoy !== null &&
      basicFinancials?.revenueGrowthTTMYoy !== undefined
      ? [
        `- Revenue Growth (TTM YoY): ${formatPercent(
          basicFinancials.revenueGrowthTTMYoy,
        )}`,
      ]
      : []),
    ...(basicFinancials?.netMarginTTM !== null &&
      basicFinancials?.netMarginTTM !== undefined
      ? [`- Net Margin (TTM): ${formatPercent(basicFinancials.netMarginTTM)}`]
      : []),
    ...(priceTarget?.targetMean !== null && priceTarget?.targetMean !== undefined
      ? [
        `- Mean Price Target: ${formatCurrency(priceTarget.targetMean, 2)}${priceTarget.lastUpdated ? ` (updated ${priceTarget.lastUpdated})` : ""
        }`,
      ]
      : []),
    ...(latestHistoricalMultiple?.peRatio !== null &&
      latestHistoricalMultiple?.peRatio !== undefined
      ? [
        `- Latest historical P/E from FMP (${latestHistoricalMultiple.date}): ${formatNumber(
          latestHistoricalMultiple.peRatio,
        )}x`,
      ]
      : []),
    ...(historicalPeValues.length > 0
      ? [
        `- Historical P/E range from FMP: ${formatNumber(
          Math.min(...historicalPeValues),
        )}x to ${formatNumber(Math.max(...historicalPeValues))}x`,
      ]
      : []),
    ...(historicalEvToEbitdaValues.length > 0
      ? [
        `- Historical EV / EBITDA range from FMP: ${formatNumber(
          Math.min(...historicalEvToEbitdaValues),
        )}x to ${formatNumber(Math.max(...historicalEvToEbitdaValues))}x`,
      ]
      : []),
    ...forwardEstimates.map((item) => {
      const estimateBits = [
        item.estimatedRevenueAvg === null
          ? null
          : `revenue ${formatCurrency(item.estimatedRevenueAvg, 0)}`,
        item.estimatedEpsAvg === null
          ? null
          : `EPS ${formatNumber(item.estimatedEpsAvg)}`,
      ].filter((value): value is string => value !== null);

      return `- Forward estimate (${item.date}): ${estimateBits.length === 0 ? "coverage unavailable" : estimateBits.join(", ")
        }`;
    }),
    ...(priceTargetConsensus?.targetConsensus !== null &&
      priceTargetConsensus?.targetConsensus !== undefined
      ? [
        `- FMP target consensus: ${formatCurrency(
          priceTargetConsensus.targetConsensus,
          2,
        )}; high ${formatCurrency(priceTargetConsensus.targetHigh ?? null, 2)}; low ${formatCurrency(
          priceTargetConsensus.targetLow ?? null,
          2,
        )}`,
      ]
      : []),
    ...peerLines,
    ...(recommendationLine === null ? [] : [recommendationLine]),
    ...earningsLines,
    ...(insiderLine === null ? [] : [insiderLine]),
    ...newsLines,
    ...fallbackMetricLines,
    ...(fallbackNarrative.length > 0
      ? [
        `- Claude fallback summary: ${fallbackNarrative.replace(/\s+/g, " ")}`,
      ]
      : []),
  ];

  return lines.length > 0 ? lines.join("\n") : "No structured financial data available.";
}

function formatResearchOps(input: NarrativeInput): string {
  const signalLines = input.evidenceSignals.map(
    (item) =>
      `- ${item.title}: ${item.detail} [${item.sources.join(", ")}]`,
  );
  const gapLines = input.coverageGaps.map(
    (item) => `- ${item.title} (${item.severity}): ${item.detail}`,
  );
  const disagreementLines = input.disagreementNotes.map(
    (item) =>
      `- ${item.title}: ${item.detail} [${item.sources.join(", ")}]`,
  );

  return [
    signalLines.length > 0
      ? `Evidence signals:\n${signalLines.join("\n")}`
      : "Evidence signals:\n- No prioritized evidence signals were extracted.",
    gapLines.length > 0
      ? `Coverage gaps:\n${gapLines.join("\n")}`
      : "Coverage gaps:\n- No material coverage gaps were flagged.",
    disagreementLines.length > 0
      ? `Disagreement notes:\n${disagreementLines.join("\n")}`
      : "Disagreement notes:\n- No major tensions were detected in the current evidence set.",
  ].join("\n\n");
}

function formatEntityResolution(input: NarrativeInput): string {
  const identifierLines = input.entityResolution.identifiers.map(
    (item) => `- ${item.label}: ${item.value} [${item.source}]`,
  );

  return [
    `Primary source: ${input.entityResolution.primarySource ?? "unresolved"}`,
    `Canonical name: ${input.entityResolution.canonicalName}`,
    `Resolution note: ${input.entityResolution.note}`,
    identifierLines.length > 0
      ? `Identifiers:\n${identifierLines.join("\n")}`
      : "Identifiers:\n- No structured identifiers were resolved.",
  ].join("\n");
}

function formatSectionAudit(input: NarrativeInput): string {
  return input.sectionAudit
    .map(
      (item) =>
        `- ${item.section} (${item.status}): ${item.note} [${item.sources.join(", ")}]`,
    )
    .join("\n");
}

function formatInvestmentMemo(input: NarrativeInput): string {
  const whyNow = input.investmentMemo.whyNow.map((item) => `- ${item}`).join("\n");
  const keyRisks = input.investmentMemo.keyRisks
    .map((item) => `- [${item.category}] ${item.title}: ${item.detail}`)
    .join("\n");
  const improveConfidence = input.investmentMemo.whatImprovesConfidence
    .map((item) => `- ${item}`)
    .join("\n");
  const reduceConfidence = input.investmentMemo.whatReducesConfidence
    .map((item) => `- ${item}`)
    .join("\n");
  const verifiedFacts = input.investmentMemo.verifiedFacts
    .map((item) => `- ${item}`)
    .join("\n");
  const unknowns = input.investmentMemo.unknowns.map((item) => `- ${item}`).join("\n");

  return [
    `Recommendation: ${input.investmentMemo.recommendation}`,
    `Conviction: ${input.investmentMemo.conviction}`,
    `Coverage profile: ${input.investmentMemo.coverageProfile}`,
    `Verdict: ${input.investmentMemo.verdict}`,
    `Thesis: ${input.investmentMemo.thesis}`,
    `Anti-thesis: ${input.investmentMemo.antiThesis}`,
    `Business snapshot: ${input.investmentMemo.businessSnapshot}`,
    `Valuation case: ${input.investmentMemo.valuationCase}`,
    `Why now:\n${whyNow}`,
    `Key disqualifier: ${input.investmentMemo.keyDisqualifier}`,
    `Upside case: ${input.investmentMemo.upsideCase}`,
    `Downside case: ${input.investmentMemo.downsideCase}`,
    `Key risks:\n${keyRisks}`,
    `What improves confidence:\n${improveConfidence}`,
    `What reduces confidence:\n${reduceConfidence}`,
    `Verified facts:\n${verifiedFacts}`,
    `Unknowns:\n${unknowns}`,
  ].join("\n");
}

function buildPrompt(input: NarrativeInput): string {
  return `You are writing an institutional-quality research note for investment professionals on ${input.company}.

Entity resolution:
${formatEntityResolution(input)}

Investment memo anchor:
${formatInvestmentMemo(input)}

Available data (from: ${input.waterfallResult.activeSources.join(", ")}):
${formatMetrics(input)}

Research operations layer:
${formatResearchOps(input)}

Section audit:
${formatSectionAudit(input)}

Confidence score: ${input.confidence.score}/100 (${input.confidence.level})
Confidence rationale: ${input.confidence.rationale}

Rules:
- Use ONLY the evidence above. Do not invent or estimate any numbers.
- If a data point is missing, say it is unavailable instead of guessing.
- Every numeric claim should include a source tag where possible using only these labels: [SEC EDGAR], [Finnhub], [FMP], [Companies House], [GLEIF], [Claude Fallback].
- Use the canonical company name and identifiers from the entity-resolution block when naming the company.
- Call out Street view explicitly when recommendation, target, earnings, or recent-news evidence is present.
- In the Valuation section, compare current multiples with historical ranges and forward estimates when FMP evidence is present.
- Use the research operations layer: promote the strongest evidence signals, explicitly mention material coverage gaps, call out disagreement notes when present, and respect section-audit limitations.
- If data comes primarily from fallback web search, say so clearly.
- If the company is covered mainly by Companies House, use registry/accounts metadata to describe the legal entity and filing timetable, but do not pretend full financial-statement coverage exists.
- If management-style positioning and Street evidence appear to diverge, call that out explicitly.
- The Executive Summary should read like an investment memo opening and stay aligned with the memo anchor unless the evidence blocks force a more cautious interpretation.
- Write each section heading as plain uppercase text only. Do not add markdown symbols like ** or ## around headings.
- Return plain text with these EXACT section headings on their own lines:
EXECUTIVE SUMMARY
COMPANY OVERVIEW
FINANCIAL ANALYSIS
VALUATION
STREET CONSENSUS
RISK FACTORS
CATALYSTS & OUTLOOK
- Keep each section short and useful. If valuation or Street evidence is unavailable, say so explicitly in that section.
- Maximum 420 words total.`;
}

export async function generateNarrative(
  input: NarrativeInput,
): Promise<NarrativeResult> {
  let client: Anthropic;

  try {
    client = new Anthropic();
  } catch (error: unknown) {
    console.error("[claude-narrative] API error", {
      company: input.company,
      error: serializeError(error),
      modelCandidates: MODEL_CANDIDATES,
    });

    return {
      narrative: FALLBACK_NARRATIVE,
      sections: parseNarrativeSections(FALLBACK_NARRATIVE),
    };
  }

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await client.messages.create({
        model,
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

      console.info("[claude-narrative] messages.create succeeded", {
        company: input.company,
        model,
        textLength: text.length,
      });

      const narrative = text.length > 0 ? text : FALLBACK_NARRATIVE;

      return {
        narrative,
        sections: parseNarrativeSections(narrative),
      };
    } catch (error: unknown) {
      console.error("[claude-narrative] messages.create failed", {
        company: input.company,
        error: serializeError(error),
        model,
      });
    }
  }

  return {
    narrative: FALLBACK_NARRATIVE,
    sections: parseNarrativeSections(FALLBACK_NARRATIVE),
  };
}
