# Phase 5: Validation Agent Plan

## Phase 5 Review — Complete

**Status:** implemented, tsc + lint clean, ready for manual browser testing. Do not commit yet.

### Files changed

| File | Change |
|------|--------|
| `src/lib/types.ts` | 6 new types (`ValidationSeverity`, `ValidationCoverageLabel`, `ValidationTension`, `ValidationCrossCheck`, `ValidationGap`, `ValidationReport`); `validationReport` field on `AnalysisReport`; `placeholderValidationReport` const; added to `placeholderAnalysisReport` |
| `src/lib/agents/validation-agent.ts` | `validateWaterfall(result)` — 7 cross-checks, 5 gap detectors, coverage label classifier, scoring formula |
| `src/lib/analyzer.ts` | Import + call `validateWaterfall` after `runWaterfall`; `validationReport` in return object |

### Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero warnings |
| All 7 cross-checks present | ✓ entity name, revenue, market cap, earnings direction, company status, filing freshness, ticker identifier |
| All 5 gaps present | ✓ no SEC XBRL for US-listed, no CH for UK, no analyst coverage >$5B, no news 30d, Exa Deep without funding |
| Coverage label 5 values | ✓ Strong Public, Registry-led, Ambiguous Entity, Limited Private, Thin |
| Scoring formula | ✓ start 100, -20 high tension, -10 medium tension, -15 high gap, -5 medium gap, floor 0 |
| Deviations from plan | None — implementation matches plan exactly |

### Manual testing required

1. Apple (AAPL) — expect `coverageLabel: "Strong Public"`, `dataQualityScore` near 100, possible "No news" gap
2. Deutsche Bank — expect `coverageLabel: "Registry-led"` or `"Strong Public"` depending on FMP/SEC availability
3. SpaceX (Exa Deep path) — expect `coverageLabel: "Limited Private"`, Exa funding gap if data missing
4. Any UK company via Companies House — expect company status check to run

---

## Context

The waterfall now has 7 sources: Finnhub, FMP, SEC EDGAR, Companies House, GLEIF, Exa Deep, Claude fallback. Each produces independent data. Currently there is no layer that cross-checks facts between sources, flags entity identity divergence, or measures per-run data quality with a numeric score.

This phase adds a deterministic, pure-logic validation layer. No Claude calls. No external fetches. Input: `WaterfallResult`. Output: `ValidationReport`.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/types.ts` | 6 new types + `validationReport` field on `AnalysisReport` + placeholder default |
| `src/lib/agents/validation-agent.ts` | **NEW** — exports `validateWaterfall` |
| `src/lib/analyzer.ts` | Import + call `validateWaterfall`; wire `validationReport` into return object |

---

## Part A — Types (`src/lib/types.ts`)

### A1 — New types (insert after `GleifData`, before `ExaDeepData`, ~line 740)

```typescript
export type ValidationSeverity = "high" | "medium" | "low";

export type ValidationCoverageLabel =
  | "Strong Public"
  | "Registry-led"
  | "Ambiguous Entity"
  | "Limited Private"
  | "Thin";

export type ValidationTension = {
  readonly check: string;
  readonly detail: string;
  readonly sources: readonly DataSource[];
  readonly severity: ValidationSeverity;
};

export type ValidationCrossCheck = {
  readonly check: string;
  readonly passed: boolean;
  readonly detail: string;
  readonly sources: readonly DataSource[];
};

export type ValidationGap = {
  readonly gap: string;
  readonly detail: string;
  readonly severity: ValidationSeverity;
};

export type ValidationReport = {
  readonly coverageLabel: ValidationCoverageLabel;
  readonly dataQualityScore: number;
  readonly tensions: readonly ValidationTension[];
  readonly gaps: readonly ValidationGap[];
  readonly crossChecks: readonly ValidationCrossCheck[];
};
```

### A2 — Add `validationReport` to `AnalysisReport` (~line 354, after `sectionAudit`)

```typescript
export type AnalysisReport = {
  // ... existing fields unchanged ...
  readonly sectionAudit: readonly SectionAuditItem[];
  readonly validationReport: ValidationReport;     // ← NEW
  readonly newsHighlights: readonly NewsHighlight[];
  // ...
};
```

### A3 — Add placeholder const (after `placeholderConfidence`, ~line 843)

```typescript
export const placeholderValidationReport: ValidationReport = {
  coverageLabel: "Thin",
  dataQualityScore: 0,
  tensions: [],
  gaps: [],
  crossChecks: [],
};
```

### A4 — Add to `placeholderAnalysisReport` (~line 930, after `sectionAudit: []`)

```typescript
validationReport: placeholderValidationReport,
```

---

## Part B — `src/lib/agents/validation-agent.ts` (NEW FILE)

### Imports

```typescript
import type {
  DataSource,
  ValidationCoverageLabel,
  ValidationCrossCheck,
  ValidationGap,
  ValidationReport,
  ValidationSeverity,
  ValidationTension,
  WaterfallResult,
} from "@/lib/types";
import {
  extractLatestFact,
  REVENUE_CONCEPTS,
} from "@/lib/datasources/sec-edgar";
```

### B1 — `buildCoverageLabel(result: WaterfallResult): ValidationCoverageLabel`

Classification logic (evaluated in priority order):

| Condition | Label |
|-----------|-------|
| `result.finnhub?.data.isAmbiguous === true` | `"Ambiguous Entity"` |
| SEC + FMP + Finnhub all non-null | `"Strong Public"` |
| `result.exaDeep !== null` AND `result.finnhub === null` AND `result.fmp === null` AND `result.secEdgar === null` | `"Limited Private"` |
| `result.claudeFallback !== null` AND all structured sources null | `"Thin"` |
| `result.companiesHouse !== null` OR `result.gleif !== null` | `"Registry-led"` |
| fallthrough | `"Thin"` |

Note: "Ambiguous Entity" check precedes all others. A result with `isAmbiguous` is labeled ambiguous even if data is rich.

### B2 — `normalizeCompanyName(name: string): string` (local private helper)

```typescript
// Strip common legal suffixes, uppercase, strip non-alphanumeric, trim.
// e.g. "Apple Inc." → "APPLE", "Deutsche Bank AG" → "DEUTSCHE BANK"
```

Implementation:
1. `toUpperCase()`
2. Remove trailing legal markers: `\b(INC\.?|CORP\.?|LLC\.?|LTD\.?|PLC\.?|AG|SA|NV|BV|GMBH|SE|KG|AB|ASA|OYJ)\b`
3. Replace non-alphanumeric with space
4. Trim and collapse whitespace

### B3 — `runCrossChecks(result: WaterfallResult): readonly ValidationCrossCheck[]`

Run all 7 checks in sequence. Each check produces exactly one `ValidationCrossCheck`. Skip (omit from output) when prerequisite data is null for both sides.

---

**Check 1: Entity name consistency**

- Sources involved: any two of {Finnhub, SEC EDGAR, Companies House, GLEIF} where both names are non-null.
- Collect available names:
  - `finnhubName = result.finnhub?.data.companyName ?? null`
  - `secName = result.secEdgar?.data.companyInfo?.name ?? result.secEdgar?.data.xbrlFacts?.entityName ?? null`
  - `chName = result.companiesHouse?.data.company?.company_name ?? null`
  - `gleifName = result.gleif?.data.record?.attributes.entity.legalName.name ?? null`
- Normalize each non-null name. Extract first token of normalized name.
- Check: collect all normalized first tokens. Do the non-null names agree on the first token?
- Pass if 0 or 1 names are present (nothing to compare), or if all first tokens agree.
- Fail if first tokens diverge (e.g. "APPLE" vs "METASPACEX").
- Sources: all sources that contributed a name.
- Detail on pass: `"Entity names are consistent across ${n} sources."`
- Detail on fail: `"Name mismatch: ${list of source:name pairs}."`

---

**Check 2: Revenue — FMP forward estimate vs SEC XBRL trailing**

- Skip if `result.secEdgar === null || result.fmp === null`.
- Skip if `result.secEdgar.data.xbrlFacts === null`.
- `secRevenue = extractLatestFact(result.secEdgar.data.xbrlFacts, REVENUE_CONCEPTS)`
- `fmpRevenue = result.fmp.data.analystEstimates[0]?.estimatedRevenueAvg ?? null`
- Skip if either is null or zero.
- `divergencePct = Math.abs(secRevenue - fmpRevenue) / Math.max(Math.abs(secRevenue), Math.abs(fmpRevenue)) * 100`
- Pass if `divergencePct <= 5`.
- Fail if `divergencePct > 5`.
- Detail: `"SEC trailing revenue ${formatRevenue(secRevenue)} vs FMP forward estimate ${formatRevenue(fmpRevenue)} (${divergencePct.toFixed(1)}% gap; period mismatch expected)."`
- Sources: `["sec-edgar", "fmp"]`

`formatRevenue` helper: `(n: number) => n >= 1e9 ? `${(n/1e9).toFixed(1)}B` : `${(n/1e6).toFixed(0)}M``

---

**Check 3: Market cap — Finnhub vs FMP within 2%**

- Skip if `result.finnhub === null || result.fmp === null`.
- `finnhubMcap = result.finnhub.data.basicFinancials?.metric.marketCapitalization ?? null` — **in USD millions**
- `fmpMcap = result.fmp.data.enterpriseValues[0]?.marketCapitalization ?? null` — **in absolute USD**
- Skip if either is null or zero.
- Normalize to same unit: `fmpMcapM = fmpMcap / 1_000_000`
- `divergencePct = Math.abs(finnhubMcap - fmpMcapM) / Math.max(finnhubMcap, fmpMcapM) * 100`
- Pass if `divergencePct <= 2`.
- Fail if `divergencePct > 2`.
- Detail: `"Finnhub market cap ${finnhubMcap.toFixed(0)}M vs FMP ${fmpMcapM.toFixed(0)}M (${divergencePct.toFixed(1)}% gap)."`
- Sources: `["finnhub", "fmp"]`

---

**Check 4: Earnings direction vs consensus**

- Skip if `result.finnhub === null`.
- `latestEarnings = result.finnhub.data.earnings[0] ?? null`
- `latestRec = [...result.finnhub.data.recommendations].sort((a, b) => b.period.localeCompare(a.period))[0] ?? null`
- Skip if either is null.
- Skip if `latestEarnings.surprisePercent === null`.
- `consensusBullish = latestRec.strongBuy + latestRec.buy > latestRec.strongSell + latestRec.sell`
- `earningsBeat = latestEarnings.surprisePercent > 0`
- Pass if `earningsBeat === consensusBullish` OR if the divergence is mild (`Math.abs(latestEarnings.surprisePercent) < 5`).
- Fail if a large miss (`< -10%`) coexists with a strongly bullish consensus, or a large beat (`> +10%`) coexists with a bearish consensus.
- Detail: `"${latestEarnings.period} surprise ${latestEarnings.surprisePercent.toFixed(1)}% vs consensus ${consensusBullish ? 'bullish' : 'bearish'}."`
- Sources: `["finnhub"]`

---

**Check 5: Company status — active**

- Skip if both `result.companiesHouse === null` AND `result.gleif === null`.
- For Companies House: `chStatus = result.companiesHouse?.data.company?.company_status ?? null`
- For GLEIF: `gleifStatus = result.gleif?.data.record?.attributes.registration.status ?? null`
- Pass if all non-null statuses are active (`chStatus === "active"`, `gleifStatus === "ISSUED"`).
- Fail if any status is inactive (dissolved, liquidation, LAPSED, RETIRED, MERGED, etc.).
- Sources involved: those that provided a status.
- Detail: list each source:status pair.

---

**Check 6: Filing freshness**

- Two sub-checks, always bundled into one `ValidationCrossCheck`:

  *SEC freshness* (skip if `result.secEdgar === null` or `recentFilings` empty):
  - `latestFiling = result.secEdgar.data.recentFilings[0]`
  - `daysSinceFiling = (Date.now() - new Date(latestFiling.filingDate).getTime()) / 86_400_000`
  - Fresh if `daysSinceFiling <= 90`.

  *CH overdue* (skip if `result.companiesHouse === null`):
  - `overdue = result.companiesHouse.data.profile?.accounts?.next_accounts?.overdue ?? false`
  - Pass if `!overdue`.

- Overall pass if both sub-checks that ran passed.
- Detail: summarise SEC days-since-filing and/or CH overdue status.
- Sources: whichever sub-checks ran.

---

**Check 7: Ticker identifier consistency**

- Skip if `result.secEdgar === null || result.finnhub === null`.
- `secTickers = result.secEdgar.data.companyInfo?.tickers ?? []`
- Skip if `secTickers.length === 0`.
- `finnhubSymbol = result.finnhub.data.symbol.toUpperCase()`
- `secNormalized = secTickers.map(t => t.toUpperCase())`
- Pass if `secNormalized.includes(finnhubSymbol)` OR if Finnhub symbol contains a dot (non-US listing — SEC won't list it).
- Fail otherwise.
- Sources: `["sec-edgar", "finnhub"]`
- Detail: `"SEC tickers [${secNormalized.join(', ')}] vs Finnhub symbol ${finnhubSymbol}."`

---

### B4 — `detectTensions(crossChecks: readonly ValidationCrossCheck[]): readonly ValidationTension[]`

Map each failed `ValidationCrossCheck` to a `ValidationTension`:

| Check name | Severity |
|-----------|----------|
| Entity name consistency | `"high"` |
| Revenue — FMP vs SEC | `"medium"` |
| Market cap — Finnhub vs FMP | `"medium"` |
| Earnings direction vs consensus | `"low"` |
| Company status — active | `"high"` |
| Filing freshness | `"medium"` |
| Ticker identifier consistency | `"medium"` |

Mapping: `{ check: crossCheck.check, detail: crossCheck.detail, sources: crossCheck.sources, severity }`. Return only failed checks.

### B5 — `detectGaps(result: WaterfallResult): readonly ValidationGap[]`

Run 5 gap detectors. Each adds a `ValidationGap` when the condition is met.

**Gap 1 — No SEC XBRL for US-listed company**

- Condition: Finnhub is non-null AND the symbol contains no dot (no exchange suffix, indicating US listing) AND `result.secEdgar?.data.xbrlFacts === null`.
- Severity: `"high"`
- Gap: `"No SEC XBRL for US-listed company"`
- Detail: `"${symbol} appears to be a US listing but SEC EDGAR returned no structured XBRL facts. Filing-backed financials are unavailable."`

**Gap 2 — No Companies House for UK-registered entity**

- Condition: GLEIF jurisdiction is `"GB"` (or starts with `"GB"`) OR Finnhub symbol ends with `.L` — AND `result.companiesHouse === null`.
- Severity: `"high"`
- Gap: `"No Companies House data for UK entity"`
- Detail: `"Entity appears UK-registered (${reason}) but Companies House lookup returned no results."`

**Gap 3 — No analyst coverage for large-cap**

- Condition: `result.finnhub?.data.basicFinancials?.metric.marketCapitalization ?? 0` > 5000 (USDm) AND `result.finnhub?.data.recommendations.length === 0 || result.finnhub === null`.
- Severity: `"medium"`
- Gap: `"No analyst coverage despite market cap >$5B"`
- Detail: `"Market cap of ${mcap}M exceeds the $5B threshold but no analyst recommendations were found."`

**Gap 4 — No recent news (30-day silence)**

- Condition: `result.finnhub !== null` AND (`result.finnhub.data.news.length === 0` OR the most recent news item's `datetime * 1000 < Date.now() - 30 * 86_400_000`).
- Severity: `"medium"`
- Gap: `"No news coverage in the past 30 days"`
- Detail: `"Finnhub returned no headlines dated within the last 30 days, which limits freshness for monitoring scenarios."`

**Gap 5 — Exa Deep without funding data**

- Condition: `result.exaDeep !== null` AND `result.exaDeep.data.fundingTotal === null` AND `result.exaDeep.data.lastValuation === null`.
- Severity: `"medium"`
- Gap: `"Exa Deep result missing funding or valuation data"`
- Detail: `"Exa Deep Research identified the company but returned neither a funding total nor a last-known valuation, limiting private-company financial context."`

### B6 — `computeDataQualityScore(tensions: readonly ValidationTension[], gaps: readonly ValidationGap[]): number`

```
score = 100
score -= tensions.filter(t => t.severity === "high").length * 20
score -= tensions.filter(t => t.severity === "medium").length * 10
score -= gaps.filter(g => g.severity === "high").length * 15
score -= gaps.filter(g => g.severity === "medium").length * 5
return Math.max(0, score)
```

Low-severity tensions and gaps are omitted from the score formula (they are informational only).

### B7 — `validateWaterfall(result: WaterfallResult): ValidationReport`

```typescript
export function validateWaterfall(result: WaterfallResult): ValidationReport {
  const coverageLabel = buildCoverageLabel(result);
  const crossChecks = runCrossChecks(result);
  const tensions = detectTensions(crossChecks);
  const gaps = detectGaps(result);
  const dataQualityScore = computeDataQualityScore(tensions, gaps);
  return { coverageLabel, dataQualityScore, tensions, gaps, crossChecks };
}
```

---

## Part C — `src/lib/analyzer.ts` (wiring)

### C1 — Add type import

```typescript
import type {
  // ... existing ...
  ValidationReport,      // ← ADD
  WaterfallResult,
} from "@/lib/types";
```

### C2 — Add function import (~line 25)

```typescript
import { validateWaterfall } from "@/lib/agents/validation-agent";
```

### C3 — Call in `analyzeCompany` after `runWaterfall` (~line 1642)

```typescript
const waterfallResult = await runWaterfall({ query });
const validationReport = validateWaterfall(waterfallResult);   // ← ADD
const entityResolution = buildEntityResolution(query, waterfallResult);
```

`validationReport` is now in scope for the entire `analyzeCompany` function.

### C4 — Add to return object (~line 1757, after `sectionAudit`)

```typescript
  sectionAudit,
  validationReport,     // ← ADD
  newsHighlights,
```

---

## Coverage Label Decision Table

| secEdgar | fmp | finnhub | exaDeep | claudeFallback | isAmbiguous | Label |
|----------|-----|---------|---------|----------------|-------------|-------|
| any | any | any | any | any | true | Ambiguous Entity |
| ✓ | ✓ | ✓ | any | any | false | Strong Public |
| null | null | null | ✓ | any | false | Limited Private |
| null | null | null | null | ✓ | false | Thin |
| any (not all 3) | — | — | null | any | false | Registry-led (if CH or GLEIF present) |
| null | null | null | null | null | false | Thin |

---

## Data Quality Score Examples

| Scenario | Tensions | Gaps | Score |
|----------|----------|------|-------|
| Apple (SEC + FMP + Finnhub, all consistent) | 0 | 0 | 100 |
| Apple with entity name mismatch (high) | 1 high | 0 | 80 |
| Revolut (no SEC, CH present) | 0 | 1 high (no XBRL) | 85 |
| SpaceX via Exa (no funding data) | 0 | 1 medium | 95 |
| Metaspacex false match (name mismatch + ticker mismatch) | 1 high + 1 medium | 0 | 70 |

---

## Test Cases (verify after implementation)

| Company | Expected Label | Expected Tensions | Expected Gaps |
|---------|---------------|-------------------|---------------|
| Apple (AAPL, SEC + FMP + Finnhub) | Strong Public | 0 if data consistent | Possible: no news >30d |
| Revolut (CH only) | Registry-led | 0 | No SEC XBRL for UK entity (N/A) |
| SpaceX (Exa Deep only) | Limited Private | 0 | Exa Deep without funding if blank |
| Deutsche Bank (Finnhub + GLEIF) | Registry-led | 0 | No SEC XBRL |
| Metaspacex false match | Ambiguous Entity or Registry-led | Entity name mismatch (high) | — |

---

## Out of Scope

- UI rendering of `ValidationReport` (no frontend changes in this phase)
- Adding `validationReport` to the delta comparison in `compareReports` — deferred
- Caching `ValidationReport` separately — covered by existing analysis cache
- Any changes to `confidence.ts`, `investment-memo.ts`, or narrative generation — `validationReport` is computed independently
- Logging of tensions/gaps to the server log — no new `console.error` calls needed
