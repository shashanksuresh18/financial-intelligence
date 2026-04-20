# Sprint B — Phase 11 UI/UX Polish Review (2026-04-19)

## UI Components Verified ✓

| Component | Sprint B Changes Present |
|-----------|--------------------------|
| `SearchBar.tsx` | `fi-interactive fi-focus-ring` on form; `focus-within:border-emerald-400/30 focus-within:ring-2 focus-within:ring-emerald-400/50` focus ring; `fi-icon-pulse` animation on search icon when `isSearching`; emerald hover states on submit button |
| `Report.tsx` | Hero header: `renderConfidenceStars` with emerald/amber/zinc colour tiers; `RECOMMENDATION_STYLES` (emerald=buy, blue=watch, amber=hold, rose=avoid); `COVERAGE_STYLES` gradient badges; `fi-fade-in` on root section |
| `ThemePanel.tsx` | `exposureTone` with glowing emerald `shadow-[0_0_18px_...]` at ≥80; amber at ≥60; `TagSection` chips with rose for headwinds / emerald for key drivers / neutral hover for related-themes; `fi-focus-ring fi-interactive` on clickable chips; `ThemeSkeleton` with `animate-pulse` |
| `MonitorList.tsx` | `getConfidenceDotClass` — emerald with glow at high, amber at medium, zinc at low; `fi-card-hover` on list items; active item `shadow-[0_20px_50px_-34px_rgba(16,185,129,0.38)]` emerald glow; remove button fades in on `group-hover`; `fi-focus-ring fi-interactive` on all buttons |
| `ActiveSnapshotPanel.tsx` | `getCoverageBarClass` — emerald glow ≥80, amber ≥60, blue ≥40, zinc <40; animated coverage bar; `fi-fade-in` |
| `InvestmentMemoPanel.tsx` | Conviction/recommendation badges; `STRESS_TEST_SEVERITY_STYLES` (rose/amber/zinc); mandate footer conditional on `hasStressTestContent` (Sprint A intact) |
| `page.tsx` | `key={activeTab}` on tab-content `div` forces `fi-fade-in` re-mount on tab switch; `handleTabChange` persists to localStorage; `fi-fade-in` on hero, report, autocomplete, and empty-state sections |

## Design System Consistency ✓

| Colour | Usage |
|--------|-------|
| `emerald` | Buy, high confidence, active state, positive signals, watched count |
| `amber` | Watch, hold, medium confidence, registry-led coverage |
| `rose` | Avoid, red flags, high-severity gaps, remove button |
| `blue` | Ticker badges, informational (watch recommendation in Report.tsx) |
| `zinc` | Structure, borders, neutral states, low confidence |

## Protected Files — Unchanged ✓

| File | Status |
|------|--------|
| `src/lib/amakor-mandate.ts` | Unchanged (no diff vs HEAD) |
| `prisma/schema.prisma` | Unchanged |
| `package.json` | Unchanged |
| `src/lib/agents/` (all) | CRLF-only diff — no content changes |
| `src/lib/analyzer.ts` | Not in working-tree diff at all |

Note: `src/app/api/analyze/route.ts` and `src/app/api/search/route.ts` have content changes, but these are pre-Sprint-B fixes (analyze route adds `validationReport`/`waterfallResult` to `normalizeReportShape`; search route adds known-private-company guard) both documented in Sprint A handoff.

## Build Checks ✓

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero warnings |
| `npm run build` | ✓ production build succeeds (5.9s compile) |

## Status: Ready for Antigravity

---

# Phase 9: Demo Hardening & Vercel Deployment

## Round 5 Client Demo Fix

### Issue

Autocomplete search was still hitting Companies House directly for known private-company queries, so inputs such as `Anthropic`, `SpaceX`, and `Stripe` surfaced dormant UK shell-company records instead of the intended private-company research path.

### Fix Implemented

| File | Change | Result |
|------|--------|--------|
| `src/app/api/search/route.ts` | Added an early known-private-company guard using `isKnownPrivateCompanyQuery(query)`. Matching queries now bypass Companies House and the rest of the live search fan-out entirely, and return a single synthetic autocomplete result with `displayName`, `subtitle`, `source: "private"`, `ticker: null`, `companyNumber: null`, and `canUseAnalyze: true`. | Prevents dormant UK registry entities from entering the autocomplete list for known private companies. |
| `src/lib/company-search.ts` | Reused the existing known-private-company capitalization map under `KNOWN_PRIVATE_COMPANY_DISPLAY_NAMES`, still exposed through `getKnownPrivateCompanyCanonicalName(query)`. | Synthetic autocomplete entries reuse the same canonical display names as the Round 4 analysis fix (`SpaceX`, `Anthropic`, `Stripe`, `OpenAI`, `xAI`, etc.). |
| `src/lib/types.ts` | Expanded `SearchResult` to support optional `displayName`, `subtitle`, `source`, `companyNumber`, and `canUseAnalyze` fields, while allowing nullable `ticker` for synthetic private entries. | Search API and UI can represent private synthetic entries without breaking existing public-company results. |
| `src/app/page.tsx` | Updated autocomplete rendering and selection to prefer `displayName`/`subtitle` when present, while still routing clicks into `/api/analyze` with the visible company label. Watch-list adds now also use the displayed label. | Private synthetic entries render cleanly in the dropdown and click through to the same analysis flow as public-company entries. |
| `tasks/lessons.md` | Added a regression-prevention rule that autocomplete fixes must land on the live `/api/search` path, not just the analysis waterfall. | Captures the failure mode so the bug does not recur on a future search-only refactor. |

### Verification

| Check | Result |
|-------|--------|
| `cmd /c npx tsc --noEmit` | ✓ zero errors |
| `cmd /c npm run lint` | ✓ zero warnings |
| `cmd /c npm run build` | ✓ production build succeeds |
| Local built app: `GET /api/search?q=Anthropic` | ✓ returned exactly one synthetic result: `Anthropic`, `source: "private"`, subtitle `Private company — research via Exa Deep` |
| Local built app: `GET /api/search?q=SpaceX` | ✓ returned exactly one synthetic result: `SpaceX`, `source: "private"`, subtitle `Private company — research via Exa Deep` |
| Local built app: `GET /api/search?q=Stripe` | ✓ returned exactly one synthetic result: `Stripe`, `source: "private"`, subtitle `Private company — research via Exa Deep` |
| Local built app: `GET /api/search?q=Apple` | Sandbox blocked outbound fetches, so live public results could not be proven here. The route did not take the private-company shortcut and attempted normal Finnhub / Companies House / GLEIF lookups, confirming unchanged code path for non-private names. |
| Local built app: `GET /api/search?q=Klarna` | Sandbox blocked outbound fetches, but the request stayed on the normal public search path rather than returning a synthetic private result. |
| Local built app: `GET /api/search?q=Greggs` | Sandbox blocked outbound fetches, but the request stayed on the normal public search path rather than returning a synthetic private result. |

## Status

Reviewed and confirmed correct. Ready for deployment.

## Fourth Post-QA Verification — Bugs 2 & 3 Confirmed

| Bug | Check | Result |
|-----|-------|--------|
| 2 — Challenger token limit | `MAX_TOKENS = 2000` at line 13 of `challenger-agent.ts` | ✓ |
| 2 — Truncation detection | `TRUNCATION_WARNING_TOKEN_BUFFER`, `isNearMaxTokens`, warning log within 50 tokens of max | ✓ |
| 2 — JSON repair fallback | `repairTruncatedJsonCandidate`, `buildJsonCandidates`, `parseChallengerResponse` accepts token metadata | ✓ |
| 3 — Private name override | `getKnownPrivateCompanyCanonicalName` imported and called in `buildEntityResolution`; override fires when `baseCanonicalName` has corporate suffix but query does not | ✓ |
| Build | `npx tsc --noEmit` | ✓ zero errors |
| Build | `npm run lint` | ✓ zero warnings |
| Build | `npm run build` | ✓ production build succeeds |
| curl SpaceX (forceRefresh) | `canonicalName: "SpaceX"`, `primarySource: null` | ✓ |
| curl Apple (forceRefresh) | `investmentMemo.stressTest.unstatedAssumptions` has 3 items | ✓ |

**Note**: Tests require `forceRefresh: true` because a stale cached result for SpaceX ("SPACEX LTD") was present from before the fix. With `forceRefresh: true` the fix executes correctly and the override snaps canonical name back to "SpaceX".

## Third Post-QA Fixes — Implemented and Verified

| File | Exact change | Verified |
|------|--------------|----------|
| `src/lib/agents/challenger-agent.ts` | Increased `MAX_TOKENS` from `700` to `2000`. Added truncation diagnostics for raw challenger output: chars, output tokens, `stop_reason`, closing-brace check, and the last 100 chars. Added a near-limit warning when output is within 50 tokens of `max_tokens`. `parseChallengerResponse` now accepts token metadata, detects likely truncation, trims to the last complete array element, closes unterminated strings, balances brackets/braces, and retries parsing before falling back to `emptyChallengerReport()`. | `npx tsc --noEmit` ✓, `npm run lint` ✓, `npm run build` ✓. Local transpiled parser verification recovered `3` assumptions / `3` gaps / `2` scenarios from a deliberately truncated JSON payload. |
| `src/lib/agents/market-data-agent.ts` | Extended the known-private-company route so `shouldForcePrivateRoute` also skips the Companies House leg, not just Finnhub and FMP. This keeps dormant UK registry matches such as `SPACEX LTD` out of the waterfall entirely. | Live local `curl` against `/api/analyze` for `SpaceX` returned `spacexHasCompaniesHouse: false`. |
| `src/lib/company-search.ts` | Added `KNOWN_PRIVATE_COMPANY_NAMES` and exported `getKnownPrivateCompanyCanonicalName(query)` so canonical-name overrides can reuse the known-private-company list while preserving display capitalization such as `SpaceX`, `OpenAI`, and `xAI`. | Consumed by `entity-agent.ts`; compile/lint/build all passed. |
| `src/lib/agents/entity-agent.ts` | Added `hasCorporateSuffix()` and a final canonical-name override for known private companies. If resolution ends on a suffix-appended legal entity name while the user query itself did not include a suffix, the canonical name now snaps back to the known private-company name. | Live local `curl` against `/api/analyze` for `SpaceX` returned `canonicalName: "SpaceX"`. |
| `tasks/lessons.md` | Added a regression-prevention rule covering challenger token ceilings/truncation handling and full private-company waterfall bypasses. | Documentation updated. |

### Verification (third post-QA round)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero warnings |
| `npm run build` | ✓ production build succeeds |
| `curl -X POST http://localhost:3000/api/analyze ...SpaceX...` | ✓ `canonicalName: "SpaceX"` and no `companies-house` source in the response |
| `curl -X POST http://localhost:3000/api/analyze ...Apple...` | Local route execution succeeded, but this sandbox blocks outbound API/Anthropic traffic (`EACCES` / `Connection error`), so live `3/3/2` stress-test counts could not be proven end-to-end here. The challenger parser repair path was validated locally with a truncated JSON payload and recovered `3/3/2`. |

## Second Post-QA Fixes — Reviewed and Verified

| Bug | File(s) | Fix | Verified |
|-----|---------|-----|---------|
| 2 — Challenger empty arrays | `challenger-agent.ts` | System prompt: "Respond with ONLY valid JSON…no markdown or prose". `buildJsonCandidates` tries: raw, fence-stripped, regex-extracted fence body, brace-bounded substring. `findChallengerPayload` checks direct keys + snake_case aliases + recursive nested search. `normalizeItems` accepts string items and alternate field names (`description`, `cited_source`, `source`, `level`). `logParsedCounts` logs per-run counts. Raw response logged at `console.log`. | ✓ |
| 3 — SpaceX private routing | `company-search.ts`, `market-data-agent.ts` | `KNOWN_PRIVATE_COMPANIES` expanded (SpaceX, Stripe, Databricks, Anthropic, OpenAI, xAI, Revolut, Gopuff, Getir, Flink, Brex, Ramp, Deel, Notion, Canva, ByteDance). `forcePrivateCompanyRoute` returns `isKnownPrivateCompanyQuery(query)`. In `runWaterfall`: `finnhubPromise` short-circuits to `createSkippedFinnhubResult`; `fmpPromise` resolves `null` — both before any network call. Log at `console.info` confirms the skip. | ✓ |
| 6 — Tab persistence on refresh | `page.tsx` | `getInitialActiveTab()` helper with `typeof window === "undefined"` SSR guard; reads `window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)` with try/catch. `useState<ActiveTab>(() => getInitialActiveTab())` lazy initializer — tab rendered on first paint, no post-mount flash. Write path uses `window.localStorage.setItem`. Key `"fin:activeTab"` consistent on read and write. | ✓ |

### Build verification (second post-QA round)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero warnings |
| `npm run build` | ✓ production build succeeds |

## Post-QA Fixes — Reviewed and Verified

| Bug | File(s) | Fix | Verified |
|-----|---------|-----|---------|
| 1 — Deprecated Claude model | `challenger-agent.ts` | `MODEL = 'claude-haiku-4-5'` at line 12 | ✓ |
| 2 — Stress Test UI missing | `InvestmentMemoPanel.tsx` | Conditional `<SectionCard title="Stress Test">` after Key Risks; `StressTestGroup` sub-component with severity badges; `Conviction Downgraded` rose banner | ✓ |
| 3 — SEC EDGAR CIK lookup | `sec-edgar.ts` | `TICKER_MAP_URL` → `company_tickers.json`; `USER_AGENT` from env; `buildTickerVariants` uppercases; cached module-level promise; `lookupTickerCik` with variant fallbacks | ✓ |
| 4 — SpaceX entity resolution | `company-search.ts`, `finnhub.ts` | `KNOWN_PRIVATE_COMPANIES` list (SpaceX, Stripe, Anthropic, OpenAI, xAI, Revolut…); `isKnownPrivateCompanyQuery`; merged-token substring matches penalized (score −20) | ✓ |
| 5 — Finnhub 403 graceful skip | `finnhub.ts` | `PREMIUM_ENDPOINT_LOGS` Set; `isPremiumAccessDenied`; `logPremiumEndpointSkipOnce` deduplicates; analysis continues; 403 omitted from output | ✓ |

### Build verification (post-QA)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero warnings |
| `npm run build` | ✓ production build succeeds |

## Files Changed

| File | Change | Verified |
|------|--------|---------|
| `src/lib/demo-names.ts` | `DEMO_COMPANIES` (9 names) + `DEMO_THEMES` (5 themes) + exported types | ✓ |
| `src/components/ErrorBoundary.tsx` | `"use client"` class component; `getDerivedStateFromError` + `componentDidCatch` | ✓ |
| `src/lib/datasources/exa-deep.ts` | Migrated from `research.create`/polling to `exa.search({ type:"deep" })`; `satisfies DeepOutputSchema`; revert comment present | ✓ |
| `src/app/page.tsx` | `ACTIVE_TAB_STORAGE_KEY`; `handleTabChange` with localStorage; mount restore; 429 guard in `runAnalysis`; demo chips; `ErrorBoundary` on Report + ThemePanel | ✓ |
| `src/components/ThemePanel.tsx` | 429 + 408/504 guards before generic error; polished fallback messages; `DEMO_THEMES` chips in empty state | ✓ |
| `src/app/api/themes/route.ts` | 422 → "No companies found for this theme. Try a broader search…"; 500 → "Unable to load theme data…" | ✓ |
| `vercel.json` | `framework: nextjs`; analyze/themes 60s, search/monitor 15s | ✓ |
| `src/app/layout.tsx` | Offline-safe font handling (build-time fix) | ✓ (noted) |
| `src/app/globals.css` | Local font fallback variables | ✓ (noted) |
| `src/lib/db.ts` | Turbopack ignore hints | ✓ (noted) |
| `next.config.ts` | Build-safe worker settings | ✓ (noted) |

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero warnings |
| `npm run build` | ✓ production build succeeds |
| All agents/analyzer/orchestrator/analyze-route unchanged | ✓ hashes match Phase 8 baseline |

## Deviations from Plan

- **`vercel.json` `maxDuration: 60` for `/api/analyze`**: Plan allowed for 300 (Pro). Implementation used 60 to stay Hobby-compatible. Note this at the demo: first-run complex companies (SpaceX, Anthropic) may timeout on Hobby; cached responses will be instant.
- **Four extra files modified** beyond the plan (`layout.tsx`, `globals.css`, `db.ts`, `next.config.ts`): all were build-time fixes required to make `npm run build` pass locally on Windows. None affect runtime logic.
- **`getDerivedStateFromError` not marked `override`**: Minor — the method works correctly; `override` is optional when the parent method exists.

## Next Step: Deploy

Follow PART 9 deployment steps in the plan section below. `vercel --prod` was not run.

---

## Overview

Final hardening pass before the Amakor Capital demo. Nine parts: Exa API alignment,
tab persistence, demo fixtures, error boundaries, error message polish, Vercel config,
build verification, demo UX, and deployment documentation.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/lib/datasources/exa-deep.ts` | Migrate from `exa.research.create` to `exa.search({ type:"deep" })` |
| `src/app/page.tsx` | Tab persistence + 429 detection + demo company chips |
| `src/lib/demo-names.ts` | New — DEMO_COMPANIES and DEMO_THEMES arrays |
| `src/components/ErrorBoundary.tsx` | New — React class error boundary |
| `src/app/api/themes/route.ts` | Error message polish |
| `src/components/ThemePanel.tsx` | Error message polish + demo theme starter chips |
| `vercel.json` | New — Vercel deployment config |

Files NOT touched: all agents, orchestrator, analyzer, all other route files, Report.tsx
panels, types.ts, confidence.ts, investment-memo.ts, claude-narrative.ts.

---

## PART 1 — Exa API Consistency Audit

### Finding

The two Exa-using files diverge:

| File | Method | Pattern |
|------|--------|---------|
| `src/lib/datasources/exa-deep.ts` | `exa.research.create()` + `exa.research.pollUntilFinished()` | Async polling job; extracts `output.parsed` |
| `src/lib/agents/theme-agent.ts` | `exa.search(query, { type: "deep", outputSchema })` | Direct synchronous call; extracts `output.content` |

`exa-deep.ts` uses the older async Research API (creates a job ID, polls until done, reads
`output.parsed`). `theme-agent.ts` uses the newer `search()` API confirmed working against
`exa-js@2.11.0`. The Research API's async polling is unnecessary complexity now that
`search({ type: "deep" })` is available.

### Action: migrate `exa-deep.ts` to `exa.search()`

#### Changes required

**Line 1** — add `DeepOutputSchema` to import:
```ts
// before
import Exa from "exa-js";
// after
import Exa, { type DeepOutputSchema } from "exa-js";
```

**Line 7** — tighten schema type:
```ts
// before
const EXA_OUTPUT_SCHEMA: Record<string, unknown> = {
// after
const EXA_OUTPUT_SCHEMA = {
  // ...unchanged properties...
} satisfies DeepOutputSchema;
```

**Add** `parseStructuredContent` helper after the existing normalizer functions
(identical to `parseStructuredThemeContent` in `theme-agent.ts`):
```ts
function parseStructuredContent(content: unknown): Record<string, unknown> | null {
  if (isRecord(content)) return content;
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
```

**Lines 134-178** — replace the research.create / pollUntilFinished block:
```ts
// BEFORE (lines 134–183 approximately):
const instructions = `Research the company "${query}"...`;
const created = await exa.research.create({ instructions, outputSchema: EXA_OUTPUT_SCHEMA });
const result = await exa.research.pollUntilFinished(created.researchId);
if (result.status !== "completed") { return { success: false, error: `exa research ...` }; }
const completedResult = result as { output: { content: string; parsed?: Record<string, unknown> } };
const parsed = completedResult.output.parsed ?? null;
if (parsed === null) { return { success: false, error: "exa output missing required fields" }; }

// AFTER:
const query_string = `Research the company "${query}". Provide a structured overview covering: `
  + `business model and current scale, estimated revenue, total funding raised, `
  + `last known valuation, founded year, headquarters, key investors, main competitors, `
  + `and recent notable news or developments.`;
const searchResult = await exa.search(query_string, {
  type: "deep",
  outputSchema: EXA_OUTPUT_SCHEMA,
});
const parsed = parseStructuredContent(searchResult.output?.content);
if (parsed === null) {
  console.error("[exa-deep] output missing or unparseable", { query });
  return { success: false, error: "exa output missing required fields" };
}
```

The rest of the function (normalizeExaDeepData call and return) is unchanged.

**Risk note**: `exa.research.create` is designed for deep multi-source research on a
single entity; `exa.search({ type: "deep" })` is neural search. Output quality should be
verified against the 4 test companies (SpaceX, Klarna, Deutsche Bank, Anthropic) after
migration. If output degrades, revert `exa-deep.ts` and keep the two files intentionally
diverged — document the reason in a code comment.

---

## PART 2 — Tab Persistence (`src/app/page.tsx`)

### What changes

1. Extract tab changes into a helper that writes to localStorage.
2. Add a `useEffect` to restore the tab from localStorage on mount.
3. Handle errors silently (private browsing, quota exceeded).

### Implementation

**After the existing state declarations** (around line 57), add a helper function:

```ts
// Read saved tab once on mount — inside useEffect only (SSR safe)
// Called at the bottom of the existing mount useEffect.
```

**Modify the existing mount `useEffect`** (currently lines 64–87) to add tab restore:

```ts
useEffect(() => {
  // tab restore (new)
  try {
    const saved = localStorage.getItem("fin:activeTab");
    if (saved === "company" || saved === "themes") {
      setActiveTab(saved);
    }
  } catch {
    // private browsing or storage unavailable — default "company" stays
  }

  // existing monitor load (unchanged)
  const loadMonitorItems = async (): Promise<void> => { ... };
  void loadMonitorItems();

  return () => { ... };
}, []);
```

**Add a `handleTabChange` function** (before `handleSearch`, around line 234):

```ts
const handleTabChange = (tab: ActiveTab): void => {
  setActiveTab(tab);
  try {
    localStorage.setItem("fin:activeTab", tab);
  } catch {
    // ignore
  }
};
```

**Replace all three `setActiveTab` call sites** with `handleTabChange`:
1. Company button `onClick` (line ~451): `handleTabChange("company")`
2. Themes button `onClick` (line ~466): `handleTabChange("themes")`
3. `handleThemeCompanySelect` (line 296): `handleTabChange("company")`

localStorage key: `"fin:activeTab"` (namespaced to avoid collision).

---

## PART 3 — Demo Names (`src/lib/demo-names.ts`)

New file, ~20 lines:

```ts
export const DEMO_COMPANIES = [
  "Apple",
  "Microsoft",
  "NVIDIA",
  "Tesla",
  "Deutsche Bank",
  "Klarna",
  "Stripe",
  "SpaceX",
  "Anthropic",
] as const;

export const DEMO_THEMES = [
  "EV charging infrastructure",
  "BNPL payments",
  "AI inference chips",
  "Generative AI enterprise",
  "Defense tech",
] as const;

export type DemoCompany = (typeof DEMO_COMPANIES)[number];
export type DemoTheme = (typeof DEMO_THEMES)[number];
```

**Pre-cache warming**: Skip. On Vercel every serverless invocation is stateless; pre-warm
logic on server startup would re-fire every cold start and exhaust API quota instantly.
The 24-hour SQLite/Turso cache already handles warm-up after first genuine requests.

---

## PART 4 — Error Boundaries (`src/components/ErrorBoundary.tsx`)

### New file

React class component — the only valid way to catch render errors. Must be `"use client"`.

```ts
"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
  readonly section?: string;
};

type State = { readonly hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static override getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.section ?? "unknown"}] render error`, {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            Something went wrong
            {this.props.section !== undefined ? ` in ${this.props.section}` : ""}.
            Refresh the page to retry.
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
```

### Where to wrap (`src/app/page.tsx`)

Import at the top:
```ts
import ErrorBoundary from "@/components/ErrorBoundary";
```

Wrap `<Report>` (around line 615):
```tsx
<ErrorBoundary section="Report">
  <Report isRefreshing={isAnalyzing} onRefresh={handleRefresh} report={report} />
</ErrorBoundary>
```

Wrap `<ThemePanel>` (around line 696):
```tsx
<ErrorBoundary section="ThemePanel">
  <ThemePanel onCompanySelect={handleThemeCompanySelect} />
</ErrorBoundary>
```

**Why not wrap InvestmentMemoPanel inside Report.tsx**: `Report.tsx` has no `"use client"`
directive. Adding a class-component import would require either converting Report.tsx to a
client component (large blast radius) or adding a separate "use client" wrapper file. For
the MVP demo the page-level boundary on `<Report>` is sufficient — if any panel inside
Report crashes it is caught at that level.

---

## PART 5 — Error Message Polish

### `src/app/api/themes/route.ts`

Line 31 — zero companies response:
```ts
// before
{ ok: false, error: "No data found for this theme" }
// after
{ ok: false, error: "No companies found for this theme. Try a broader search or check the spelling." }
```

Line 41 — unexpected error response:
```ts
// before
{ ok: false, error: "Theme service unavailable" }
// after
{ ok: false, error: "Unable to load theme data. Please try again or check your connection." }
```

### `src/components/ThemePanel.tsx`

Line ~199 — fetch catch block:
```ts
// before
setError("Theme exploration failed");
// after
setError("Theme exploration failed. Please try again.");
```

Line ~192 — non-ok response fallback:
```ts
// before
setError(data.error ?? "Theme exploration failed");
// after
setError(data.error ?? "Theme exploration failed. Please try again.");
```

Add 429 handling before the generic non-ok check (add after `response.json()` call):
```ts
if (response.status === 429) {
  setError("Hit rate limit. Please wait a minute and try again.");
  return;
}
if (response.status === 408 || response.status === 504) {
  setError("Request timed out. Exa Deep can take 15 seconds — please wait and retry.");
  return;
}
```

### `src/app/page.tsx` — 429 detection in `runAnalysis`

After line 196 (`const data = (await response.json()) as AnalyzeApiResponse;`), add:
```ts
if (response.status === 429) {
  if (requestId === latestAnalysisRequestRef.current) {
    setError("Hit rate limit. Please wait a minute and try again.");
  }
  return;
}
```

---

## PART 6 — Vercel Configuration (`vercel.json`)

New file at project root:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "functions": {
    "src/app/api/analyze/route.ts": { "maxDuration": 300 },
    "src/app/api/themes/route.ts": { "maxDuration": 60 },
    "src/app/api/search/route.ts": { "maxDuration": 15 },
    "src/app/api/monitor/route.ts": { "maxDuration": 15 }
  }
}
```

**Important**: `maxDuration: 300` requires Vercel Pro plan. On Hobby (free), max is 60
seconds. Set `maxDuration: 60` for `/api/analyze` if deploying on Hobby; some analysis
runs will timeout. Document this in the deployment steps.

### Required environment variables in Vercel dashboard

Set ALL of these in Project Settings → Environment Variables:

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API for memo generation |
| `FINNHUB_API_KEY` | Yes | Market data |
| `FMP_API_KEY` | Optional | Historical multiples, peer data |
| `COMPANIES_HOUSE_API_KEY` | Yes | UK registry |
| `EXA_API_KEY` | Yes | Private company deep research + themes |
| `SEC_EDGAR_USER_AGENT` | Yes | Format: `"AppName email@domain.com"` |
| `TURSO_DATABASE_URL` | Yes (Vercel) | libsql://xxx.turso.io — free tier is enough |
| `TURSO_AUTH_TOKEN` | Yes (Vercel) | Turso auth token |
| `DATABASE_URL` | No (Vercel) | Only for local dev; Turso takes priority |

**Database on Vercel**: `db.ts` auto-detects Vercel (`process.env.VERCEL === "1"`) and
avoids local SQLite. When `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set, it uses
Turso. Without those, it falls back to in-memory (monitor list and cache lost on each cold
start — acceptable for demo but not ideal). Set up a free Turso database before deploying.

**To create a Turso database**:
```sh
npx turso db create finance-intelligence
npx turso db tokens create finance-intelligence
```

---

## PART 7 — Build Verification

Run these checks locally before deploying. All must pass.

```sh
# 1. TypeScript
npx tsc --noEmit

# 2. Lint
npm run lint

# 3. Production build
npm run build
# Expect: no errors, no "use client" warnings
# Watch for: any component importing server-only modules

# 4. Smoke test the build locally
npm run start
# Hit http://localhost:3000 and run one analysis
```

**Known risks to check during build**:
- `ErrorBoundary.tsx` is `"use client"` + class component — React class components are
  valid with `"use client"` in Next.js App Router.
- `exa-deep.ts` migration: if `exa.search()` with `type: "deep"` and `satisfies DeepOutputSchema`
  causes a TypeScript error, cast the schema as `DeepOutputSchema` explicitly.
- `demo-names.ts` imports in `page.tsx` and `ThemePanel.tsx`: ensure these are only
  imported in client components (both are `"use client"` — no issue).
- Prisma: `prisma generate` is NOT needed at build time. `db.ts` imports directly from
  `@libsql/client`, not from `@prisma/client`. The Prisma schema is documentation only.
- `execFileSync` in `db.ts` (sqlite mode): not called in Vercel runtime because
  `SHOULD_AVOID_LOCAL_SQLITE` is true. No Node.js binary access issues.

---

## PART 8 — Demo-Ready UX Polish

### A. Demo company chips in `src/app/page.tsx`

Import `DEMO_COMPANIES`:
```ts
import { DEMO_COMPANIES } from "@/lib/demo-names";
```

In the empty state `!hasReport` hero section, **replace the existing status chips row**
(currently at lines 503–517) with demo name chips when query is empty:

```tsx
<div className="mt-4 flex flex-wrap items-center gap-2">
  {query.trim().length === 0 && !isAnalyzing ? (
    <>
      <span className="text-xs uppercase tracking-[0.18em] text-zinc-600 mr-1">Try:</span>
      {DEMO_COMPANIES.map((name) => (
        <button
          className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-zinc-400 transition hover:border-emerald-400/25 hover:text-emerald-200"
          key={name}
          onClick={() => {
            setQuery(name);
            void runAnalysis(name);
          }}
          type="button"
        >
          {name}
        </button>
      ))}
    </>
  ) : (
    // existing status chips (debounced search / candidate count / searching indicator)
    <>
      <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
        Debounced live search
      </span>
      ...
    </>
  )}
</div>
```

### B. Demo theme starter chips in `src/components/ThemePanel.tsx`

Import `DEMO_THEMES`:
```ts
import { DEMO_THEMES } from "@/lib/demo-names";
```

In the "No Theme Loaded" empty state section (currently at line ~415), add starter chips
below the descriptive paragraph:

```tsx
<div className="mt-6 flex flex-wrap gap-2">
  <span className="w-full text-xs uppercase tracking-[0.18em] text-zinc-600">Try a starter theme:</span>
  {DEMO_THEMES.map((theme) => (
    <button
      className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-zinc-400 transition hover:border-emerald-400/25 hover:text-emerald-200"
      disabled={isLoading}
      key={theme}
      onClick={() => {
        setThemeQuery(theme);
        void handleExplore(theme);
      }}
      type="button"
    >
      {theme}
    </button>
  ))}
</div>
```

### C. Existing brand label check

`page.tsx` line 480 already has `"Financial Intelligence"` as a section label. No new
branding element is needed. The hero heading ("Source-backed company analysis for fast
diligence.") is clear and professional.

---

## PART 9 — Deployment Steps (Manual)

Document here; do NOT execute automatically.

```sh
# 0. Prerequisites
# - Vercel CLI installed: npm install -g vercel
# - Turso CLI installed: npm install -g turso
# - All env vars collected

# 1. Create Turso database
npx turso db create finance-intelligence
npx turso db show finance-intelligence   # note the URL
npx turso db tokens create finance-intelligence  # note the token

# 2. Local build verification
npm run build          # must succeed with zero errors

# 3. Deploy to Vercel
vercel --prod          # first run: follow prompts to link project

# 4. Add environment variables
# Use Vercel dashboard: Project → Settings → Environment Variables
# Add all variables from PART 6 table above

# 5. Re-deploy after adding env vars
vercel --prod

# 6. Post-deploy smoke tests
# Open: https://<your-deployment>.vercel.app
# Test Company tab: search "Apple" → analysis should complete
# Test Company tab: search "Klarna" → private company analysis
# Test Themes tab: enter "AI inference chips" → exposure map
# Test click-through: click NVIDIA in theme results → Company tab fires

# 7. Record production URL
# Add to this file under "Production URL" heading below
```

### Required Vercel plan note

The `/api/analyze` route can take up to 3 minutes for multi-source private companies.
`maxDuration: 300` in `vercel.json` requires **Vercel Pro** ($20/month).

On Hobby tier: set `maxDuration: 60` and warn the demo client that complex analyses
(SpaceX, Anthropic, Klarna) will time out; cached results on subsequent requests will
be fast.

### Production URL

*(To be filled in after deployment)*

---

## Implementation Order

1. **PART 3** — Create `demo-names.ts` (no dependencies, no risk)
2. **PART 4** — Create `ErrorBoundary.tsx` (no dependencies)
3. **PART 1** — Migrate `exa-deep.ts` to `exa.search()`; test with SpaceX + Klarna
4. **PART 2** — Tab persistence in `page.tsx`
5. **PART 5** — Error message polish in route + ThemePanel + page.tsx
6. **PART 6** — Create `vercel.json`
7. **PART 8** — Add demo chips to `page.tsx` + `ThemePanel.tsx`
8. **PART 7** — `npx tsc --noEmit` + `npm run lint` + `npm run build`
9. **PART 9** — Manual deployment

---

# Phase 8: Thematic Intelligence MVP — Plan

## Status

Implementation reviewed and confirmed correct. Ready for browser testing.

---

## Completion Summary

### Files Changed

| File | Change | Actual lines |
|------|--------|--------------|
| `src/lib/types.ts` | Added `ThemeCompany`, `ThemeResult`, `ThemeApiResponse` after `ExaDeepData` (lines 813–834) | +22 lines |
| `src/lib/agents/theme-agent.ts` | New Exa Deep theme agent using `exa.search()` with `type: “deep”`, `DeepOutputSchema` constraint, and structured `output.content` parsing | 262 |
| `src/app/api/themes/route.ts` | POST route with 400/422/500 error handling | 45 |
| `src/components/ThemePanel.tsx` | Client component: loading/error/results states, exposure bars, related-theme reruns, company click-through | 433 |
| `src/app/page.tsx` | Tab state (`ActiveTab`), tab strip with `role=”tablist”`, ThemePanel mount, `handleThemeCompanySelect` | net +55 lines |
| `src/components/SearchBar.tsx` | Added optional `value` prop for controlled mode (theme handoff) | 85 |

### Verification

| Check | Result |
|-------|--------|
| `cmd /c npx tsc --noEmit` | ✓ zero errors |
| `cmd /c npm run lint` | ✓ zero warnings |
| `ThemeCompany`, `ThemeResult`, `ThemeApiResponse` in types.ts after `ExaDeepData` | ✓ lines 813–834 |
| Theme agent: `exa.search()` with `type: “deep”`, `satisfies DeepOutputSchema` | ✓ exa-js@2.11.0 |
| Theme agent: `normalizeExposureScore` clamps to [0, 100] | ✓ |
| Theme agent: companies sorted desc by exposureScore, sliced to 10 | ✓ |
| Theme agent: never throws — returns `emptyThemeResult` on all failure paths | ✓ |
| Theme agent: `output.content` parsed via `parseStructuredThemeContent` (handles object or JSON string) | ✓ |
| Theme agent: grounding logged at debug level only, not surfaced in API response | ✓ |
| API route: 400 empty theme, 400 >500 chars, 422 zero companies+empty desc, 500 unexpected | ✓ |
| ThemePanel: “use client” directive, `onCompanySelect` prop | ✓ |
| ThemePanel: loading spinner + 3s cycling messages | ✓ |
| ThemePanel: exposure bar colors emerald ≥80, amber ≥60, zinc <60 | ✓ |
| ThemePanel: company name click calls `onCompanySelect` | ✓ |
| ThemePanel: related theme click sets query + re-runs `handleExplore` | ✓ |
| page.tsx: `activeTab` state (`”company” \| “themes”`), tab strip above main content | ✓ |
| page.tsx: `handleThemeCompanySelect` — switches tab, sets query, calls `runAnalysis` | ✓ line 295 |
| page.tsx: Company tab contains all existing layout including sidebar | ✓ |
| page.tsx: Themes tab renders `<ThemePanel>` only (sidebar not shown) | ✓ |
| SearchBar: optional controlled `value` prop, falls back to `defaultValue` when omitted | ✓ |
| All protected files unchanged | ✓ hashes verified (analyzer, orchestrator, all 5 agents, exa-deep, investment-memo, claude-narrative, analyze route) |

### Deviations from Plan

- **`theme-agent.ts` uses `exa.search()` not `exa.research.create()`**: The installed
  `exa-js@2.11.0` exposes `exa.search(query, { type: “deep”, outputSchema })` directly.
  The plan's primary recommendation was `research.create` with the note to verify the
  SDK version first. Implementation correctly used the available API.
- **`ThemePanel.tsx` is 433 lines vs ~220 estimated**: The extra lines come from the two
  sub-components (`SectionCard`, `CompanyCard`) inlined in the same file for cohesion.
  Within the 800-line cap.
- **`src/components/SearchBar.tsx` modified (not in plan)**: Added optional controlled
  `value` prop. Required to make the theme-to-company handoff reliably populate the
  search input after tab switching. Backward-compatible (prop is optional; existing calls
  without `value` continue to use `defaultValue` / uncontrolled mode).

### Unchanged Files (hash-verified)

`src/lib/analyzer.ts`, `src/lib/agents/orchestrator.ts`, `src/lib/agents/entity-agent.ts`,
`src/lib/agents/market-data-agent.ts`, `src/lib/agents/validation-agent.ts`,
`src/lib/agents/memo-agent.ts`, `src/lib/agents/challenger-agent.ts`,
`src/lib/datasources/exa-deep.ts`, `src/lib/investment-memo.ts`,
`src/lib/claude-narrative.ts`, `src/app/api/analyze/route.ts`.

## Overview

Adds a "Themes" tab alongside the existing "Company" search. User types a thematic
description (e.g. "EV charging infrastructure"); Exa Deep researches the theme and returns
5-10 companies with exposure scores, rationale, key drivers, headwinds, and related themes.
Clicking a company in the theme results hands off to the existing Company analysis flow.

This is Amakor's differentiating feature: theme-to-company mapping at PE scale using
Exa's structured deep research.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `ThemeCompany`, `ThemeResult`, `ThemeApiResponse` |
| `src/lib/agents/theme-agent.ts` | New agent — Exa research for theme exploration |
| `src/app/api/themes/route.ts` | New POST route |
| `src/components/ThemePanel.tsx` | New client component |
| `src/app/page.tsx` | Add tab state + ThemePanel integration |

Files NOT touched: all existing agents, datasources, analyzer, report components,
route.ts for analyze/search/monitor.

---

## PART 1 — Types (`src/lib/types.ts`)

Add after `ExaDeepData`:

```ts
export type ThemeCompany = {
  readonly companyName: string;
  readonly ticker: string | null;
  readonly exposureScore: number;   // 0–100, clamped during normalization
  readonly rationale: string;
};

export type ThemeResult = {
  readonly themeName: string;
  readonly themeDescription: string;
  readonly companies: readonly ThemeCompany[];
  readonly keyDrivers: readonly string[];
  readonly headwinds: readonly string[];
  readonly relatedThemes: readonly string[];
  readonly queryTimeMs: number;
};

export type ThemeApiResponse = {
  readonly ok: boolean;
  readonly result?: ThemeResult;
  readonly error?: string;
};
```

`ThemeCompany.exposureScore` is clamped to `[0, 100]` by `normalizeExposureScore` in the
agent — never trust raw LLM output for numeric bounds.

---

## PART 2 — Theme Agent (`src/lib/agents/theme-agent.ts`)

### API approach

The existing `exa-deep.ts` uses `exa.research.create` + `pollUntilFinished` with an
`outputSchema` for structured output. The theme agent follows the same pattern, but with
instructions and a schema that targets a **theme** rather than a single company.

**Important**: The requirements mention `exa.search()` with `type: "deep"`. The existing
code uses `exa.research.create` (no such `.search()` call exists in `exa-deep.ts`). During
implementation, verify the installed `exa-js` version and which method is available. If
`exa.research.create` supports the `numResults` and `category` options described in the
requirements, use them. Otherwise, follow the `research.create` + `pollUntilFinished`
pattern exactly as `exa-deep.ts` does, relying on the `instructions` field to scope the
research to theme-driven company discovery.

### Output schema (6 top-level properties, companies nested at depth 2)

```ts
const THEME_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    themeName: {
      type: "string",
      description: "Concise canonical name for the investment theme, e.g. 'EV Charging Infrastructure'.",
    },
    themeDescription: {
      type: "string",
      description: "2-3 sentence explanation of what the theme is and why it matters.",
    },
    companies: {
      type: "array",
      description: "5–10 companies with meaningful exposure to this theme, ranked by exposure score descending.",
      items: {
        type: "object",
        properties: {
          companyName: { type: "string", description: "Canonical company name." },
          ticker:      { type: ["string", "null"], description: "Stock ticker if publicly listed, else null." },
          exposureScore: { type: "number", description: "0-100 score representing depth of exposure to this theme." },
          rationale:   { type: "string", description: "1-2 sentence explanation of why this company has exposure." },
        },
        required: ["companyName", "ticker", "exposureScore", "rationale"],
      },
    },
    keyDrivers: {
      type: "array",
      items: { type: "string" },
      description: "3-5 structural factors accelerating this theme.",
    },
    headwinds: {
      type: "array",
      items: { type: "string" },
      description: "3-5 risks or obstacles to the theme.",
    },
    relatedThemes: {
      type: "array",
      items: { type: "string" },
      description: "3-5 adjacent or overlapping investment themes.",
    },
  },
  required: ["themeName", "themeDescription", "companies", "keyDrivers", "headwinds", "relatedThemes"],
};
```

### Research instructions template

```ts
const instructions = `
Research the investment theme: "${theme}".

Identify 5–10 companies with meaningful exposure to this theme. For each company, assess
how central this theme is to their business model and revenue streams (exposureScore 0–100).
Also identify the structural drivers accelerating the theme, the key risks and headwinds,
and 3–5 related adjacent themes that investors should explore alongside this one.

Focus on companies where this theme accounts for at least 20% of revenue or strategic
positioning. Include both public companies (with tickers) and major private players.
`.trim();
```

### Normalization

```ts
function normalizeExposureScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function normalizeThemeCompany(value: unknown): ThemeCompany | null {
  if (!isRecord(value)) return null;
  const companyName = normalizeRequiredString(value["companyName"]);
  const rationale   = normalizeRequiredString(value["rationale"]);
  if (companyName === null || rationale === null) return null;
  return {
    companyName,
    ticker: normalizeNullableString(value["ticker"]),
    exposureScore: normalizeExposureScore(value["exposureScore"]),
    rationale,
  };
}

function normalizeThemeResult(value: unknown, queryTimeMs: number): ThemeResult | null {
  if (!isRecord(value)) return null;
  const themeName        = normalizeRequiredString(value["themeName"]);
  const themeDescription = normalizeRequiredString(value["themeDescription"]);
  if (themeName === null || themeDescription === null) return null;

  const rawCompanies = Array.isArray(value["companies"]) ? value["companies"] : [];
  const companies = rawCompanies
    .map(normalizeThemeCompany)
    .filter((c): c is ThemeCompany => c !== null)
    .sort((a, b) => b.exposureScore - a.exposureScore)  // highest exposure first
    .slice(0, 10);

  return {
    themeName,
    themeDescription,
    companies,
    keyDrivers:    normalizeStringArray(value["keyDrivers"]),
    headwinds:     normalizeStringArray(value["headwinds"]),
    relatedThemes: normalizeStringArray(value["relatedThemes"]),
    queryTimeMs,
  };
}
```

### Empty fallback

```ts
function emptyThemeResult(theme: string, queryTimeMs: number): ThemeResult {
  return {
    themeName: theme,
    themeDescription: "",
    companies: [],
    keyDrivers: [],
    headwinds: [],
    relatedThemes: [],
    queryTimeMs,
  };
}
```

### Export signature

```ts
export async function exploreTheme(theme: string): Promise<ThemeResult>
// never throws; returns emptyThemeResult on any failure
```

### Flow

```
1. Record t0 = Date.now()
2. Build instructions string
3. exa.research.create({ instructions, outputSchema: THEME_OUTPUT_SCHEMA })
4. exa.research.pollUntilFinished(researchId)
5. If status !== "completed" → return emptyThemeResult
6. Extract result.output.parsed
7. normalizeThemeResult(parsed, Date.now() - t0) ?? emptyThemeResult
```

The `result.output.grounding` field (if present in the SDK version) provides citation
metadata. Access it as `(result as { output: { grounding?: unknown } }).output.grounding`
and log it at debug level — do NOT expose it in the API response for the MVP.

---

## PART 3 — API Route (`src/app/api/themes/route.ts`)

```ts
export async function POST(request: NextRequest): Promise<NextResponse<ThemeApiResponse>> {
  // 1. Parse body
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const theme = typeof body.theme === "string" ? body.theme.trim() : "";

  // 2. Validate
  if (theme.length === 0) {
    return NextResponse.json({ ok: false, error: "theme is required" }, { status: 400 });
  }
  if (theme.length > 500) {
    return NextResponse.json({ ok: false, error: "theme must be under 500 characters" }, { status: 400 });
  }

  // 3. Call agent
  try {
    const result = await exploreTheme(theme);
    if (result.companies.length === 0 && result.themeDescription.length === 0) {
      return NextResponse.json({ ok: false, error: "No data found for this theme" }, { status: 422 });
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[themes] route error", { theme, error });
    return NextResponse.json({ ok: false, error: "Theme service unavailable" }, { status: 500 });
  }
}
```

Note: `exploreTheme` never throws (returns empty result on failure), so the outer
try/catch is a belt-and-suspenders guard for unexpected errors only.

---

## PART 4 — ThemePanel Component (`src/components/ThemePanel.tsx`)

### Props

```ts
type ThemePanelProps = {
  readonly onCompanySelect: (companyName: string) => void;
};
```

### State

```ts
const [themeQuery, setThemeQuery] = useState("");
const [result, setResult]         = useState<ThemeResult | null>(null);
const [isLoading, setIsLoading]   = useState(false);
const [error, setError]           = useState<string | null>(null);
```

### Structure

```
ThemePanel
  ├── Input row
  │     ├── <input> placeholder="Describe an investment theme..."
  │     └── <button> "Explore" (disabled while loading)
  ├── Loading state (isLoading)
  │     └── spinner + "Exploring theme with Exa Deep — this takes 5–15 seconds"
  ├── Error state
  │     └── rose banner with error message
  └── Results (result !== null)
        ├── Theme header
        │     ├── themeName (large heading)
        │     └── themeDescription (muted paragraph)
        ├── Companies list (sorted by exposureScore desc)
        │     └── per company:
        │           ├── companyName (clickable button → onCompanySelect)
        │           ├── ticker badge (if not null)
        │           ├── exposure bar (width = exposureScore%, colored by tier)
        │           ├── score label (e.g. "82 / 100")
        │           └── rationale (muted text)
        ├── Key drivers section
        │     └── chips or bullet list
        ├── Headwinds section
        │     └── chips or bullet list (rose-tinted)
        └── Related themes section
              └── clickable chips → re-run explore with that theme
```

### Exposure bar coloring

```ts
function exposureTone(score: number): string {
  if (score >= 80) return "bg-emerald-400";
  if (score >= 60) return "bg-amber-400";
  return "bg-zinc-500";
}
```

### Company click

```ts
<button onClick={() => onCompanySelect(company.companyName)}>
  {company.companyName}
</button>
```

No routing change — parent (`page.tsx`) handles the tab switch and analysis trigger.

### Related theme click

```ts
<button onClick={() => { setThemeQuery(theme); void handleExplore(theme); }}>
  {theme}
</button>
```

Updates the input field and re-runs exploration in a single action.

### Loading message

Use a 3-stage cycling message (not timing-dependent, just aesthetic):
- Stage 0: "Researching companies with exposure to this theme..."
- Stage 1: "Scoring exposure and gathering rationale..."
- Stage 2: "Assembling theme intelligence..."

Cycle via `setInterval(3000)` while `isLoading`.

---

## PART 5 — Page Integration (`src/app/page.tsx`)

### New state

```ts
type ActiveTab = "company" | "themes";
const [activeTab, setActiveTab] = useState<ActiveTab>("company");
```

### Tab navigation (added above the main content grid)

Minimal tab strip:
```tsx
<div className="flex gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-1 w-fit">
  <button
    className={activeTab === "company" ? "... active styles ..." : "... inactive styles ..."}
    onClick={() => setActiveTab("company")}
  >
    Company
  </button>
  <button
    className={activeTab === "themes" ? "..." : "..."}
    onClick={() => setActiveTab("themes")}
  >
    Themes
  </button>
</div>
```

Active tab: `bg-zinc-800 text-zinc-100 rounded-xl`
Inactive tab: `text-zinc-500 hover:text-zinc-300`

### Content switching

```tsx
{activeTab === "company" ? (
  // existing hero/report area — UNCHANGED
  <section className="...">...</section>
) : (
  <ThemePanel onCompanySelect={handleThemeCompanySelect} />
)}
```

The existing `section className="grid gap-8 ..."` (report + sidebar) remains inside
`activeTab === "company"` — sidebar (MonitorList, ActiveSnapshotPanel) is company-tab-only
because it shows company-specific data.

### handleThemeCompanySelect

```ts
const handleThemeCompanySelect = (companyName: string): void => {
  setActiveTab("company");
  setQuery(companyName);
  setError(null);
  void runAnalysis(companyName);
};
```

This is the only new function needed. The rest of `runAnalysis`, `handleSearch`,
`handleSelect` etc. are untouched.

### Tab persistence note

Active tab is not persisted to localStorage for the MVP. Refreshing returns to "Company".

---

## Error Handling Summary

| Location | Error | Response |
|---|---|---|
| `exploreTheme` (no API key) | logs, returns `emptyThemeResult` | UI shows "Theme service unavailable" |
| `exploreTheme` (network/poll fail) | logs, returns `emptyThemeResult` | UI shows "Theme service unavailable" |
| `/api/themes` (empty theme) | 400 | `{ ok: false, error: "theme is required" }` |
| `/api/themes` (too long) | 400 | `{ ok: false, error: "theme must be under 500 characters" }` |
| `/api/themes` (zero companies) | 422 | `{ ok: false, error: "No data found for this theme" }` |
| `ThemePanel` (fetch error) | local state | rose banner with message |
| `ThemePanel` (0 companies in result) | local state | "No companies found for this theme" |

---

## Test Cases

| Theme | Expect (min) |
|---|---|
| "EV charging infrastructure" | ChargePoint (CHPT), EVgo (EVGO), Blink (BLNK), Tesla (TSLA) |
| "BNPL payments" | Affirm (AFRM), Klarna, PayPal (PYPL), Block (SQ) |
| "AI inference chips" | NVIDIA (NVDA), AMD, Cerebras, Groq |
| "Dark stores urban logistics" | Gorillas, Getir, GoPuff, DoorDash (DASH), Instacart (CART) |

**Verification steps after implementation**:
1. `npx tsc --noEmit` — zero errors
2. `npm run lint` — zero warnings
3. `curl -X POST http://localhost:3000/api/themes -H "Content-Type: application/json" -d '{"theme":"EV charging infrastructure"}'`
   — response has `ok: true`, `result.companies` array with 3+ entries, each with `exposureScore > 0`
4. Browser: open Themes tab, type "BNPL payments", click Explore
   — loading spinner appears, results render with exposure bars
5. Browser: click a company in theme results
   — tab switches to Company, search bar populates, analysis begins
6. Browser: click a related theme chip
   — input updates, new exploration runs
7. Edge case: type a nonsense theme like "xkcd9q8w"
   — should show "No data found for this theme" or "Theme service unavailable" gracefully

---

## Line Budget

| File | Estimated lines |
|---|---|
| `types.ts` (additions only) | +25 |
| `theme-agent.ts` | ~160 |
| `api/themes/route.ts` | ~45 |
| `ThemePanel.tsx` | ~220 |
| `page.tsx` (modifications) | +40 net |

All within caps. ThemePanel is the largest new component but well under 800.

---

## Implementation Order

1. Add `ThemeCompany`, `ThemeResult`, `ThemeApiResponse` to `types.ts`
2. Create `theme-agent.ts` — verify exa-js API, implement schema + flow
3. Create `api/themes/route.ts`
4. Create `ThemePanel.tsx`
5. Update `page.tsx` — tab state + ThemePanel mount + `handleThemeCompanySelect`
6. `npx tsc --noEmit` — must pass
7. `npm run lint` — must pass
8. Test all 4 theme cases via curl
9. Browser test: full click-through flow

---

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

## Round 5 - Companies House Contamination Fix

- `src/lib/agents/market-data-agent.ts`: replaced the old Finnhub-only Companies House skip check with a decision gate that waits for SEC EDGAR before deciding. Explicit UK signals now allow Companies House (`.L`/LSE-AIM-ISE, UK suffixes, `KNOWN_UK_COMPANIES`), while strong US evidence skips it with structured logging such as `reason: "us_listed_with_sec_data"`.
- `src/lib/company-search.ts`: added `KNOWN_UK_COMPANIES`, `isKnownUkCompanyQuery()`, and `hasUkCompanyNameSuffix()` so the waterfall can distinguish genuine UK names like `Greggs`, `Shell`, and `Revolut` from US-listed common-name collisions.
- `src/lib/agents/validation-agent.ts` and `src/lib/types.ts`: added a structured `likely_wrong_entity` validation flag when SEC and Companies House resolve to different names below the 70-point fuzzy-match threshold. The resulting high-severity tension is `Companies House and SEC reference different entities`.
- `src/lib/investment-memo.ts` and `src/lib/agents/memo-agent.ts`: `whyNow` now ignores Companies House-derived signals and filing markers when that `likely_wrong_entity` flag is present, and falls back to SEC filing, earnings, and analyst-coverage reasons instead. The same guard also suppresses contaminated UK filing dates in catalysts and verified facts.

## Sprint A — Round 5 + Phase 10 Review (2026-04-19)

### Companies House Contamination Fix — Verified ✓

| Check | Status |
|-------|--------|
| `resolveCompaniesHouseDecision` gate present in `market-data-agent.ts` | ✓ |
| Checks: `isKnownUkCompanyQuery`, `hasUkListingSignal`, `hasExplicitUkNameSignal` | ✓ |
| Skips if: `hasValidSecFilings`, `shouldSkipCompaniesHouseLookup`, US exchange indicator | ✓ |
| `KNOWN_UK_COMPANIES` (30 entries: Greggs, Boohoo, ASOS, Shell, BP, HSBC Holdings, Barclays, Darktrace, Revolut, Monzo, Wise, etc.) | ✓ |
| `isKnownUkCompanyQuery` and `hasUkCompanyNameSuffix` exported from `company-search.ts` | ✓ |
| `runSecCompaniesHouseEntityCheck` flags `likely_wrong_entity` when name match < 70 pts | ✓ |
| `shouldIgnoreCompaniesHouseRegistryData` guards `buildWhyNow`, `buildCatalystsToMonitor`, `buildVerifiedFacts` in `investment-memo.ts` | ✓ |
| `console.info '[market-data-agent] Companies House skipped'` with structured reason | ✓ |

### Mandate-Aware Challenger — Verified ✓

| Check | Status |
|-------|--------|
| `src/lib/amakor-mandate.ts` exists; exports `AMAKOR_MANDATE_CONTEXT` with deal size (25–200M), revenue threshold (50M+), Meta Trends filter, red flags, portfolio examples, sourcing preference | ✓ |
| `challenger-agent.ts` imports `AMAKOR_MANDATE_CONTEXT`; `SYSTEM_PROMPT` names "Amakor Capital" and injects full mandate | ✓ |
| Severity calibration: red-flag conflict → HIGH, unverified revenue → HIGH, missing Meta Trend → HIGH | ✓ |
| Counter-scenario must include one where mandate filter causes Amakor to pass | ✓ (in system prompt) |
| `MAX_TOKENS = 2000`, JSON repair logic, `emptyChallengerReport()` fallback — all preserved | ✓ |
| `InvestmentMemoPanel.tsx` footer `"Stress-tested against Amakor investment mandate"` shown only when `hasStressTestContent` | ✓ |
| Footer styled `text-xs italic text-zinc-500` | ✓ |

### Build Checks

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero warnings |
| `npm run build` | ✓ production build succeeds (10.4s compile) |

### Functional Tests

Curl tests against running dev server still needed in Antigravity (sandbox blocks outbound calls). Expected behavior when live:
- `Kai` → `Why Now` does NOT mention UK Companies House (SEC/Finnhub will gate CH out)
- `Apple` → `stressTest` references hardware red flag, revenue scale, deal-size mismatch

### Status: Ready for Antigravity

## Phase 10 - Mandate-Aware Challenger

- Added [`src/lib/amakor-mandate.ts`](/C:/Users/USER/Desktop/finance_intelligence/src/lib/amakor-mandate.ts) with the Amakor Capital mandate context.
- Updated [`src/lib/agents/challenger-agent.ts`](/C:/Users/USER/Desktop/finance_intelligence/src/lib/agents/challenger-agent.ts) so the system prompt now stress-tests memos against Amakor-specific filters: deal size, revenue threshold, Meta Trend fit, moat quality, sourcing path, and explicit red flags. JSON schema hardening, `MAX_TOKENS = 2000`, and empty fallback behavior were preserved unchanged.
- Updated [`src/components/InvestmentMemoPanel.tsx`](/C:/Users/USER/Desktop/finance_intelligence/src/components/InvestmentMemoPanel.tsx) to show `Stress-tested against Amakor investment mandate` only when the stress-test section has real content.
- Verification completed locally: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all passed. The built app also served locally on port `3100`, and `/api/analyze` returned JSON for `Kai` and `Apple`, but outbound market-data and Anthropic calls are blocked in this sandbox so those runs degraded to thin fallback reports instead of exercising live SEC/Finnhub/Companies House and mandate-aware challenger behavior. The intended `Kai`, `Apple`, `Greggs`, `Revolut`, and `SpaceX` source-backed endpoint checks still need to be run by the user or in Antigravity.

## Phase 11 - UI/UX Polish

- Updated [`src/components/Report.tsx`](/C:/Users/USER/Desktop/finance_intelligence/src/components/Report.tsx) with a premium company hero, recommendation and conviction pills, confidence star row, stronger supporting-evidence presentation, custom metric cards, and interactive source-attribution chips with freshness tooltips.
- Updated [`src/components/InvestmentMemoPanel.tsx`](/C:/Users/USER/Desktop/finance_intelligence/src/components/InvestmentMemoPanel.tsx) to split thesis, timing, valuation, upside, downside, monitoring, risks, and stress test into distinct premium cards with consistent dark-theme spacing, semantic accents, severity badges, and the Amakor mandate footer treatment.
- Updated [`src/components/ThemePanel.tsx`](/C:/Users/USER/Desktop/finance_intelligence/src/components/ThemePanel.tsx) with a stronger theme header, exposure-map cards, driver and headwind pill layouts, related-theme actions, and skeleton-based loading states with cycling copy.
- Updated [`src/components/SearchBar.tsx`](/C:/Users/USER/Desktop/finance_intelligence/src/components/SearchBar.tsx), [`src/components/MonitorList.tsx`](/C:/Users/USER/Desktop/finance_intelligence/src/components/MonitorList.tsx), and [`src/components/ActiveSnapshotPanel.tsx`](/C:/Users/USER/Desktop/finance_intelligence/src/components/ActiveSnapshotPanel.tsx) for clearer focus states, live-search feedback, compact watchlist cards, coverage progress, and cleaner sidebar status density.
- Updated [`src/app/page.tsx`](/C:/Users/USER/Desktop/finance_intelligence/src/app/page.tsx) for cleaner Company/Themes tabs, improved search dropdown styling, richer empty states, demo chip polish, and the new sidebar prop wiring.
- Updated [`src/app/globals.css`](/C:/Users/USER/Desktop/finance_intelligence/src/app/globals.css) with shared focus-ring, hover-lift, fade/drop animation, and interaction utility classes to keep the polish consistent across the touched components.
- Verification completed locally: `cmd /c npx tsc --noEmit`, `cmd /c npm run lint`, and `cmd /c npm run build` all passed. `cmd /c npm run start` also booted successfully on port `3100`. `npm run dev` is blocked in this sandbox with `spawn EPERM`, and no browser automation tool is available here, so the required visual checks for Apple, SpaceX, EV charging themes, empty states, tab transitions, and 375px mobile still need to be done by the user in a normal local browser session before deployment.
