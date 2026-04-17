# Analyzer Decomposition — Agent Extraction Plan

## Context

`src/lib/analyzer.ts` is 2,197 lines — nearly 3× the 800-line hard cap in CLAUDE.md. The file conflates three distinct responsibilities:

| Responsibility | Current location | Lines (approx) |
|----------------|-----------------|----------------|
| Waterfall fetch orchestration | `runWaterfall` + helpers | ~190 |
| Entity identity resolution | `buildEntityResolution` + helpers | ~230 |
| Report assembly (metrics, signals, audit, deltas) | Everything else | ~1,780 |

This plan extracts the first two responsibilities into focused agent files, leaving report assembly in `analyzer.ts` and keeping the public API surface unchanged.

---

## Target File Layout

```
src/lib/
├── agents/
│   ├── entity-agent.ts          ← NEW  (~230 lines)
│   └── market-data-agent.ts     ← NEW  (~190 lines)
├── analyzer.ts                  ← MODIFIED  (imports from agents, loses ~420 lines)
├── datasources/                 ← UNCHANGED
└── types.ts                     ← UNCHANGED
```

`src/app/api/analyze/route.ts` is **not touched**. It still imports only `analyzeCompany` and `attachReportDeltas` from `@/lib/analyzer`.

---

## File 1 — `src/lib/agents/entity-agent.ts`

### What moves here

Move these functions verbatim from `analyzer.ts`:

| Function | approx line in analyzer.ts |
|----------|---------------------------|
| `addEntityIdentifier` | 920–946 |
| `normalizeEntityName` | 948–954 |
| `hasUkLegalSuffix` | 956–966 |
| `shouldUseCompaniesHouseCorroboration` | 968–1002 |
| `buildEntityResolution` | 1004–1152 |

### Public export

```typescript
export { buildEntityResolution };
```

Everything else (`addEntityIdentifier`, `normalizeEntityName`, `hasUkLegalSuffix`, `shouldUseCompaniesHouseCorroboration`) remains unexported — it is internal to this file.

### Imports needed

```typescript
import type {
  DataSource,
  EntityIdentifier,
  EntityResolution,
  WaterfallResult,
} from "@/lib/types";
```

No other dependencies. No datasource imports. No analyzer imports.

---

## File 2 — `src/lib/agents/market-data-agent.ts`

### What moves here

Move these items verbatim from `analyzer.ts`:

| Item | approx line in analyzer.ts |
|------|---------------------------|
| `CH_SKIP_MCAP_THRESHOLD_USDm` constant | 43 |
| `INTERNATIONAL_EXCHANGE_SUFFIXES` set | 44–70 |
| `wrapSource` | 72–87 |
| `isUsPrimaryListingSymbol` | 89–102 |
| `shouldSkipCompaniesHouseLookup` | 104–125 |
| `buildActiveSources` | ~1955–1967 |
| `runWaterfall` | 1969–2064 |

### Public export

```typescript
export { runWaterfall };
```

All other items are unexported — internal to this file.

### Imports needed

```typescript
import type {
  DataSource,
  DataSourceResult,
  FinancialMetric,
  WaterfallInput,
  WaterfallResult,
} from "@/lib/types";
import { fetchClaudeFallbackData } from "@/lib/datasources/claude-fallback";
import { fetchCompaniesHouseData } from "@/lib/datasources/companies-house";
import { fetchFinnhubData } from "@/lib/datasources/finnhub";
import { fetchFmpData } from "@/lib/datasources/fmp";
import { fetchGleifData } from "@/lib/datasources/gleif";
import { fetchSecEdgarData } from "@/lib/datasources/sec-edgar";
```

No imports from `analyzer.ts`. No imports from `entity-agent.ts`.

---

## File 3 — `src/lib/analyzer.ts` (modifications)

### Add imports

```typescript
import { buildEntityResolution } from "@/lib/agents/entity-agent";
import { runWaterfall } from "@/lib/agents/market-data-agent";
```

### Remove imports

Remove the datasource imports that `market-data-agent.ts` will now own:

```typescript
// DELETE these from analyzer.ts imports:
import { fetchClaudeFallbackData } from "@/lib/datasources/claude-fallback";
import { fetchCompaniesHouseData } from "@/lib/datasources/companies-house";
import { fetchFinnhubData } from "@/lib/datasources/finnhub";
import { fetchFmpData } from "@/lib/datasources/fmp";
import { fetchGleifData } from "@/lib/datasources/gleif";
import { fetchSecEdgarData, extractLatestFact, ... } from "@/lib/datasources/sec-edgar";
```

Note: `extractLatestFact`, `NET_INCOME_CONCEPTS`, and `REVENUE_CONCEPTS` are still used by `extractXbrlMetrics` in `analyzer.ts`. Keep that sec-edgar import. Remove only the fetch functions.

Revised sec-edgar import:
```typescript
import {
  extractLatestFact,
  NET_INCOME_CONCEPTS,
  REVENUE_CONCEPTS,
} from "@/lib/datasources/sec-edgar";
```

### Remove extracted blocks

Delete verbatim the five entity-agent functions and the seven market-data-agent items listed above.

### Remove from type import list

Remove `WaterfallInput` from the `@/lib/types` import in `analyzer.ts` — it is no longer referenced there.

### `analyzeCompany` body: no changes

`analyzeCompany` already calls `runWaterfall({ query })` and `buildEntityResolution(query, waterfallResult)`. Once those come from the agents instead of local definitions, the body is identical.

### Net result

`analyzer.ts` loses ~420 lines. It will be approximately 1,780 lines — still above the 800-line cap, but that reduction is out of scope for this plan.

---

## Backward Compatibility

| Caller | Import | Change required |
|--------|--------|-----------------|
| `src/app/api/analyze/route.ts` | `analyzeCompany`, `attachReportDeltas` from `@/lib/analyzer` | None |
| Tests (if any reference `runWaterfall` or `buildEntityResolution`) | From `@/lib/analyzer` | Update import path to agent file |
| Any other internal caller | — | Check with grep before implementing |

Run before implementing:
```
grep -r "runWaterfall\|buildEntityResolution" src/
```

---

## Verification Plan

1. `npx tsc --noEmit` — zero errors
2. `npm run lint` — zero errors
3. `npm run dev` starts and `/api/analyze` responds correctly for at least one company (e.g. Apple)
4. No circular imports: agents → types and datasources only; analyzer → agents, confidence, narrative, investment-memo

---

## Out of Scope

`analyzer.ts` will remain ~1,780 lines after this extraction. Further decomposition (e.g. extracting evidence-signal builders, section audit, report delta comparison into their own files) would reduce it to under 800 lines but is not part of this plan.
