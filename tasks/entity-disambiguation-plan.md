# Phase B: Entity Disambiguation Fix (Revised)

This plan addresses the fragility of entity resolution for ambiguous names like HSBC, Shell, and Virgin. It resolves issues where exact string matches short-circuited the selection, market cap ranking fought with search ranking, and the app auto-analyzed ambiguous entities without pausing.

## User Review Required

> [!CAUTION]  
> If an entity query is highly ambiguous (e.g., Virgin), this new plan will cause the analysis process to **HALT entirely** before spending tokens on an automated analysis. It will yield an early exit. Is this the intended UX flow for a failed disambiguation, or do you expect the AI to still attempt a low-confidence report?

## Proposed Changes

### src/lib/datasources/

#### [MODIFY] finnhub.ts
- **Remove early exact-match bypass**: Do not short-circuit when `query.toLowerCase() === symbol.toLowerCase()`. The exact match (`HSBC` ADR) must compete with the parent (`HSBA.L`) based on financial fundamentals.
- **Implement strong ranking heuristics**:
  1. **Market Capitalization Winner**: Fetch `basicFinancials` for the top ~5 search candidates and rank strictly by market cap.
  2. **Exchange Priority (Tie-Breaker / Filter)**: Implement an exchange tier system. For example, penalize or downrank secondary/preferred listings (like `.PR`) in favor of primary common stock listings (like `.L`, `.AS`, or US main boards).
- **Declare Ambiguity Early**: When multiple companies have a market cap over a certain threshold (e.g., $10B) and are within 50% of each other, explicitly set `isAmbiguous = true`.

### src/lib/

#### [MODIFY] analyzer.ts
- **Pause on Ambiguity**: When `finnhub` (or the `entity-agent` in the future orchestrator) marks the resolution as `isAmbiguous`, the `analyzer.ts` should intercept this.
- If `isAmbiguous` is flagged, `analyzer.ts` should immediately lower the confidence score completely and potentially **abort the waterfall**, returning a payload that indicates user disambiguation is required rather than forcing a full Claude analysis on the wrong company.

#### [MODIFY] types.ts
- Ensure `FinnhubData` (and the future `EntityResolution` pipeline) explicitly can return `isAmbiguous` and a list of `alternatives` so the frontend knows how to ask the user to pick.

## Verification Plan

### Automated Tests
- `npx tsc --noEmit`

### Manual Verification
- **HSBC test**: Should resolve to `HSBA.L` (parent) instead of `HSBC` (ADR), because the exact-match bypass is removed and market cap / exchange rules prefer the London primary listing.
- **Shell test**: Should resolve to `SHELL.AS` or `SHEL.L` instead of `SHELL.PR`, because exchange priority will down-rank the `.PR` preferred/secondary listings.
- **Virgin test**: The ranking will detect multiple distinct strong candidates (e.g. Virgin Galactic vs Virgin Money UK) and set `isAmbiguous = true`. The system will then intentionally halt or flag it rather than blindly reporting on `SPCE`.
