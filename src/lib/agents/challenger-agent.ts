import Anthropic from '@anthropic-ai/sdk';

import { AMAKOR_MANDATE_CONTEXT } from '@/lib/amakor-mandate';
import type {
  ChallengerItem,
  ChallengerReport,
  InvestmentMemo,
  ValidationReport,
  ValidationSeverity,
  WaterfallResult,
} from '@/lib/types';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 2000;
const TRUNCATION_WARNING_TOKEN_BUFFER = 50;
const RESPONSE_TAIL_LENGTH = 100;
const SYSTEM_PROMPT = `You are a skeptical senior risk analyst at Amakor Capital, a London-based growth equity firm. Your role is to stress-test investment memos against Amakor specific mandate before capital is committed.

${AMAKOR_MANDATE_CONTEXT}

For each memo, your challenges must reference Amakor mandate criteria. Specifically consider:
- Does the company meet the revenue threshold (50M plus for growth equity, 25-200M deal size)?
- Does it align with a specific Meta Trend category, or is the thematic fit weak?
- Does it trigger any red flags (high capex, hardware-primary, marketing-led growth, biotech)?
- What is the moat quality? Is growth product-led or marketing-led?
- Could this be sourced via proactive origination or would auction dynamics cause Amakor to pass?

Your unstated assumptions should highlight mandate-critical assumptions. Your evidence gaps should identify missing data that Amakor would demand. Your counter-scenarios should include at least one where the mandate filter causes Amakor to pass on the deal.

Severity calibration:
- Assumption conflicting with a red flag: HIGH severity
- Unverified revenue for growth-equity candidate: HIGH severity
- Missing Meta Trend alignment: HIGH severity
- Generic market risks unrelated to mandate: MEDIUM or LOW severity

Be precise, direct, and always cite which data source (or its absence) grounds your concern. Respond with ONLY valid JSON and no markdown or prose.`;

type ChallengerAgentInput = {
  readonly company: string;
  readonly draftMemo: InvestmentMemo;
  readonly waterfallResult: WaterfallResult;
  readonly validationReport: ValidationReport;
};

type ChallengerPayload = {
  readonly unstatedAssumptions: unknown;
  readonly evidenceGaps: unknown;
  readonly counterScenarios: unknown;
};

type ParseChallengerOptions = {
  readonly maxTokens: number;
  readonly outputTokens: number | null;
  readonly stopReason: string | null;
};

type JsonStructureAnalysis = {
  readonly inString: boolean;
  readonly stack: readonly ('{' | '[')[];
  readonly lastClosedObjectIndex: number;
  readonly lastArrayElementIndex: number;
};

function formatDraftMemo(memo: InvestmentMemo): string {
  const keyRisks =
    memo.keyRisks.length === 0
      ? ['- None']
      : memo.keyRisks.map(
          (item) => `- [${item.category}] ${item.title}: ${item.detail}`
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
    'Key risks:',
    ...keyRisks,
  ].join('\n');
}

function formatValidationSummary(validationReport: ValidationReport): string {
  const tensions =
    validationReport.tensions.length === 0
      ? ['- None']
      : validationReport.tensions.map(
          (item) => `- ${item.check} (${item.severity}): ${item.detail}`
        );
  const gaps =
    validationReport.gaps.length === 0
      ? ['- None']
      : validationReport.gaps.map(
          (item) => `- ${item.gap} (${item.severity}): ${item.detail}`
        );

  return [
    `Coverage: ${validationReport.coverageLabel}`,
    `Data quality score: ${validationReport.dataQualityScore}/100`,
    'Tensions:',
    ...tensions,
    'Gaps:',
    ...gaps,
  ].join('\n');
}

function buildChallengerPrompt(input: ChallengerAgentInput): string {
  const activeSources =
    input.waterfallResult.activeSources.length > 0
      ? input.waterfallResult.activeSources.join(', ')
      : 'none';

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
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceSeverity(value: unknown): ValidationSeverity {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : 'medium';
}

function normalizeItems(
  value: unknown,
  limit: number
): readonly ChallengerItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        const claim = item.trim();

        if (claim.length === 0) {
          return null;
        }

        return {
          claim,
          severity: 'medium',
          citedSource: 'none',
        } satisfies ChallengerItem;
      }

      if (!isRecord(item)) {
        return null;
      }

      const rawClaim =
        typeof item.claim === 'string'
          ? item.claim
          : typeof item.description === 'string'
            ? item.description
            : null;

      if (rawClaim === null) {
        return null;
      }

      const claim = rawClaim.trim();

      if (claim.length === 0) {
        return null;
      }

      const citedSource =
        typeof item.citedSource === 'string' &&
        item.citedSource.trim().length > 0
          ? item.citedSource.trim()
          : typeof item.cited_source === 'string' &&
              item.cited_source.trim().length > 0
            ? item.cited_source.trim()
            : typeof item.source === 'string' && item.source.trim().length > 0
              ? item.source.trim()
              : 'none';

      return {
        claim,
        severity: coerceSeverity(
          'severity' in item
            ? item.severity
            : 'level' in item
              ? item.level
              : null
        ),
        citedSource,
      } satisfies ChallengerItem;
    })
    .filter((item): item is ChallengerItem => item !== null)
    .slice(0, limit);
}

function stripMarkdownCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function endsWithJsonClosingBrace(raw: string): boolean {
  return stripMarkdownCodeFences(raw).trim().endsWith('}');
}

function isNearMaxTokens(options: ParseChallengerOptions): boolean {
  return (
    options.outputTokens !== null &&
    options.maxTokens - options.outputTokens <= TRUNCATION_WARNING_TOKEN_BUFFER
  );
}

function responseAppearsTruncated(
  raw: string,
  options: ParseChallengerOptions
): boolean {
  return (
    options.stopReason === 'max_tokens' ||
    isNearMaxTokens(options) ||
    !endsWithJsonClosingBrace(raw)
  );
}

function buildJsonCandidates(raw: string): readonly string[] {
  const candidates: string[] = [];
  const addCandidate = (value: string): void => {
    const candidate = value.trim();

    if (candidate.length === 0 || candidates.includes(candidate)) {
      return;
    }

    candidates.push(candidate);
  };

  const trimmed = raw.trim();
  addCandidate(trimmed);
  addCandidate(stripMarkdownCodeFences(trimmed));

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1] !== undefined) {
    addCandidate(fencedMatch[1]);
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    addCandidate(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return candidates;
}

function analyzeJsonStructure(candidate: string): JsonStructureAnalysis {
  const stack: ('{' | '[')[] = [];
  let inString = false;
  let isEscaped = false;
  let lastClosedObjectIndex = -1;
  let lastArrayElementIndex = -1;

  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}') {
      const current = stack[stack.length - 1] ?? null;
      const parent = stack[stack.length - 2] ?? null;

      if (current === '{') {
        lastClosedObjectIndex = index;

        if (parent === '[') {
          lastArrayElementIndex = index;
        }

        stack.pop();
      }

      continue;
    }

    if (char === ']') {
      const current = stack[stack.length - 1] ?? null;

      if (current === '[') {
        stack.pop();
      }
    }
  }

  return {
    inString,
    stack: [...stack],
    lastClosedObjectIndex,
    lastArrayElementIndex,
  };
}

function trimTrailingJsonFragments(candidate: string): string {
  return candidate.replace(/[\s,:]+$/u, '').trimEnd();
}

function repairTruncatedJsonCandidate(candidate: string): string | null {
  const trimmed = candidate.trim();
  const firstBrace = trimmed.indexOf('{');

  if (firstBrace < 0) {
    return null;
  }

  let repaired = trimmed.slice(firstBrace);
  let analysis = analyzeJsonStructure(repaired);
  const cutIndex =
    analysis.lastArrayElementIndex >= 0
      ? analysis.lastArrayElementIndex
      : analysis.lastClosedObjectIndex;

  if (cutIndex >= 0 && cutIndex < repaired.length - 1) {
    repaired = repaired.slice(0, cutIndex + 1);
    analysis = analyzeJsonStructure(repaired);
  }

  repaired = trimTrailingJsonFragments(repaired);
  analysis = analyzeJsonStructure(repaired);

  if (analysis.inString) {
    repaired = `${repaired}"`;
    analysis = analyzeJsonStructure(repaired);
  }

  repaired = trimTrailingJsonFragments(repaired);
  analysis = analyzeJsonStructure(repaired);

  if (analysis.stack.length === 0) {
    return repaired;
  }

  const closingSequence = [...analysis.stack]
    .reverse()
    .map((token) => (token === '{' ? '}' : ']'))
    .join('');

  return `${repaired}${closingSequence}`;
}

function getPayloadFromRecord(
  value: Record<string, unknown>
): ChallengerPayload | null {
  const unstatedAssumptions =
    value.unstatedAssumptions ?? value.unstated_assumptions;
  const evidenceGaps = value.evidenceGaps ?? value.evidence_gaps;
  const counterScenarios = value.counterScenarios ?? value.counter_scenarios;

  if (
    !Array.isArray(unstatedAssumptions) ||
    !Array.isArray(evidenceGaps) ||
    !Array.isArray(counterScenarios)
  ) {
    return null;
  }

  return {
    unstatedAssumptions,
    evidenceGaps,
    counterScenarios,
  };
}

function collectNestedRecords(
  value: unknown
): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNestedRecords(item));
  }

  if (!isRecord(value)) {
    return [];
  }

  return [
    value,
    ...Object.values(value)
      .map((item) => collectNestedRecords(item))
      .flat(),
  ];
}

function findChallengerPayload(value: unknown): ChallengerPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const directPayload = getPayloadFromRecord(value);

  if (directPayload !== null) {
    return directPayload;
  }

  console.warn('[challenger-agent] JSON object missing expected keys', {
    keys: Object.keys(value),
  });

  for (const record of collectNestedRecords(value)) {
    const payload = getPayloadFromRecord(record);

    if (payload !== null) {
      console.info('[challenger-agent] using nested payload', {
        keys: Object.keys(record),
      });

      return payload;
    }
  }

  return null;
}

function createChallengerReport(payload: ChallengerPayload): ChallengerReport {
  return {
    unstatedAssumptions: normalizeItems(payload.unstatedAssumptions, 3),
    evidenceGaps: normalizeItems(payload.evidenceGaps, 3),
    counterScenarios: normalizeItems(payload.counterScenarios, 2),
  };
}

function logParsedCounts(report: ChallengerReport): void {
  console.info(
    `[challenger-agent] parsed ${report.unstatedAssumptions.length} unstatedAssumptions, ${report.evidenceGaps.length} evidenceGaps, ${report.counterScenarios.length} counterScenarios`
  );
}

function parseJsonCandidate(candidate: string): ChallengerReport | null {
  const parsed: unknown = JSON.parse(candidate);
  const payload = findChallengerPayload(parsed);

  if (payload === null) {
    return null;
  }

  const report = createChallengerReport(payload);
  logParsedCounts(report);

  return report;
}

export function parseChallengerResponse(
  raw: string,
  options: ParseChallengerOptions
): ChallengerReport | null {
  let lastError: string | null = null;
  const candidates = buildJsonCandidates(raw);

  for (const candidate of candidates) {
    try {
      return parseJsonCandidate(candidate);
    } catch (error: unknown) {
      lastError = String(error);
    }
  }

  const appearsTruncated = responseAppearsTruncated(raw, options);

  if (lastError !== null) {
    console.error('[challenger-agent] JSON parse failed', {
      error: lastError,
      appearsTruncated,
      outputTokens: options.outputTokens,
      stopReason: options.stopReason,
    });
  }

  if (appearsTruncated) {
    let repairError: string | null = null;

    for (const candidate of candidates) {
      const repairedCandidate = repairTruncatedJsonCandidate(candidate);

      if (
        repairedCandidate === null ||
        repairedCandidate === candidate.trim()
      ) {
        continue;
      }

      console.warn('[challenger-agent] attempting truncated JSON repair', {
        originalLength: candidate.length,
        repairedLength: repairedCandidate.length,
      });

      try {
        const repairedReport = parseJsonCandidate(repairedCandidate);

        console.info('[challenger-agent] recovered truncated JSON response');

        return repairedReport;
      } catch (error: unknown) {
        repairError = String(error);
      }
    }

    if (repairError !== null) {
      console.error('[challenger-agent] truncated JSON repair failed', {
        error: repairError,
      });
    }
  }

  return null;
}

function emptyChallengerReport(): ChallengerReport {
  return {
    unstatedAssumptions: [],
    evidenceGaps: [],
    counterScenarios: [],
  };
}

export async function runChallengerAgent(
  input: ChallengerAgentInput
): Promise<ChallengerReport> {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildChallengerPrompt(input),
        },
      ],
    });
    const raw = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    const outputTokens = response.usage.output_tokens;
    const endsWithClosingBrace = endsWithJsonClosingBrace(raw);

    console.log(
      '[challenger-agent] response length',
      {
        chars: raw.length,
        tokens: outputTokens,
        maxTokens: MAX_TOKENS,
        endsWithClosingBrace,
        stopReason: response.stop_reason,
      },
      'ends with:',
      raw.slice(-RESPONSE_TAIL_LENGTH)
    );

    if (
      outputTokens !== null &&
      MAX_TOKENS - outputTokens <= TRUNCATION_WARNING_TOKEN_BUFFER
    ) {
      console.warn(
        '[challenger-agent] response is within 50 tokens of max_tokens; truncation may have occurred',
        {
          outputTokens,
          maxTokens: MAX_TOKENS,
          company: input.company,
        }
      );
    }

    const parsed = parseChallengerResponse(raw, {
      maxTokens: MAX_TOKENS,
      outputTokens,
      stopReason: response.stop_reason,
    });

    console.info('[challenger-agent] succeeded', {
      company: input.company,
      model: MODEL,
      assumptionCount: parsed?.unstatedAssumptions.length ?? 0,
      gapCount: parsed?.evidenceGaps.length ?? 0,
      scenarioCount: parsed?.counterScenarios.length ?? 0,
    });

    return parsed ?? emptyChallengerReport();
  } catch (error: unknown) {
    console.error('[challenger-agent] failed', {
      company: input.company,
      error: String(error),
    });

    return emptyChallengerReport();
  }
}
