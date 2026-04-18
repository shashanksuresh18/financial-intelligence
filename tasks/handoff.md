# Exa Deep Research — Private-Company Enrichment Plan

## Context

The current waterfall skips to Claude fallback for private companies (no Finnhub ticker, no FMP data). This plan:

1. Decouples FMP from Finnhub — FMP resolves its own symbol via FMP search, not Finnhub's symbol result.
2. Inserts Exa Deep Research as a dedicated private-company tier, before Claude fallback.

`exa-js` is already in `package.json`. No install step needed.

**Finnhub's role:** quote, news, insider transactions, analyst recommendations — signals that FMP does not provide. Finnhub is NOT the symbol authority for FMP.

**FMP's role:** valuation multiples, enterprise value, forward estimates, price-target consensus, peers — resolved independently via FMP's own `/stable/search` endpoint.

---

## Revised Waterfall Order

```
Current:
  1. Finnhub + GLEIF (parallel)
  2. [await Finnhub] → decide CH skip
  3. SEC + CH + GLEIF (parallel)
  4. FMP (sequential, depends on Finnhub symbol)   ← PROBLEM
  5. Claude fallback

Revised:
  1. Finnhub + FMP + GLEIF (all parallel)          ← FMP independent
  2. [await Finnhub] → decide CH skip
  3. SEC + CH + GLEIF + FMP (parallel — FMP already in flight)
  4. Exa Deep (fires only when isLikelyPrivate)     ← NEW
  5. Claude fallback (unchanged condition)
```

---

## Part A — Foundation: Types + Datasource Client

### Files Changed

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `"exa-deep"` to `DataSource`; add `ExaDeepData` type; add `exaDeep` field to `WaterfallResult` |
| `src/lib/datasources/exa-deep.ts` | **NEW** — Exa Deep Research API client |

---

### A1 — `src/lib/types.ts`

**Change 1: `DataSource` union** (lines 1–7, after `"gleif"`)

```typescript
export type DataSource =
  | "finnhub"
  | "fmp"
  | "sec-edgar"
  | "companies-house"
  | "gleif"
  | "exa-deep"          // ← NEW
  | "claude-fallback";
```

**Change 2: `ExaDeepData` type** — insert after `GleifData` (~line 738), before `ClaudeFallbackResult`

```typescript
export type ExaDeepData = {
  readonly companyName: string;
  readonly overview: string;
  readonly estimatedRevenue: string | null;
  readonly fundingTotal: string | null;
  readonly lastValuation: string | null;
  readonly foundedYear: string | null;
  readonly headquarters: string | null;
  readonly keyInvestors: readonly string[];
  readonly competitors: readonly string[];
  readonly recentNews: string;
};
```

**Change 3: `WaterfallResult` — add `exaDeep` field** (~lines 751–760, after `gleif`, before `claudeFallback`)

```typescript
export type WaterfallResult = {
  readonly query: string;
  readonly finnhub: DataSourceResult<FinnhubData> | null;
  readonly fmp: DataSourceResult<FmpData> | null;
  readonly secEdgar: DataSourceResult<SecEdgarData> | null;
  readonly companiesHouse: DataSourceResult<CompaniesHouseData> | null;
  readonly gleif: DataSourceResult<GleifData> | null;
  readonly exaDeep: DataSourceResult<ExaDeepData> | null;   // ← NEW
  readonly claudeFallback: DataSourceResult<ClaudeFallbackResult> | null;
  readonly activeSources: readonly DataSource[];
};
```

---

### A2 — `src/lib/datasources/exa-deep.ts` (NEW FILE)

Exported function signature:

```typescript
export async function fetchExaDeepData(
  query: string,
): Promise<ApiResult<ExaDeepData>>
```

Implementation notes (plan only — no code written):

1. Instantiate `new Exa(process.env.EXA_API_KEY)` at module scope; throw at construction if key absent (consistent with other clients).
2. Call `exa.research(...)` with query `"${query} company overview funding valuation investors competitors"` and a `contents: { schema: { ... } }` option whose schema matches the 10 fields of `ExaDeepData`.
3. Extract `output` from the top-level research response object (the single result returned by the SDK).
4. Validate: `output.content` must be a non-null object with non-empty `companyName` and `overview`. On failure → `{ success: false, error: "exa output missing required fields" }`.
5. Return `{ success: true, data: output.content as ExaDeepData }`.
6. Entire body in `try/catch`. On any error: `console.error("[exa-deep] fetch failed", { query, error })` then `{ success: false, error: String(err) }`.
7. Never throw — always return `ApiResult<ExaDeepData>`.

**Required env var:** `EXA_API_KEY` in `.env.local` before Part B is tested.

---

## Part B — Integration: FMP Decoupling + Waterfall + Confidence

### Files Changed

| File | Change |
|------|--------|
| `src/lib/datasources/fmp.ts` | Add `searchFmpSymbol(query)`; change `fetchFmpData` to accept query string, resolve symbol internally |
| `src/lib/agents/market-data-agent.ts` | Launch FMP in parallel with Finnhub/GLEIF; add `isLikelyPrivate`; wire Exa; update `buildActiveSources`; update `anyData` |
| `src/lib/confidence.ts` | Handle `"exa-deep"` in `buildIdentityComponent`, `buildFinancialsComponent`, `buildFreshnessComponent` |

---

### B1 — `src/lib/datasources/fmp.ts`

**Change 1: Add `searchFmpSymbol` helper** — insert before `fetchFmpData` (~line 307)

```typescript
async function searchFmpSymbol(query: string): Promise<string | null>
```

Implementation notes:
- Calls `GET /stable/search?query=<query>&limit=5&apikey=...`
- Picks the first result where `exchangeShortName` matches a major exchange (`NYSE`, `NASDAQ`, `LSE`, `XETRA`, `SIX`, or empty). Falls back to first result of any exchange.
- Returns the `symbol` string, or `null` if response is empty or malformed.
- Wrapped in try/catch — on error logs `[fmp] symbol search failed` and returns `null`.

**Change 2: Change `fetchFmpData` signature** (line 307)

```typescript
// Before:
export async function fetchFmpData(symbol: string): Promise<ApiResult<FmpData>>

// After:
export async function fetchFmpData(query: string): Promise<ApiResult<FmpData>>
```

At the top of the function body, replace the existing `upperSymbol` derivation with:

```typescript
const resolved = await searchFmpSymbol(query);

if (resolved === null || resolved.trim().length === 0) {
  return { success: false, error: `FMP: no symbol found for "${query}"` };
}

const upperSymbol = resolved.trim().toUpperCase();
```

Everything below `upperSymbol` (the 5-way `Promise.all` and normalization) is **unchanged**.

---

### B2 — `src/lib/agents/market-data-agent.ts`

**Change 1: Add `ExaDeepData` to type imports** (~line 1–7)

```typescript
import type {
  DataSource,
  DataSourceResult,
  ExaDeepData,        // ← ADD
  FinancialMetric,
  WaterfallInput,
  WaterfallResult,
} from "@/lib/types";
```

**Change 2: Add `fetchExaDeepData` import** (after existing datasource imports, ~line 9)

```typescript
import { fetchExaDeepData } from "@/lib/datasources/exa-deep";
```

**Change 3: Add `isLikelyPrivate` predicate** — insert after `shouldSkipCompaniesHouseLookup` (~line 97), before `buildActiveSources`

```typescript
function isLikelyPrivate(
  finnhubResult: Awaited<ReturnType<typeof fetchFinnhubData>>,
  fmpResult: DataSourceResult<FmpData> | null,
): boolean {
  const noFinnhubTicker =
    !finnhubResult.success ||
    finnhubResult.data.symbol.trim().length === 0;
  const noFmpData = fmpResult === null;
  return noFinnhubTicker && noFmpData;
}
```

`fmpResult` is the wrapped `DataSourceResult<FmpData>` — `null` when `wrapSource` received `{ success: false }`.

**Change 4: `buildActiveSources`** — add `exaDeep` branch after `gleif`, before `claudeFallback` (~lines 99–108)

```typescript
function buildActiveSources(result: WaterfallResult): readonly DataSource[] {
  return [
    ...(result.finnhub !== null ? (["finnhub"] as const) : []),
    ...(result.fmp !== null ? (["fmp"] as const) : []),
    ...(result.secEdgar !== null ? (["sec-edgar"] as const) : []),
    ...(result.companiesHouse !== null ? (["companies-house"] as const) : []),
    ...(result.gleif !== null ? (["gleif"] as const) : []),
    ...(result.exaDeep !== null ? (["exa-deep"] as const) : []),    // ← ADD
    ...(result.claudeFallback !== null ? (["claude-fallback"] as const) : []),
  ];
}
```

**Change 5: Rewrite `runWaterfall` fetch sequencing** (~lines 110–204)

Current sequence (problematic):
```
finnhubPromise + gleifPromise  →  await finnhub  →  Promise.all(edgar, ch, gleif)
                                                  →  await fmp (sequential, depends on finnhub symbol)
```

Revised sequence:

```typescript
// Step 1: start all three independent fetches in parallel
const finnhubPromise = fetchFinnhubData(input.query);
const fmpPromise = fetchFmpData(input.query);      // ← NOW PARALLEL, not after finnhub
const gleifPromise = fetchGleifData(input.query);

// Step 2: await finnhub only (needed for CH skip decision)
const finnhubResult = await finnhubPromise;
const skipCompaniesHouse = shouldSkipCompaniesHouseLookup(finnhubResult);
const companiesHouseResultPromise = skipCompaniesHouse
  ? Promise.resolve(null)
  : fetchCompaniesHouseData(input.query);

// Step 3: resolve remaining parallel fetches (FMP now included)
const [edgarResult, chResult, gleifResult, fmpResult] = await Promise.all([
  fetchSecEdgarData(input.query, { tickerHint: ... }),    // tickerHint logic unchanged
  companiesHouseResultPromise,
  gleifPromise,
  fmpPromise,                                             // ← ADDED here
]);

// Step 4: wrap sources
const finnhub = wrapSource("finnhub", finnhubResult);
const fmp = wrapSource("fmp", fmpResult);                // ← no longer conditional on finnhub
const secEdgar = wrapSource("sec-edgar", edgarResult);
const companiesHouse = chResult === null ? null : wrapSource("companies-house", chResult);
const gleif = wrapSource("gleif", gleifResult);
```

> `tickerHint` for SEC EDGAR: keep the existing logic — `finnhubResult.success && finnhubResult.data.symbol.trim().length > 0 ? finnhubResult.data.symbol : undefined`. Finnhub symbol is still a useful hint for SEC even though FMP no longer depends on it.

**Change 6: Add Exa Deep fetch** — after wrapping all sources, before `anyData` check

```typescript
// Step 5: Exa Deep (private companies only)
const exaDeep: DataSourceResult<ExaDeepData> | null =
  isLikelyPrivate(finnhubResult, fmp)
    ? wrapSource("exa-deep", await fetchExaDeepData(input.query))
    : null;
```

**Change 7: Update `anyData` to include `exaDeep`**

```typescript
const anyData =
  finnhub !== null ||
  fmp !== null ||
  secEdgar !== null ||
  companiesHouse !== null ||
  gleif !== null ||
  exaDeep !== null;     // ← ADD
```

**Change 8: Add `exaDeep` to `baseResult`**

```typescript
const baseResult: WaterfallResult = {
  query: input.query,
  finnhub,
  fmp,
  secEdgar,
  companiesHouse,
  gleif,
  exaDeep,           // ← ADD
  claudeFallback,
  activeSources: [],
};
```

`shouldSupplementWithClaude` condition and the Claude block are **not touched**.

---

### B3 — `src/lib/confidence.ts`

`buildStreetComponent` is unchanged (Exa provides no analyst or market signals). The other three builders each get an Exa branch inserted **before** the final `return { score: 0 }` fall-through.

**`buildIdentityComponent`** — after the `result.claudeFallback !== null` branch (~line 133), before `return { score: 0 }`

```typescript
if (result.exaDeep !== null) {
  return {
    key: "identity",
    label: "Entity Match",
    score: 14,
    rationale:
      "Entity identified via Exa Deep Research; no primary registry or market match.",
  };
}
```

Score 14 aligns with the existing single-source Finnhub-only tier.

**`buildFinancialsComponent`** — after the `result.claudeFallback` branch (~line 209), before `return { score: 0 }`

```typescript
if (result.exaDeep !== null) {
  const hasRevenue = result.exaDeep.data.estimatedRevenue !== null;
  const hasCapital =
    result.exaDeep.data.fundingTotal !== null ||
    result.exaDeep.data.lastValuation !== null;
  const score = hasRevenue && hasCapital ? 12 : hasRevenue || hasCapital ? 8 : 5;
  return {
    key: "financials",
    label: "Financial Depth",
    score,
    rationale:
      "Financial figures sourced from Exa Deep Research synthesis; not primary filings.",
  };
}
```

**`buildFreshnessComponent`** — after the `result.claudeFallback !== null` branch (~line 334), before `return { score: 0 }`

```typescript
if (result.exaDeep !== null) {
  return {
    key: "freshness",
    label: "Freshness",
    score: 6,
    rationale: "Exa Deep Research returned structured, grounded results.",
  };
}
```

---

## Test Cases

| Company | Finnhub | FMP own search | `isLikelyPrivate` | Exa fires | Expected tier |
|---------|---------|---------------|-------------------|-----------|---------------|
| Apple | AAPL ✓ | AAPL ✓ | false | No | ★★★ HIGH (SEC) |
| Microsoft | MSFT ✓ | MSFT ✓ | false | No | ★★★ HIGH (SEC) |
| Klarna | KLAR ✓ (NYSE 2025) | KLAR ✓ | false | No | ★★☆ MEDIUM |
| Deutsche Bank | DB ✓ | DB ✓ | false | No | ★★☆ MEDIUM (GLEIF + market) |
| SpaceX | — | — | true | Yes | ★★☆ MEDIUM |

---

## Out of Scope

- Exa result caching (the existing analysis cache covers the full report)
- Streaming Exa output
- Using Exa for public companies as a supplement
- Parsing `recentNews` into structured `NewsHighlight[]` — single `NewsHighlight` entry for now
- Any changes to `src/lib/analyzer.ts` or `src/app/api/analyze/route.ts` — `analyzeCompany` public API is unchanged
---

## Phase 4 Review — Complete

**Status:** implemented, tsc + lint clean, ready for manual browser testing. Do not commit yet.

### Files changed

| File | Change |
|------|--------|
| `src/lib/types.ts` | `”exa-deep”` in `DataSource`; `ExaDeepData` (10 fields); `exaDeep` in `WaterfallResult` |
| `src/lib/datasources/exa-deep.ts` | `fetchExaDeepData(query)` — uses `exa.research.create()` + `pollUntilFinished()`; accesses `result.output.parsed`; normalizes to `ExaDeepData` |
| `src/lib/datasources/fmp.ts` | `searchFmpSymbol(query)` via `/stable/search`; `fetchFmpData` now takes company name, resolves symbol internally |
| `src/lib/agents/market-data-agent.ts` | FMP launched in parallel with Finnhub/GLEIF; `isLikelyPrivate(finnhubResult, fmpResult: DataSourceResult<FmpData> \| null)`; Exa wired after parallel block; `exaDeep` in `anyData` and `baseResult`; `buildActiveSources` updated |
| `src/lib/confidence.ts` | `buildIdentityComponent`: exaDeep → score 14; `buildFinancialsComponent`: exaDeep → 5/8/12 based on field presence; `buildFreshnessComponent`: exaDeep → flat score 6; `buildStreetComponent`: unchanged |
| `src/components/DataSourceAttribution.tsx` | `”exa-deep”` label entry |
| `src/components/EntityResolutionPanel.tsx` | `”exa-deep”` label entry |
| `src/components/FinancialTable.tsx` | `”exa-deep”` label entry |

### Deviations from plan

- **`exa-deep.ts` API method corrected:** the SDK exposes `exa.research.create()` + `exa.research.pollUntilFinished()`, not `exa.search()`. Structured output is in `result.output.parsed` (not `output.content`). The plan's step 5 (`output.content as ExaDeepData`) was adjusted to use `output.parsed` with a type assertion, then normalised through `normalizeExaDeepData`.

### Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero warnings |
| `analyzer.ts` unchanged | ✓ no exa-deep references |
| `api/analyze/route.ts` unchanged | ✓ no exa-deep references |
| `buildStreetComponent` unchanged | ✓ no exaDeep branch |

### Manual testing required

1. SpaceX / Stripe — trigger `isLikelyPrivate`, confirm Exa fires (requires `EXA_API_KEY` in `.env.local`)
2. Apple / Microsoft — confirm Exa does NOT fire
3. Klarna (`KLAR`) — confirm Exa does NOT fire
4. Deutsche Bank — confirm Exa does NOT fire, GLEIF + Finnhub path unchanged
