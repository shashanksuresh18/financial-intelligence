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
