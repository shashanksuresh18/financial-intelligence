import Anthropic from '@anthropic-ai/sdk';

import { AMAKOR_MANDATE_CONTEXT } from '@/lib/amakor-mandate';
import type {
  ChallengerAttack,
  ChallengerAttackType,
  ChallengerItem,
  ChallengerReport,
  CoverageGap,
  DisagreementNote,
  EvidenceSignal,
  FinancialMetric,
  InvestmentMemo,
  SectionAuditItem,
  ValidationReport,
  ValidationSeverity,
  WaterfallResult,
} from '@/lib/types';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 2000;
const TRUNCATION_WARNING_TOKEN_BUFFER = 50;
const RESPONSE_TAIL_LENGTH = 100;
const ATTACK_LIMIT = 5;
const SYSTEM_PROMPT = `You are a skeptical senior risk analyst at Amakor Capital. Your job is to break the investment memo, not to add generic risk commentary.

${AMAKOR_MANDATE_CONTEXT}

Attack only the sharpest points in the memo. Prefer 4 attacks; use 5 only when valuation needs its own separate attack. Every attack must cite at least one evidence ID from the supplied evidence list.

Target these attack types:
- hidden-assumption: the main implicit assumption underneath the thesis
- fragile-variable: the single variable whose movement most threatens the case
- disconfirming-signal: the fastest observable signal that would falsify the thesis
- growth-quality: whether growth is product-led, pricing-led, subsidy-led, or hype-led
- moat-challenge: whether the moat is demonstrated in evidence or merely asserted
- valuation-grounding: whether valuation rests on unsupported expectations

Be willing to say "the thesis has no real support" when the evidence stack is too thin. Mark that HIGH severity when key drivers are missing or valuation rests on unsupported expectations. Respond with ONLY valid JSON and no markdown or prose.`;

type ChallengerAgentInput = {
  readonly company: string;
  readonly draftMemo: InvestmentMemo;
  readonly waterfallResult: WaterfallResult;
  readonly validationReport: ValidationReport;
  readonly metrics: readonly FinancialMetric[];
  readonly evidenceSignals: readonly EvidenceSignal[];
  readonly coverageGaps: readonly CoverageGap[];
  readonly disagreementNotes: readonly DisagreementNote[];
  readonly sectionAudit: readonly SectionAuditItem[];
};

type ChallengerPayload = {
  readonly attacks?: unknown;
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
    `Role: ${memo.role}`,
    `Mandate fit: ${memo.mandateFit}`,
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

function formatEvidenceAnchors(memo: InvestmentMemo): string {
  const anchors = memo.evidenceAnchors ?? [];

  if (anchors.length === 0) {
    return '- No evidence anchors attached; if you must challenge the thesis, cite "none".';
  }

  return anchors
    .slice(0, 24)
    .map((anchor) => {
      const period = anchor.period === null ? '' : ` (${anchor.period})`;
      return `- ${anchor.id}: ${anchor.label}${period} = ${anchor.value} [${anchor.source}; ${anchor.evidenceClass ?? 'class-unknown'}]`;
    })
    .join('\n');
}

function formatDriverTree(memo: InvestmentMemo): string {
  const tree = memo.driverTree;

  if (tree === null || tree === undefined) {
    return 'No driver tree attached.';
  }

  const drivers = tree.drivers.map((driver) => {
    const evidence = driver.evidenceId === null ? 'no evidence ID' : driver.evidenceId;
    return `- ${driver.name}: ${driver.status}; value=${driver.value ?? 'n/a'}; importance=${driver.importance}; evidence=${evidence}; note=${driver.note ?? 'n/a'}`;
  });

  return [
    `Archetype: ${tree.archetype}`,
    `Blocks conviction: ${tree.blocksConviction ? 'yes' : 'no'}`,
    `Critical missing: ${tree.criticalMissing.length === 0 ? 'none' : tree.criticalMissing.join(', ')}`,
    'Drivers:',
    ...drivers,
  ].join('\n');
}

function formatDiligenceChecklist(memo: InvestmentMemo): string {
  const checklist = memo.diligenceChecklist;

  if (checklist === null || checklist === undefined) {
    return 'No private-company diligence checklist attached.';
  }

  return [
    `Resolved: ${checklist.passCount}/${checklist.totalCount}`,
    `Blocks thesis: ${checklist.blockThesis ? 'yes' : 'no'}`,
    `Underwriting ready: ${checklist.underwritingReady ? 'yes' : 'no'}`,
    ...checklist.items.map((item) => {
      const evidence = item.evidenceId === null ? 'no evidence ID' : item.evidenceId;
      return `- ${item.label}: ${item.status}; critical=${item.isCritical ? 'yes' : 'no'}; evidence=${evidence}; note=${item.note}`;
    }),
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

function findMetricNumber(
  metrics: readonly FinancialMetric[],
  label: string
): number | null {
  const metric = metrics.find((item) => item.label === label);
  return metric !== undefined && typeof metric.value === 'number'
    ? metric.value
    : null;
}

function findMetricText(
  metrics: readonly FinancialMetric[],
  label: string
): string | null {
  const metric = metrics.find((item) => item.label === label);
  return metric !== undefined && typeof metric.value === 'string'
    ? metric.value
    : null;
}

type ChallengerEvidenceContext = {
  readonly hasGrossMargin: boolean;
  readonly hasProfitabilityMetrics: boolean;
  readonly hasRevenueAnchor: boolean;
  readonly hasValuationAnchor: boolean;
  readonly hasInvestorContext: boolean;
  readonly hasCompetitorContext: boolean;
  readonly hasPrimaryFilings: boolean;
  readonly hasStreetContext: boolean;
};

function buildEvidenceContext(
  input: ChallengerAgentInput
): ChallengerEvidenceContext {
  return {
    hasGrossMargin: findMetricNumber(input.metrics, 'Gross Margin') !== null,
    hasProfitabilityMetrics:
      findMetricNumber(input.metrics, 'Operating Margin') !== null ||
      findMetricNumber(input.metrics, 'Net Margin') !== null ||
      findMetricNumber(input.metrics, 'Free Cash Flow Margin') !== null,
    hasRevenueAnchor:
      findMetricNumber(input.metrics, 'Revenue') !== null ||
      findMetricText(input.metrics, 'Estimated Revenue') !== null,
    hasValuationAnchor:
      findMetricText(input.metrics, 'Last Valuation') !== null ||
      input.draftMemo.valuationCase.trim().length > 0,
    hasInvestorContext:
      findMetricText(input.metrics, 'Key Investors') !== null,
    hasCompetitorContext:
      findMetricText(input.metrics, 'Competitors') !== null,
    hasPrimaryFilings:
      input.waterfallResult.secEdgar?.data.xbrlFacts !== null &&
      input.waterfallResult.secEdgar !== null,
    hasStreetContext:
      input.waterfallResult.finnhub !== null || input.waterfallResult.fmp !== null,
  };
}

function formatEvidenceContext(
  input: ChallengerAgentInput
): string {
  const evidence = buildEvidenceContext(input);
  const sectionStates =
    input.sectionAudit.length === 0
      ? ['- No section-audit metadata attached']
      : input.sectionAudit.map(
          (item) => `- ${item.section}: ${item.status}`
        );
  const memoNamedGaps =
    input.coverageGaps.length === 0
      ? ['- None']
      : input.coverageGaps
          .slice(0, 3)
          .map((item) => `- ${item.title}: ${item.detail}`);
  const keySignals =
    input.evidenceSignals.length === 0
      ? ['- None']
      : input.evidenceSignals
          .slice(0, 3)
          .map((item) => `- ${item.title}: ${item.detail}`);

  return [
    `- Gross margin metric present: ${evidence.hasGrossMargin ? 'yes' : 'no'}`,
    `- Profitability metrics present: ${evidence.hasProfitabilityMetrics ? 'yes' : 'no'}`,
    `- Revenue scale anchor present: ${evidence.hasRevenueAnchor ? 'yes' : 'no'}`,
    `- Valuation anchor present: ${evidence.hasValuationAnchor ? 'yes' : 'no'}`,
    `- Investor context present: ${evidence.hasInvestorContext ? 'yes' : 'no'}`,
    `- Competitor context present: ${evidence.hasCompetitorContext ? 'yes' : 'no'}`,
    `- Primary filing facts present: ${evidence.hasPrimaryFilings ? 'yes' : 'no'}`,
    `- Street context present: ${evidence.hasStreetContext ? 'yes' : 'no'}`,
    'Section support:',
    ...sectionStates,
    'Memo already names these gaps:',
    ...memoNamedGaps,
    'Current key signals:',
    ...keySignals,
  ].join('\n');
}

function buildChallengerPrompt(input: ChallengerAgentInput): string {
  const activeSources =
    input.waterfallResult.activeSources.length > 0
      ? input.waterfallResult.activeSources.join(', ')
      : 'none';
  const privateCompanyRead =
    (input.waterfallResult.exaDeep !== null ||
      input.waterfallResult.claudeFallback !== null) &&
    input.waterfallResult.finnhub === null &&
    input.waterfallResult.fmp === null &&
    input.waterfallResult.secEdgar === null;

  return `DRAFT MEMO for ${input.company}:
${formatDraftMemo(input.draftMemo)}

VALIDATION REPORT:
${formatValidationSummary(input.validationReport)}

ACTIVE SOURCES: ${activeSources}
READ TYPE: ${privateCompanyRead ? 'private-company research' : 'public/registry mixed'}

AVAILABLE REPORT EVIDENCE:
${formatEvidenceContext(input)}

EVIDENCE IDS YOU MAY CITE:
${formatEvidenceAnchors(input.draftMemo)}

ARCHETYPE DRIVER TREE:
${formatDriverTree(input.draftMemo)}

PRIVATE DILIGENCE CHECKLIST:
${formatDiligenceChecklist(input.draftMemo)}

Challenge calibration rules:
- If this is a private-company research read, do NOT treat absence of SEC XBRL, Street targets, or earnings-surprise panels as evidence of business weakness by itself.
- For private companies, focus instead on revenue visibility, funding/valuation support, customer traction, moat quality, unit economics, and mandate fit.
- Only raise SEC, analyst-coverage, or public-market objections when the memo itself wrongly relies on those frameworks.
- If a metric or concept is already present in the report, do NOT criticize it as completely absent. At most, say it is present but still weakly analyzed, unresolved, or insufficient for underwriting.
- Do NOT simply restate a gap the memo already names unless you sharpen it materially.
- Use the driver tree to attack the variables that matter for this archetype. For consumer-fintech-bnpl, focus on take rate, funding cost, loss rate, unit economics, regulatory capital, and subsidy-led growth. For ai-infrastructure, focus on capex sustainability, customer concentration, gross margin durability, inference economics, and CUDA/platform moat.
- Prefer fewer, stronger challenges. Avoid repetitive template criticism.

Your task: return 4 or 5 attacks. Choose from these attack types:
- hidden-assumption
- fragile-variable
- disconfirming-signal
- growth-quality
- moat-challenge
- valuation-grounding

For each attack provide:
- attackType: one of the allowed attack types
- claim: one specific, falsifiable sentence
- severity: "high" | "medium" | "low"
- citedSource: at least one evidence ID from the supplied evidence list; use "none" only if no evidence IDs were supplied
- counterMeasure: the evidence that would neutralize this attack, or null

Respond ONLY with valid JSON matching this exact schema (no markdown fences, no commentary):
{
  "attacks": [
    {"attackType": "hidden-assumption", "claim": "...", "severity": "...", "citedSource": "evidence-id", "counterMeasure": "..."},
    {"attackType": "fragile-variable", "claim": "...", "severity": "...", "citedSource": "evidence-id", "counterMeasure": "..."}
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

function coerceAttackType(value: unknown): ChallengerAttackType {
  return value === 'hidden-assumption' ||
    value === 'fragile-variable' ||
    value === 'disconfirming-signal' ||
    value === 'growth-quality' ||
    value === 'moat-challenge' ||
    value === 'valuation-grounding'
    ? value
    : 'hidden-assumption';
}

function firstEvidenceId(input: ChallengerAgentInput): string {
  return input.draftMemo.evidenceAnchors?.[0]?.id ?? 'none';
}

function evidenceIds(input: ChallengerAgentInput): readonly string[] {
  return (input.draftMemo.evidenceAnchors ?? []).map((anchor) => anchor.id);
}

function normalizeCitedSource(value: unknown, input: ChallengerAgentInput): string {
  const raw =
    typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : firstEvidenceId(input);
  const ids = evidenceIds(input);

  if (ids.length === 0) {
    return raw;
  }

  const citedIds = ids.filter((id) => raw.includes(id));
  if (citedIds.length > 0) {
    return citedIds.join(', ');
  }

  return ids[0] ?? 'none';
}

function normalizeAttacks(
  value: unknown,
  input: ChallengerAgentInput,
): readonly ChallengerAttack[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
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

      const counterMeasure =
        typeof item.counterMeasure === 'string'
          ? item.counterMeasure.trim()
          : typeof item.counter_measure === 'string'
            ? item.counter_measure.trim()
            : null;

      return {
        attackType: coerceAttackType(item.attackType ?? item.attack_type),
        claim,
        severity: coerceSeverity(
          'severity' in item
            ? item.severity
            : 'level' in item
              ? item.level
              : null
        ),
        citedSource: normalizeCitedSource(
          item.citedSource ?? item.cited_source ?? item.source,
          input,
        ),
        counterMeasure:
          counterMeasure !== null && counterMeasure.length > 0
            ? counterMeasure
            : null,
      } satisfies ChallengerAttack;
    })
    .filter((item): item is ChallengerAttack => item !== null)
    .slice(0, ATTACK_LIMIT);
}

function mapAttacksToLegacySchema(attacks: readonly ChallengerAttack[]): {
  readonly unstatedAssumptions: readonly ChallengerItem[];
  readonly evidenceGaps: readonly ChallengerItem[];
  readonly counterScenarios: readonly ChallengerItem[];
} {
  const toItem = (attack: ChallengerAttack): ChallengerItem => ({
    claim: attack.claim,
    severity: attack.severity,
    citedSource: attack.citedSource,
  });
  return {
    unstatedAssumptions: attacks
      .filter((attack) => attack.attackType === 'hidden-assumption')
      .map(toItem),
    evidenceGaps: attacks
      .filter(
        (attack) =>
          attack.attackType === 'fragile-variable' ||
          attack.attackType === 'valuation-grounding' ||
          attack.attackType === 'moat-challenge',
      )
      .map(toItem),
    counterScenarios: attacks
      .filter(
        (attack) =>
          attack.attackType === 'disconfirming-signal' ||
          attack.attackType === 'growth-quality',
      )
      .map(toItem),
  };
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
  const attacks = value.attacks;
  const unstatedAssumptions =
    value.unstatedAssumptions ?? value.unstated_assumptions;
  const evidenceGaps = value.evidenceGaps ?? value.evidence_gaps;
  const counterScenarios = value.counterScenarios ?? value.counter_scenarios;

  if (Array.isArray(attacks)) {
    return {
      attacks,
      unstatedAssumptions: [],
      evidenceGaps: [],
      counterScenarios: [],
    };
  }

  if (
    !Array.isArray(unstatedAssumptions) ||
    !Array.isArray(evidenceGaps) ||
    !Array.isArray(counterScenarios)
  ) {
    return null;
  }

  return {
    attacks: undefined,
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

function hasAbsenceLanguage(claim: string): boolean {
  return /\bno\b|\bmissing\b|\babsent\b|\bnot (?:present|provided|available|analyzed|disclosed|attached)\b|\blacks?\b/i.test(
    claim
  );
}

function shouldDropFalsePositiveClaim(
  claim: string,
  evidence: ChallengerEvidenceContext
): boolean {
  if (!hasAbsenceLanguage(claim)) {
    return false;
  }

  const haystack = claim.toLowerCase();

  if (evidence.hasGrossMargin && haystack.includes('gross margin')) {
    return true;
  }

  if (
    evidence.hasProfitabilityMetrics &&
    (haystack.includes('profitability') ||
      haystack.includes('operating margin') ||
      haystack.includes('net margin') ||
      haystack.includes('free cash flow'))
  ) {
    return true;
  }

  if (
    evidence.hasRevenueAnchor &&
    (haystack.includes('revenue') || haystack.includes('scale'))
  ) {
    return true;
  }

  if (evidence.hasValuationAnchor && haystack.includes('valuation')) {
    return true;
  }

  if (evidence.hasInvestorContext && haystack.includes('investor')) {
    return true;
  }

  if (evidence.hasCompetitorContext && haystack.includes('competitor')) {
    return true;
  }

  if (evidence.hasPrimaryFilings && haystack.includes('filing')) {
    return true;
  }

  return false;
}

function dedupeChallengerItems(
  items: readonly ChallengerItem[]
): readonly ChallengerItem[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = item.claim
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createChallengerReport(
  payload: ChallengerPayload,
  input: ChallengerAgentInput
): ChallengerReport {
  const evidence = buildEvidenceContext(input);
  const attacks = normalizeAttacks(payload.attacks, input);

  if (attacks.length > 0) {
    const legacy = mapAttacksToLegacySchema(attacks);

    return {
      attacks,
      unstatedAssumptions: dedupeChallengerItems(
        legacy.unstatedAssumptions.filter(
          (item) => !shouldDropFalsePositiveClaim(item.claim, evidence)
        )
      ),
      evidenceGaps: dedupeChallengerItems(
        legacy.evidenceGaps.filter(
          (item) => !shouldDropFalsePositiveClaim(item.claim, evidence)
        )
      ),
      counterScenarios: dedupeChallengerItems(legacy.counterScenarios),
    };
  }

  return {
    attacks: null,
    unstatedAssumptions: dedupeChallengerItems(
      normalizeItems(payload.unstatedAssumptions, 2).filter(
        (item) => !shouldDropFalsePositiveClaim(item.claim, evidence)
      )
    ),
    evidenceGaps: dedupeChallengerItems(
      normalizeItems(payload.evidenceGaps, 2).filter(
        (item) => !shouldDropFalsePositiveClaim(item.claim, evidence)
      )
    ),
    counterScenarios: dedupeChallengerItems(
      normalizeItems(payload.counterScenarios, 2)
    ),
  };
}

function logParsedCounts(report: ChallengerReport): void {
  console.info(
    `[challenger-agent] parsed ${report.attacks?.length ?? 0} attacks, ${report.unstatedAssumptions.length} unstatedAssumptions, ${report.evidenceGaps.length} evidenceGaps, ${report.counterScenarios.length} counterScenarios`
  );
}

function parseJsonCandidate(
  candidate: string,
  input: ChallengerAgentInput
): ChallengerReport | null {
  const parsed: unknown = JSON.parse(candidate);
  const payload = findChallengerPayload(parsed);

  if (payload === null) {
    return null;
  }

  const report = createChallengerReport(payload, input);
  logParsedCounts(report);

  return report;
}

export function parseChallengerResponse(
  raw: string,
  options: ParseChallengerOptions,
  input: ChallengerAgentInput
): ChallengerReport | null {
  let lastError: string | null = null;
  const candidates = buildJsonCandidates(raw);

  for (const candidate of candidates) {
    try {
      return parseJsonCandidate(candidate, input);
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
        const repairedReport = parseJsonCandidate(repairedCandidate, input);

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
    attacks: [],
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
    }, input);

    console.info('[challenger-agent] succeeded', {
      company: input.company,
      model: MODEL,
      attackCount: parsed?.attacks?.length ?? 0,
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
