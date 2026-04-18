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
