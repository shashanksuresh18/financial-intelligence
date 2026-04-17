# Entity Disambiguation and Registry Noise Suppression

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| Plan | Complete | Written 2026-04-17 |
| Implementation | Complete | `finnhub.ts` Phase 2 disambiguation fixes applied |
| TypeScript | Pass | `npx tsc --noEmit` via `npx.cmd` - zero errors |
| Verification | Pass | Resolver script confirms all 5 target companies |

## Verification Results (2026-04-17)

### TypeScript

`npx tsc --noEmit` - zero errors.

### Resolver verification script

Temporary Node script imported `resolveFinnhubSymbol` and verified:

| Query | Expected winner | Actual winner | `isAmbiguous` | Pass? |
|-------|-----------------|---------------|---------------|-------|
| HSBC | `HSBA.L` | `HSBA.L` | false | Yes |
| Shell | `SHEL.L` | `SHEL.L` | false | Yes |
| Virgin | `SPCE` | `SPCE` | false | Yes |
| Apple | `AAPL` | `AAPL` | false | Yes |
| Microsoft | `MSFT` | `MSFT` | false | Yes |

Console output:

```text
HSBC=HSBA.L, Shell=SHEL.L, Virgin=SPCE, Apple=AAPL, Microsoft=MSFT
```

The temporary verification script was deleted after the run.

## Fixes Applied

### `src/lib/datasources/finnhub.ts`

1. `getExchangeTier`
   Unknown 1-2 letter suffixes now default to Tier 1 instead of Tier 0. Only suffixes explicitly listed in `PRIMARY_EXCHANGE_SUFFIXES` qualify as Tier 0.

2. `findPromotableCommonStockAlternative`
   ADR promotion now uses a two-pass search:
   - first pass prefers Tier 0 common stock alternatives
   - second pass falls back to Tier 1 common stock alternatives

This fixes the HSBC failure mode where `HSB.MT` could outrank `HSBA.L` because the ranked array was walked in market-cap order.
