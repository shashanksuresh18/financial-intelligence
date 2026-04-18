# Phase 7: Orchestrator Agent — Plan

## Status

Phase 7 reviewed and confirmed correct.

## Files Changed

| File | Change | Actual line count |
|------|--------|-------------------|
| `src/lib/report-assembly.ts` | New pure assembly module; moved and exported the 11 listed assembly helpers from `analyzer.ts` | 748 |
| `src/lib/agents/orchestrator.ts` | New orchestrator with `runStep`, signal builders, local fallbacks, and 6-step `runAnalysis` flow | 614 |
| `src/lib/analyzer.ts` | Reduced to thin `analyzeCompany` pass-through, unchanged delta helpers, and `runWaterfall` re-export | 280 |

## Verification

| Check | Result |
|-------|--------|
| `cmd /c npx tsc --noEmit` | ✓ zero errors |
| `cmd /c npm run lint` | ✓ zero warnings |
| `src/lib/analyzer.ts` under 300 lines | ✓ 280 |
| `src/lib/report-assembly.ts` under 800 lines | ✓ 748 |
| `src/lib/agents/orchestrator.ts` under 800 lines | ✓ 614 (plan estimated 590; actual 614 — within cap) |
| `src/app/api/analyze/route.ts` unchanged | ✓ hash 719abf60 |
| All 5 existing agent files unchanged | ✓ hashes verified |
| `investment-memo.ts` unchanged | ✓ hash 75d1e28c |
| `claude-narrative.ts` unchanged | ✓ hash 13d34f4f |
| `AnalysisReport` type unchanged | ✓ types.ts has no uncommitted diff |

## Constraints Held

- `src/app/api/analyze/route.ts` was not modified.
- Existing agent files were not modified: `entity-agent.ts`, `market-data-agent.ts`, `validation-agent.ts`, `memo-agent.ts`, `challenger-agent.ts`.
- `src/lib/investment-memo.ts` was not modified.
- `src/lib/claude-narrative.ts` was not modified.
- `AnalysisReport` was not changed.
- `analyzer.ts` still exports `analyzeCompany`, `attachReportDeltas`, and re-exports `runWaterfall`.
- `analyzer.ts` still contains `compareReports` and all delta helpers.

## Deviations from Plan

- **orchestrator.ts**: 614 lines, not 590 as the implementation note stated. The 24-line overage comes from
  the inline param-type aliases (lines 21–24) and the local `emptyChallengerReport` factory that couldn't
  reuse `challenger-agent.ts`'s internal function (not exported). Still well within the 800-line hard cap.
- **report-assembly.ts**: 748 lines, not 732. No concern; within 800-line cap.
- **analyzer.ts**: 280 lines, not 250. The delta helpers are slightly longer than estimated. Within 300-line target.

## Implementation Notes

- `runAnalysis` executes the 6 planned steps via `runStep<T>` with per-step `console.info` timing and a
  final `[orchestrator] runAnalysis complete` log with `totalMs`.
- `orchestrator.ts` carries a local `EMPTY_CHALLENGER_REPORT` constant and `emptyChallengerReport()` factory
  because `challenger-agent.ts` does not export its internal empty-fallback function. This preserves the
  "do not modify existing agent files" constraint at the cost of a small amount of duplication.
- The four signal builders (`buildEvidenceSignals`, `buildCoverageGaps`, `buildDisagreementNotes`,
  `buildSectionAudit`) live in `orchestrator.ts` as planned — they form the evidence-layer prep immediately
  before the memo pipeline and are not needed by any other consumer.

## Approved Plan

## Goal

Extract the inline orchestration logic from `analyzeCompany` in `analyzer.ts` into a
dedicated `src/lib/agents/orchestrator.ts`. The public API surface (what `route.ts`
calls) must not change. Output of every step must be identical to Phase 6.

---

## Problem with the Current Structure

`analyzer.ts` is 1764 lines and does three very different things:

1. **Pure data assembly** — extractXbrlMetrics, assembleMetrics, buildValuationView,
   buildPeerComparison, extractConsensus, buildStreetView, extractEarningsHighlights,
   extractInsiderActivity, extractNewsHighlights, buildEvidenceSignals, buildCoverageGaps,
   buildDisagreementNotes, buildSectionAudit (~1200 lines, all synchronous pure functions).
2. **Sequential orchestration** — runWaterfall → validateWaterfall → buildEntityResolution
   → assemble → runMemoAgent (draft) → runChallengerAgent → runMemoAgent (final)
   (~150 lines inside `analyzeCompany`).
3. **Delta comparison** — compareReports, attachReportDeltas (~200 lines).

The orchestration is buried inside a large file with no step-level logging or timing.
Extracting it clears both problems.

---

## File Plan

### New file: `src/lib/report-assembly.ts`

Move all synchronous pure assembly helpers out of `analyzer.ts` into this file. None of
these are currently exported from `analyzer.ts`, so no downstream import changes are
needed outside `analyzer.ts` itself.

Functions to move:
```
extractXbrlMetrics            → readonly FinancialMetric[]
extractFinnhubMetrics         → readonly FinancialMetric[]
extractCompaniesHouseMetrics  → readonly FinancialMetric[]
assembleMetrics               → readonly FinancialMetric[]
extractConsensus              → readonly AnalystConsensusEntry[]
buildStreetView               → StreetView | null
buildValuationView            → ValuationView | null
buildPeerComparison           → readonly PeerComparisonItem[]
extractEarningsHighlights     → readonly EarningsHighlight[]
extractInsiderActivity        → readonly InsiderActivityItem[]
extractNewsHighlights         → readonly NewsHighlight[]
```

The four "signal builders" — `buildEvidenceSignals`, `buildCoverageGaps`,
`buildDisagreementNotes`, `buildSectionAudit` — stay inside `orchestrator.ts` because
they form the evidence-layer prep immediately before the memo pipeline.

**Line budget:**
- `report-assembly.ts` — ~750 lines (within 800-line cap)
- `orchestrator.ts` — ~500 lines (signal builders + 6-step flow)
- `analyzer.ts` (after) — ~250 lines (delta group + thin wrapper + re-exports)

---

### New file: `src/lib/agents/orchestrator.ts`

#### Timing helper

```ts
type StepResult<T> = { data: T; ms: number };

async function runStep<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<StepResult<T>> {
  const t0 = Date.now();
  try {
    const data = await fn();
    const ms = Date.now() - t0;
    console.info(`[orchestrator] ${name} ok`, { ms });
    return { data, ms };
  } catch (error) {
    const ms = Date.now() - t0;
    console.error(`[orchestrator] ${name} failed`, { ms, error });
    return { data: fallback, ms };
  }
}
```

`runStep` is the only try/catch in orchestrator.ts. `runAnalysis` itself never throws.

#### Six named steps

```ts
export async function runAnalysis(query: string): Promise<AnalysisReport> {
  // Step 1 — fetchMarketData
  const marketStep = await runStep("fetchMarketData",
    () => runWaterfall({ query }),
    EMPTY_WATERFALL_RESULT,
  );
  const waterfallResult = marketStep.data;

  // Step 2 — resolveEntity
  const entityStep = await runStep("resolveEntity",
    async () => buildEntityResolution(query, waterfallResult),
    buildEntityResolution(query, EMPTY_WATERFALL_RESULT),
  );
  const entityResolution = entityStep.data;

  // Step 3 — validateResults
  const validationStep = await runStep("validateResults",
    async () => validateWaterfall(waterfallResult),
    EMPTY_VALIDATION_REPORT,
  );
  const validationReport = validationStep.data;

  // ── In-memory assembly (synchronous, no I/O) ──────────────────────────
  const confidence = computeConfidence(waterfallResult, entityResolution);
  const metrics = assembleMetrics(waterfallResult);
  // ... all remaining assembly helpers ...
  const memoContext = { ... } as const;

  // Step 4 — generateDraftMemo
  const draftStep = await runStep("generateDraftMemo",
    () => runMemoAgent(memoContext),
    EMPTY_MEMO_RESULT,
  );

  // Step 5 — challengeMemo
  const challengeStep = await runStep("challengeMemo",
    () => runChallengerAgent({
      company: entityResolution.displayName,
      draftMemo: draftStep.data.investmentMemo,
      waterfallResult,
      validationReport,
    }),
    emptyChallengerReport(),
  );

  // Step 6 — generateFinalMemo
  const finalStep = await runStep("generateFinalMemo",
    () => runMemoAgent({ ...memoContext, challengerReport: challengeStep.data }),
    EMPTY_MEMO_RESULT,
  );

  const totalMs =
    marketStep.ms + entityStep.ms + validationStep.ms +
    draftStep.ms + challengeStep.ms + finalStep.ms;
  console.info("[orchestrator] runAnalysis complete", { query, totalMs });

  return { ... }; // same shape as current analyzeCompany return
}
```

`emptyChallengerReport()` is already exported from `challenger-agent.ts` (used for its
own graceful failure). `EMPTY_WATERFALL_RESULT`, `EMPTY_VALIDATION_REPORT`, and
`EMPTY_MEMO_RESULT` are local constants defined at the top of orchestrator.ts.

---

### Updated `src/lib/analyzer.ts`

#### Before (analyzeCompany, lines 1644–1753)

```ts
export async function analyzeCompany(query: string): Promise<AnalysisReport> {
  const waterfallResult = await runWaterfall({ query });
  const validationReport = validateWaterfall(waterfallResult);
  const entityResolution = buildEntityResolution(query, waterfallResult);
  // ... ~50 lines of inline assembly ...
  const draftResult = await runMemoAgent(memoContext);
  const challengerReport = await runChallengerAgent({ ... });
  const finalResult = await runMemoAgent({ ...memoContext, challengerReport });
  return { ... };
}
```

#### After

```ts
import { runAnalysis } from "@/lib/agents/orchestrator";
import type { AnalysisReport } from "@/lib/types";

export { runWaterfall } from "@/lib/agents/market-data-agent"; // unchanged re-export

export async function analyzeCompany(query: string): Promise<AnalysisReport> {
  return runAnalysis(query);
}

// attachReportDeltas + compareReports + all delta helpers remain here unchanged.
// route.ts imports analyzeCompany and attachReportDeltas — both still present.
```

All 15 assembly helpers are deleted from analyzer.ts (they live in report-assembly.ts or
orchestrator.ts). The import block at the top of analyzer.ts shrinks from ~25 lines to ~5.

---

## Error Handling Hierarchy

```
route.ts          — try/catch around analyzeCompany(); returns HTTP 500 on throw
analyzer.ts       — thin pass-through; never throws
orchestrator.ts   — runStep() catches per-step errors; runAnalysis never throws
agents/           — each agent handles its own errors and may throw up to runStep
```

Per-step fallbacks:
- `fetchMarketData` failure → all-null WaterfallResult → LOW confidence report
- `resolveEntity` failure → minimal entity with displayName set to raw query
- `validateResults` failure → empty ValidationReport (no coverage, no gaps)
- `generateDraftMemo` failure → placeholder InvestmentMemo (empty verdict/keyRisks)
- `challengeMemo` failure → emptyChallengerReport() → final memo skips challenge input
- `generateFinalMemo` failure → placeholder InvestmentMemo

---

## Timing Instrumentation

- `runStep` records wall-clock ms for each of the 6 I/O steps.
- Logged to server stdout: `[orchestrator] <name> ok { ms: N }`.
- Final log: `[orchestrator] runAnalysis complete { query, totalMs }`.
- No timing data is added to `AnalysisReport` — the type is unchanged.
- In-memory assembly (synchronous) is not timed; it runs between steps 3 and 4.

---

## Caching Behavior — No Change Required

The `AnalysisCache` Prisma model lives entirely in `route.ts`. `analyzeCompany` has never
touched the cache and never will. `attachReportDeltas` (called from `route.ts`) stays in
`analyzer.ts` unchanged. The refactor is invisible to the cache layer.

---

## Test Cases — Confirming Identical Output

Run these 6 companies before and after with `forceRefresh: true`. Compare the fields listed.

| Company | Confidence expected | Key assertion |
|---|---|---|
| Apple | HIGH ★★★ | SEC XBRL facts in metrics; confidence.label === "high" |
| Revolut | MEDIUM ★★☆ | companiesHouse data present; no SEC XBRL; confidence.label === "medium" |
| Deutsche Bank | MEDIUM ★★☆ | entityResolution.matchedSources includes "gleif" |
| SpaceX | LOW ★☆☆ | claudeFallback was primary; confidence.label === "low" |
| HSBC | MEDIUM — disambiguated | isAmbiguous: false; primary listing is LSE |
| Microsoft | HIGH ★★★ | SEC XBRL present; streetView.consensusRating defined |

**Method**: `curl -X POST http://localhost:3000/api/analyze -H "Content-Type: application/json" -d '{"company":"Apple","forceRefresh":true}'`

Compare: `confidence`, `metrics.length`, `entityResolution.matchedSources`,
`investmentMemo.recommendation`, `investmentMemo.conviction`, `validationReport.coverageLabel`.

**Regression guard**: Zero `[orchestrator] <step> failed` lines in server logs for all 6
companies on a warm API key set. Any failure means the fallback fired and output degraded.

---

## Implementation Order

1. Create `src/lib/report-assembly.ts` — copy assembly helpers from `analyzer.ts`, export them.
2. Create `src/lib/agents/orchestrator.ts` — signal builders + runStep helper + 6-step flow.
3. Update `src/lib/analyzer.ts` — delete moved helpers, import runAnalysis, slim import block.
4. `npx tsc --noEmit` — must pass zero errors.
5. `npm run lint` — must pass zero warnings.
6. Test all 6 companies via curl with `forceRefresh: true`.
7. Confirm server logs show per-step timing for each company.

**Do not implement until this plan is approved.**

---

# Phase 6: Memo Writer + Challenger Agents

## Status

Phase 6 implementation is complete and reviewed.

## Phase 6 Review

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero warnings |
| `ChallengerItem`, `ChallengerReport`, `StressTestResult` in types.ts | ✓ after `ValidationReport`, before `ExaDeepData` |
| `InvestmentMemo.stressTest` optional | ✓ line 242, `stressTest?: StressTestResult \| null` |
| `ChallengerItem.severity` reuses `ValidationSeverity` | ✓ |
| challenger-agent.ts model | ✓ `claude-3-5-haiku-20241022` |
| challenger-agent.ts system prompt | ✓ skeptical senior risk analyst at PE firm |
| JSON schema: 3 unstatedAssumptions, 3 evidenceGaps, 2 counterScenarios | ✓ `normalizeItems` truncates to correct limits |
| Severity coercion to `"medium"` for unknown values | ✓ `coerceSeverity` |
| `citedSource` defaults to `"none"` | ✓ |
| Graceful failure returns `emptyChallengerReport()` | ✓ both on API error and parse failure |
| memo-agent.ts imports `buildInvestmentMemo` and `generateNarrative` | ✓ unchanged originals |
| Challenger gaps → `CoverageGap[]` conversion | ✓ `challengerGapsFromReport` |
| Challenger counter-scenarios → `DisagreementNote[]` with `sources: []` | ✓ `challengerNotesFromReport`, no unsafe assertions |
| Conviction downgrade: high-severity count drives `downgradeConviction` | ✓ counts across all 3 lists |
| `stressTest` attached on final pass, null on draft pass | ✓ |
| Augmented gaps/notes passed to `generateNarrative` | ✓ `coverageGaps: augmentedCoverageGaps` etc. |
| analyzer.ts: `buildInvestmentMemo` removed | ✓ not present in analyzer |
| analyzer.ts: `generateNarrative` removed | ✓ not present in analyzer |
| analyzer.ts: `runMemoAgent` → `runChallengerAgent` → `runMemoAgent` flow | ✓ lines 1709–1719 |
| `memoContext` assembled once, spread into second `runMemoAgent` call | ✓ `{ ...memoContext, challengerReport }` |
| `finalResult.sections` used in `AnalysisReport` | ✓ line 1733 |
| `investment-memo.ts` untouched | ✓ no diff |
| `claude-narrative.ts` untouched | ✓ no diff |
| Deviations from plan | **None** |

### Notes
- `memoContext` uses `as const` assertion in analyzer.ts — harmless, TypeScript widens correctly when spread with `challengerReport`.
- `[memo-agent] completed` log includes `configuredModel`, `challengerApplied`, original and final conviction, and `validationCoverage` — useful for debugging conviction downgrades in production.

## Context

`analyzeCompany` previously used a direct 3-step memo flow:

`buildInvestmentMemo -> generateNarrative -> buildInvestmentMemo`

Phase 6 replaces that with dedicated Memo Writer and Challenger agents:

`runMemoAgent(draft) -> runChallengerAgent(draft) -> runMemoAgent(final, challengerReport) -> AnalysisReport`

High-severity challenger items downgrade conviction by one level in the final memo pass.

## Files Changed

| File | Change | Status |
|------|--------|--------|
| `src/lib/types.ts` | Added `ChallengerItem`, `ChallengerReport`, `StressTestResult`, plus optional `InvestmentMemo.stressTest` | Complete |
| `src/lib/agents/challenger-agent.ts` | New Haiku-backed challenger agent with JSON parsing, validation, and graceful empty fallback | Complete |
| `src/lib/agents/memo-agent.ts` | New memo agent that wraps memo building and narrative generation, converts challenger output into existing gap/disagreement types, and applies conviction downgrade | Complete |
| `src/lib/analyzer.ts` | Replaced direct memo/narrative wiring with draft memo -> challenger -> final memo orchestration | Complete |

`src/lib/investment-memo.ts` and `src/lib/claude-narrative.ts` were not modified.

## Implemented Details

### Part A - Types

- Added `ChallengerItem`, `ChallengerReport`, and `StressTestResult` after `ValidationReport`.
- Added optional `stressTest?: StressTestResult | null` to `InvestmentMemo`.
- Backward compatibility is preserved because `stressTest` is optional and placeholder data can omit it.

### Part B - Challenger Agent

- `src/lib/agents/challenger-agent.ts` exports `runChallengerAgent`.
- The agent formats the draft memo and validation report into a structured PE-style challenge prompt.
- The Claude response is parsed as JSON, validated, normalized, and truncated to:
  - 3 unstated assumptions
  - 3 evidence gaps
  - 2 counter-scenarios
- Unknown severities are coerced to `"medium"`.
- Missing or empty `citedSource` values are normalized to `"none"`.
- Any API or parsing failure returns `emptyChallengerReport()` and never blocks analysis.

### Part C - Memo Agent

- `src/lib/agents/memo-agent.ts` exports `runMemoAgent`.
- The agent:
  - builds a base memo with `buildInvestmentMemo`
  - augments `coverageGaps` from challenger evidence gaps
  - augments `disagreementNotes` from challenger counter-scenarios
  - downgrades conviction one level if any challenger item is `high`
  - attaches `stressTest` on the final memo pass
  - generates the narrative and sections through `generateNarrative`
- Challenger-derived `DisagreementNote.sources` are always `[]` to avoid unsafe source assertions.

### Part D - Analyzer Wiring

- `src/lib/analyzer.ts` now assembles a shared memo context once.
- The memo flow is now:
  1. `runMemoAgent(memoContext)` for the draft
  2. `runChallengerAgent(...)` using the draft memo
  3. `runMemoAgent({ ...memoContext, challengerReport })` for the final memo
- The returned report now uses `finalResult.sections`.

## Final Runtime Sequence

`runWaterfall`
-> `validateWaterfall`
-> `buildEntityResolution`
-> `computeConfidence`
-> assembly helpers
-> `runMemoAgent` draft
-> `runChallengerAgent`
-> `runMemoAgent` final
-> `attachReportDeltas`
-> `AnalysisReport`

## Model Selection

| Agent | Model | Notes |
|-------|-------|-------|
| Memo Writer | `claude-sonnet-4-20250514` | Memo agent delegates to the existing `generateNarrative` path without modifying `src/lib/claude-narrative.ts` |
| Challenger | `claude-3-5-haiku-20241022` | Current official Anthropic Haiku 3.5 API model ID used for structured JSON stress testing |

## Conviction Downgrade

| Original conviction | High-severity challenges | Final conviction |
|--------------------|--------------------------|-----------------|
| `high` | `0` | `high` |
| `high` | `>= 1` | `medium` |
| `medium` | `0` | `medium` |
| `medium` | `>= 1` | `low` |
| `low` | any | `low` |

`StressTestResult.convictionDowngraded` records whether that downgrade happened.

## Backward Compatibility

- `InvestmentMemo.stressTest` is optional.
- `AnalysisReport` shape is unchanged.
- `buildInvestmentMemo` and `generateNarrative` signatures are unchanged.
- `analyzeCompany` public API is unchanged.
- Placeholder report objects compile without modification.

## Verification

- Typecheck: `cmd /c npx tsc --noEmit`
- Lint: `cmd /c npm run lint`

Both completed successfully after implementation.

## Out of Scope

- UI rendering of `stressTest`
- Separate caching for challenger output
- Retries for challenger failures
- Challenger-driven changes to deterministic validation logic
- Changes to `confidence.ts`, `entity-agent.ts`, `market-data-agent.ts`, or `validation-agent.ts`
