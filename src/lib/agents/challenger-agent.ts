import Anthropic from "@anthropic-ai/sdk";

import type {
  ChallengerItem,
  ChallengerReport,
  InvestmentMemo,
  ValidationReport,
  ValidationSeverity,
  WaterfallResult,
} from "@/lib/types";

const MODEL = "claude-3-5-haiku-20241022";
const MAX_TOKENS = 700;
const SYSTEM_PROMPT =
  "You are a skeptical senior risk analyst at a private equity firm. Your role is to stress-test investment memos by surfacing unstated assumptions, understated evidence gaps, and plausible bear scenarios that the memo writer may have missed or glossed over. Be precise, direct, and always cite which data source (or its absence) grounds your concern.";

type ChallengerAgentInput = {
  readonly company: string;
  readonly draftMemo: InvestmentMemo;
  readonly waterfallResult: WaterfallResult;
  readonly validationReport: ValidationReport;
};

function formatDraftMemo(memo: InvestmentMemo): string {
  const keyRisks =
    memo.keyRisks.length === 0
      ? ["- None"]
      : memo.keyRisks.map(
          (item) => `- [${item.category}] ${item.title}: ${item.detail}`,
        );

  return [
    `Recommendation: ${memo.recommendation}`,
    `Conviction: ${memo.conviction}`,
    `Verdict: ${memo.verdict}`,
    `Thesis: ${memo.thesis}`,
    `Anti-thesis: ${memo.antiThesis}`,
    `Upside case: ${memo.upsideCase}`,
    `Downside case: ${memo.downsideCase}`,
    `Key disqualifier: ${memo.keyDisqualifier}`,
    "Key risks:",
    ...keyRisks,
  ].join("\n");
}

function formatValidationSummary(validationReport: ValidationReport): string {
  const tensions =
    validationReport.tensions.length === 0
      ? ["- None"]
      : validationReport.tensions.map(
          (item) => `- ${item.check} (${item.severity}): ${item.detail}`,
        );
  const gaps =
    validationReport.gaps.length === 0
      ? ["- None"]
      : validationReport.gaps.map(
          (item) => `- ${item.gap} (${item.severity}): ${item.detail}`,
        );

  return [
    `Coverage: ${validationReport.coverageLabel}`,
    `Data quality score: ${validationReport.dataQualityScore}/100`,
    "Tensions:",
    ...tensions,
    "Gaps:",
    ...gaps,
  ].join("\n");
}

function buildChallengerPrompt(input: ChallengerAgentInput): string {
  const activeSources =
    input.waterfallResult.activeSources.length > 0
      ? input.waterfallResult.activeSources.join(", ")
      : "none";

  return `DRAFT MEMO for ${input.company}:
${formatDraftMemo(input.draftMemo)}

VALIDATION REPORT:
${formatValidationSummary(input.validationReport)}

ACTIVE SOURCES: ${activeSources}

Your task: identify exactly -
- 3 unstated assumptions embedded in the memo's thesis or recommendation
- 3 evidence gaps the memo understates or ignores
- 2 counter-scenarios in which the bear case materialises

For each item provide:
- claim: one sentence
- severity: "high" | "medium" | "low"
- citedSource: the relevant source name, or "none" if the concern is about absence of data

Respond ONLY with valid JSON matching this exact schema (no markdown fences, no commentary):
{
  "unstatedAssumptions": [
    {"claim": "...", "severity": "...", "citedSource": "..."},
    {"claim": "...", "severity": "...", "citedSource": "..."},
    {"claim": "...", "severity": "...", "citedSource": "..."}
  ],
  "evidenceGaps": [
    {"claim": "...", "severity": "...", "citedSource": "..."},
    {"claim": "...", "severity": "...", "citedSource": "..."},
    {"claim": "...", "severity": "...", "citedSource": "..."}
  ],
  "counterScenarios": [
    {"claim": "...", "severity": "...", "citedSource": "..."},
    {"claim": "...", "severity": "...", "citedSource": "..."}
  ]
}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceSeverity(value: unknown): ValidationSeverity {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function normalizeItems(value: unknown, limit: number): readonly ChallengerItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item) || typeof item.claim !== "string") {
        return null;
      }

      const claim = item.claim.trim();

      if (claim.length === 0) {
        return null;
      }

      const citedSource =
        typeof item.citedSource === "string" && item.citedSource.trim().length > 0
          ? item.citedSource.trim()
          : "none";

      return {
        claim,
        severity: coerceSeverity(item.severity),
        citedSource,
      } satisfies ChallengerItem;
    })
    .filter((item): item is ChallengerItem => item !== null)
    .slice(0, limit);
}

function parseChallengerResponse(raw: string): ChallengerReport | null {
  try {
    const parsed: unknown = JSON.parse(raw.trim());

    if (!isRecord(parsed)) {
      return null;
    }

    if (
      !Array.isArray(parsed.unstatedAssumptions) ||
      !Array.isArray(parsed.evidenceGaps) ||
      !Array.isArray(parsed.counterScenarios)
    ) {
      return null;
    }

    return {
      unstatedAssumptions: normalizeItems(parsed.unstatedAssumptions, 3),
      evidenceGaps: normalizeItems(parsed.evidenceGaps, 3),
      counterScenarios: normalizeItems(parsed.counterScenarios, 2),
    };
  } catch {
    return null;
  }
}

function emptyChallengerReport(): ChallengerReport {
  return {
    unstatedAssumptions: [],
    evidenceGaps: [],
    counterScenarios: [],
  };
}

export async function runChallengerAgent(
  input: ChallengerAgentInput,
): Promise<ChallengerReport> {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildChallengerPrompt(input),
        },
      ],
    });
    const raw = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    const parsed = parseChallengerResponse(raw);

    console.info("[challenger-agent] succeeded", {
      company: input.company,
      model: MODEL,
      assumptionCount: parsed?.unstatedAssumptions.length ?? 0,
      gapCount: parsed?.evidenceGaps.length ?? 0,
      scenarioCount: parsed?.counterScenarios.length ?? 0,
    });

    return parsed ?? emptyChallengerReport();
  } catch (error: unknown) {
    console.error("[challenger-agent] failed", {
      company: input.company,
      error: String(error),
    });

    return emptyChallengerReport();
  }
}
