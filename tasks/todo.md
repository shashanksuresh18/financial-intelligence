# Financial Intelligence — Task Tracker

## Phase 1: Build

- [x] Step 1: Project scaffold (verify: tsc passes, dev server starts)
- [x] Step 2: Types and interfaces
- [x] Step 3: Finnhub client (verify: call AAPL, log response)
- [x] Step 4: SEC EDGAR client (verify: call Apple CIK, log financials)
- [x] Step 5: Companies House client (verify: search Revolut, log response)
- [x] Step 6: GLEIF client (verify: search Deutsche Bank, log response)
- [x] Step 7: Claude fallback client (verify: research SpaceX, log JSON)
- [x] Step 8: Confidence rating logic
- [x] Step 9: Waterfall analyzer (verify: test all 4 companies)
- [ ] Step 10: Claude narrative generation (verify: Apple report uses real SEC numbers)
- [ ] Step 11: API routes + Prisma schema (verify: curl each endpoint)
- [ ] Step 12: Frontend dashboard (verify: browser test full flow)
- [ ] Step 13: Final simplification pass

## Step 10 Plan — `src/lib/claude-narrative.ts`

### Overview

Replace the stub. Calls Claude API with the `web_search_20250305` built-in tool to
research companies that have no data from any other source. Returns
`ApiResult<ClaudeFallbackResult>`. This is the last-resort path — only called when
Finnhub, SEC EDGAR, Companies House, and GLEIF all fail.

Claude is the **data source** here, not the synthesis layer (that is Step 10).
The distinction: Step 7 uses web search to *find facts*. Step 10 *interprets* structured
facts already in hand.

---

### Environment variable

**`ANTHROPIC_API_KEY`**
- The Anthropic SDK reads this automatically; no manual header construction needed.
- Server-side only.
- If unset, the SDK throws at construction time → catch in `fetchClaudeFallbackData`.

---

### Module-level constants (not exported)

```typescript
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;
const DISCLAIMER =
  "Data sourced via AI web search. Figures may be incomplete or outdated. " +
  "Verify against primary sources before acting on this information.";
```

---

### Imports

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ApiResult, ClaudeFallbackResult, FinancialMetric } from "@/lib/types";
```

---

### Private helpers (not exported)

**`buildPrompt(query: string): string`**
Returns a prompt instructing Claude to:
1. Search the web for financial information about `query`.
2. Write a 2–3 sentence summary of what the company does and its financial position.
3. Append a JSON block containing any financial metrics found.

Exact prompt template:
```
Research the company "${query}" using web search. Provide:
1. A 2–3 sentence summary of the company and its current financial position.
2. Any financial metrics you find (revenue, net income, headcount, valuation, etc.)
   formatted as a JSON code block at the end of your response, like this:

\`\`\`json
{"metrics":[{"label":"Revenue","value":"$10B","period":"FY2024"},{"label":"Net Income","value":"$1.2B","period":"FY2024"}]}
\`\`\`

If no metrics are available, output: \`\`\`json\n{"metrics":[]}\n\`\`\`
```

**`parseMetrics(text: string): readonly FinancialMetric[]`**
- Finds the last ` ```json ... ``` ` block in `text` via regex:
  `/```json\s*([\s\S]*?)\s*```/g` — take the last match.
- `JSON.parse` the captured group.
- Validates: result must be `{ metrics: unknown[] }`.
- Maps each entry: `{ label: string, value: string | number | null, period?: string }`.
  - Any entry missing `label` (non-empty string) is dropped.
  - Appends `source: "claude-fallback"` to each valid entry.
- If parse fails or structure is wrong: log warning, return `[]`.
- Never throws.

**`extractNarrative(text: string): string`**
- Strips the last ` ```json ... ``` ` block and surrounding whitespace from `text`.
- Returns the remaining text trimmed.
- If nothing remains after stripping: returns the original `text`.

---

### Exported function (1)

**`export async function fetchClaudeFallbackData(query: string): Promise<ApiResult<ClaudeFallbackResult>>`**

Steps:
1. Construct `new Anthropic()` inside a try/catch (SDK throws if API key missing).
2. Call `client.messages.create`:
   ```typescript
   {
     model: MODEL,
     max_tokens: MAX_TOKENS,
     tools: [{ type: "web_search_20250305", name: "web_search" }],
     messages: [{ role: "user", content: buildPrompt(query) }],
   }
   ```
3. If API call throws → log `console.error("[claude-fallback] API error", { query, error })`,
   return `{ success: false, error: String(error) }`.
4. Extract text from response: filter `response.content` for blocks with `type === "text"`,
   join their `.text` fields with `"\n"`.
5. If no text blocks: return `{ success: false, error: "Claude returned no text content" }`.
6. `parseMetrics(fullText)` → `extractedMetrics`.
7. `extractNarrative(fullText)` → `narrative`.
8. Return:
   ```typescript
   {
     success: true,
     data: { narrative, extractedMetrics, disclaimer: DISCLAIMER },
   }
   ```

Edge case: `web_search_result_20250305` content blocks (the raw search results) are
ignored — only `text` blocks are used for the final response.

---

### Exports — complete list

| Export | Signature | Purpose |
|---|---|---|
| `fetchClaudeFallbackData` | `(query: string) => Promise<ApiResult<ClaudeFallbackResult>>` | Waterfall last-resort entry point |

No default export.

---

### Verification

1. `npx tsc --noEmit` — zero errors
2. Test `fetchClaudeFallbackData("SpaceX")`:
   - `data.narrative` is non-empty text
   - `data.extractedMetrics` is an array (may be empty)
   - `data.disclaimer` is set
3. Test with `ANTHROPIC_API_KEY` unset → `{ success: false }`

---

## Step 8 Plan — `src/lib/confidence.ts`

### Overview

Replace the placeholder stub with real confidence scoring driven by `WaterfallResult`.
The rules come directly from CLAUDE.md:

```
HIGH   — SEC EDGAR XBRL facts present and parsed (xbrlFacts !== null)
MEDIUM — At least one of Finnhub / Companies House / GLEIF returned data
LOW    — Only Claude fallback returned data, OR all sources failed
```

---

### Imports

```typescript
import type { ConfidenceLevel, ConfidenceScore, WaterfallResult } from "@/lib/types";
```

---

### Private helpers (not exported)

**`getLevel(score: number): ConfidenceLevel`**
- `score >= 75` → `"high"`
- `score >= 40` → `"medium"`
- else → `"low"`

---

### Exported function (1)

**`export function computeConfidence(result: WaterfallResult): ConfidenceScore`**

Decision tree — evaluated in order, first match wins:

| Condition | score | level | rationale |
|---|---|---|---|
| `result.secEdgar !== null && result.secEdgar.data.xbrlFacts !== null` | 85 | high | `"SEC EDGAR XBRL filing data present"` |
| `result.finnhub !== null \|\| result.companiesHouse !== null \|\| result.gleif !== null` | 60 | medium | `"Market/registry data available (Finnhub/Companies House/GLEIF); no SEC XBRL"` |
| `result.claudeFallback !== null` | 25 | low | `"Web search fallback only; data may be incomplete or stale"` |
| all null | 10 | low | `"No data sources returned data for this company"` |

Returns `ConfidenceScore` — never throws, no side effects.

Note: `secEdgar` non-null but `xbrlFacts` null (company info fetched but no XBRL)
falls through to MEDIUM if any market source also returned data, or LOW if only
secEdgar (without XBRL) is present. Add a fifth row:

| `result.secEdgar !== null && result.secEdgar.data.xbrlFacts === null` (and no market sources) | 40 | medium | `"SEC EDGAR company info present; no XBRL financial facts"` |

Revised decision tree (order matters):
1. secEdgar non-null AND xbrlFacts non-null → HIGH 85
2. finnhub OR companiesHouse OR gleif non-null → MEDIUM 60
3. secEdgar non-null (xbrlFacts null) → MEDIUM 40
4. claudeFallback non-null → LOW 25
5. all null → LOW 10

---

### Exports — complete list

| Export | Purpose |
|---|---|
| `computeConfidence(result: WaterfallResult): ConfidenceScore` | Main scoring function |

Remove `calculateConfidence` and `confidencePlaceholder` — they are unused after
the analyzer is wired up. Verify no other file imports them before removing.

---

### Verification

1. `npx tsc --noEmit` — zero errors
2. Unit tests (in `__tests__/confidence.test.ts` or inline assertions):
   - `WaterfallResult` with xbrlFacts → HIGH
   - `WaterfallResult` with only finnhub → MEDIUM
   - `WaterfallResult` with only claudeFallback → LOW
   - All null → LOW with score 10

---

## Step 9 Plan — `src/lib/analyzer.ts`

### Overview

Replace the placeholder stub with the real waterfall orchestrator.
Runs all data sources, assembles a `WaterfallResult`, computes confidence,
generates a narrative, and returns an `AnalysisReport`.

Also requires a small addition to `src/lib/datasources/sec-edgar.ts`:
export `REVENUE_CONCEPTS`, `NET_INCOME_CONCEPTS`, and `extractLatestFact` so the
analyzer can pull financial metrics from XBRL data.

---

### Change to `src/lib/datasources/sec-edgar.ts`

Add `export` to three existing private declarations:

```typescript
export const REVENUE_CONCEPTS = [...] as const;
export const NET_INCOME_CONCEPTS = [...] as const;
export function extractLatestFact(facts: SecXbrlFacts, concepts: readonly string[]): number | null
```

No other changes to sec-edgar.ts.

---

### Imports in `src/lib/analyzer.ts`

```typescript
import type {
  AnalysisReport,
  AnalystConsensusEntry,
  DataSourceResult,
  DataSource,
  FinancialMetric,
  FinnhubRecommendation,
  WaterfallInput,
  WaterfallResult,
} from "@/lib/types";
import { fetchClaudeFallbackData } from "@/lib/datasources/claude-fallback";
import { fetchCompaniesHouseData } from "@/lib/datasources/companies-house";
import { fetchFinnhubData } from "@/lib/datasources/finnhub";
import { fetchGleifData } from "@/lib/datasources/gleif";
import {
  REVENUE_CONCEPTS,
  NET_INCOME_CONCEPTS,
  extractLatestFact,
  fetchSecEdgarData,
} from "@/lib/datasources/sec-edgar";
import { computeConfidence } from "@/lib/confidence";
import { generateNarrative } from "@/lib/claude-narrative";
```

---

### Private helpers (not exported)

**`wrapSource<T>(source: DataSource, result: { success: true; data: T } | { success: false; error: string }): DataSourceResult<T> | null`**
- Returns `null` if `result.success === false`.
- Returns `{ source, data: result.data, fetchedAt: new Date().toISOString() }` on success.

**`extractXbrlMetrics(result: WaterfallResult): readonly FinancialMetric[]`**
- Returns `[]` if `result.secEdgar === null` or `result.secEdgar.data.xbrlFacts === null`.
- Calls `extractLatestFact(xbrlFacts, REVENUE_CONCEPTS)` → `revenue`.
- Calls `extractLatestFact(xbrlFacts, NET_INCOME_CONCEPTS)` → `netIncome`.
- Builds metrics array: only push entries where value is not null.
  - Revenue: `{ label: "Revenue", value: revenue, period: "Latest FY", source: "sec-edgar" }`
  - Net Income: `{ label: "Net Income", value: netIncome, period: "Latest FY", source: "sec-edgar" }`
- Returns the array (may be empty if XBRL has no matching concepts).

**`extractFinnhubMetrics(result: WaterfallResult): readonly FinancialMetric[]`**
- Returns `[]` if `result.finnhub === null`.
- Gets `quote = result.finnhub.data.quote`.
- If `quote === null` or `quote.t === 0` (invalid symbol): return `[]`.
- Returns:
  - `{ label: "Current Price", value: quote.c, source: "finnhub" }`
  - `{ label: "Day High", value: quote.h, source: "finnhub" }`
  - `{ label: "Day Low", value: quote.l, source: "finnhub" }`

**`assembleMetrics(result: WaterfallResult): readonly FinancialMetric[]`**
- Concatenates: `extractXbrlMetrics(result)`, `extractFinnhubMetrics(result)`.
- If `result.claudeFallback !== null`: also append `result.claudeFallback.data.extractedMetrics`.
- Returns the combined array.

**`extractConsensus(result: WaterfallResult): readonly AnalystConsensusEntry[]`**
- Returns `[]` if `result.finnhub === null`.
- Gets `recommendations = result.finnhub.data.recommendations`.
- If empty: return `[]`.
- Sort by `period` descending, take the first entry (`latest`).
- Compute aggregate:
  - `totalBullish = latest.buy + latest.strongBuy`
  - `totalBearish = latest.sell + latest.strongSell`
  - `totalNeutral = latest.hold`
  - `rating`: if `totalBullish >= totalBearish && totalBullish >= totalNeutral` → `"Buy"`;
    if `totalBearish > totalBullish && totalBearish >= totalNeutral` → `"Sell"`; else `"Hold"`.
- Returns: `[{ firm: "Wall Street Consensus", rating, targetPrice: null }]`

**`buildActiveSources(result: WaterfallResult): readonly DataSource[]`**
- Returns an array of `DataSource` strings for every non-null field in `result`
  (finnhub, secEdgar, companiesHouse, gleif, claudeFallback).

---

### Exported functions

**`export async function runWaterfall(input: WaterfallInput): Promise<WaterfallResult>`**

Steps:
1. Run four sources in parallel:
   ```typescript
   const [finnhubResult, edgarResult, chResult, gleifResult] = await Promise.all([
     fetchFinnhubData(input.query),
     fetchSecEdgarData(input.query),
     fetchCompaniesHouseData(input.query),
     fetchGleifData(input.query),
   ]);
   ```
2. Wrap each: `wrapSource("finnhub", finnhubResult)`, etc.
3. Check if all four are null:
   ```typescript
   const anyData = finnhub !== null || secEdgar !== null || companiesHouse !== null || gleif !== null;
   ```
4. If `!anyData`: call `fetchClaudeFallbackData(input.query)`,
   wrap as `wrapSource("claude-fallback", fallbackResult)`.
   Log: `console.error("[analyzer] all sources failed, running Claude fallback", { query: input.query })`.
5. Build `activeSources` via `buildActiveSources`.
6. Return assembled `WaterfallResult`.

**`export async function analyzeCompany(query: string): Promise<AnalysisReport>`**

Steps:
1. `runWaterfall({ query })` → `waterfallResult`.
2. `computeConfidence(waterfallResult)` → `confidence`.
3. `assembleMetrics(waterfallResult)` → `metrics`.
4. `extractConsensus(waterfallResult)` → `analystConsensus`.
5. `generateNarrative({ company: query, waterfallResult, confidence })` → `narrative`.
6. Build `summary`: first sentence of `narrative` (slice to first `.` or 120 chars, whichever is shorter).
   - If `narrative` is empty: `summary = "No analysis data available."`.
7. Return:
   ```typescript
   {
     company: query,
     summary,
     narrative,
     confidence,
     metrics,
     analystConsensus,
     sources: waterfallResult.activeSources,
     updatedAt: new Date().toISOString(),
   }
   ```

Remove the existing `analyzer` object export and `export default analyzer`.

---

### Exports — complete list

| Export | Signature | Purpose |
|---|---|---|
| `runWaterfall` | `(input: WaterfallInput) => Promise<WaterfallResult>` | Testable waterfall runner |
| `analyzeCompany` | `(query: string) => Promise<AnalysisReport>` | Called by analyze route |

---

### Verification

1. `npx tsc --noEmit` — zero errors
2. Test `analyzeCompany("Apple")` — returns report with HIGH confidence, SEC metrics
3. Test `analyzeCompany("Revolut")` — MEDIUM confidence, Companies House data
4. Test `analyzeCompany("Deutsche Bank")` — MEDIUM confidence, GLEIF data
5. Test `analyzeCompany("SpaceX")` — LOW confidence, Claude fallback narrative

---

## Step 10 Plan — `src/lib/claude-narrative.ts`

### Overview

Replace the stub. Calls Claude API (no web search — synthesis only) to generate a
polished analyst brief from structured `WaterfallResult` data. Claude receives only
data already in hand; it must not speculate or invent figures.

---

### Imports

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { NarrativeInput } from "@/lib/types";
```

---

### Module-level constants (not exported)

```typescript
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800;
const FALLBACK_NARRATIVE = "Analysis data is available in the metrics table above.";
```

---

### Private helpers (not exported)

**`formatMetrics(input: NarrativeInput): string`**
- Maps `input.waterfallResult` active sources' metrics into a readable list.
- Calls through to already-assembled data via `input.waterfallResult`:
  - If `secEdgar` non-null and `xbrlFacts` non-null: list revenue + net income.
  - If `finnhub` non-null and quote valid: list current price.
  - If `claudeFallback` non-null: include its narrative summary inline.
- Returns a plain-text bullet list (one metric per line: `"- Revenue: $X (FY2024)"`).
- Returns `"No structured financial data available."` if nothing to list.

**`buildPrompt(input: NarrativeInput): string`**
- Constructs the synthesis prompt:
  ```
  You are a financial analyst. Write a 3-paragraph analyst brief for ${input.company}.

  Available data (from: ${input.waterfallResult.activeSources.join(", ")}):
  ${formatMetrics(input)}

  Confidence level: ${input.confidence.level} (${input.confidence.rationale})

  Rules:
  - Only cite figures from the data above. Do not invent or estimate any numbers.
  - Paragraph 1: company overview and market position.
  - Paragraph 2: financial highlights — use exact figures if present, acknowledge gaps if not.
  - Paragraph 3: data quality note referencing confidence level and active sources.
  - Maximum 200 words total.
  ```

---

### Exported function (1)

**`export async function generateNarrative(input: NarrativeInput): Promise<string>`**

Steps:
1. `new Anthropic()` inside try/catch.
2. `client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, messages: [{ role: "user", content: buildPrompt(input) }] })`.
   - No tools — synthesis only, no web search.
3. If throws: log `console.error("[claude-narrative] API error", { company: input.company, error })`,
   return `FALLBACK_NARRATIVE`.
4. Filter `response.content` for `type === "text"` blocks, join their `.text` with `"\n"`.
5. If empty: return `FALLBACK_NARRATIVE`.
6. Return the joined text trimmed.

---

### Exports — complete list

| Export | Signature | Purpose |
|---|---|---|
| `generateNarrative` | `(input: NarrativeInput) => Promise<string>` | Called by analyzer |

Remove `claudeNarrativePlaceholder` — unused after wiring.

---

### Verification

1. `npx tsc --noEmit` — zero errors
2. Call with Apple waterfall data → narrative mentions Apple and includes at least one
   metric from SEC EDGAR
3. Call with all-null waterfall → returns `FALLBACK_NARRATIVE` or a graceful string

---

## Step 11 Plan — API Routes + Prisma

### Files

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add models, add `url` to datasource |
| `src/lib/db.ts` | Replace stub with PrismaClient singleton |
| `src/app/api/analyze/route.ts` | Wire real analyzer + cache |
| `src/app/api/search/route.ts` | Remove `placeholder: true`, add empty-query guard |
| `src/app/api/monitor/route.ts` | Implement GET / POST / DELETE with Prisma |

---

### `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model MonitoredCompany {
  id          String   @id @default(cuid())
  companyName String
  companyId   String
  status      String   @default("idle")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AnalysisCache {
  id        String   @id @default(cuid())
  companyId String   @unique
  report    String
  createdAt DateTime @default(now())
  expiresAt DateTime
}
```

`.env.local` must have `DATABASE_URL=file:./prisma/dev.db`.
After editing schema, run `npx prisma db push` to apply.

---

### `src/lib/db.ts`

Replace the `interface` stub entirely:

```typescript
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

The global singleton pattern prevents multiple PrismaClient instances during hot-reload in dev.
`@/generated/prisma` maps to the `output` path in the schema.

---

### `src/app/api/analyze/route.ts`

```
POST /api/analyze
Body: { company: string }
Response: AnalyzeApiResponse
```

Implementation:
1. Parse body; validate `company` is a non-empty string.
   - If invalid: return `NextResponse.json({ ok: false, error: "company is required" }, { status: 400 })`.
2. `companyId = company.trim().toLowerCase()`.
3. Check cache:
   ```typescript
   const cached = await db.analysisCache.findUnique({ where: { companyId } });
   if (cached && new Date(cached.expiresAt) > new Date()) {
     const report = JSON.parse(cached.report) as AnalysisReport;
     return NextResponse.json({ ok: true, report });
   }
   ```
4. `analyzeCompany(company)` → `report`.
5. Upsert cache:
   ```typescript
   const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
   await db.analysisCache.upsert({
     where: { companyId },
     create: { companyId, report: JSON.stringify(report), expiresAt },
     update: { report: JSON.stringify(report), expiresAt },
   });
   ```
6. Return `NextResponse.json({ ok: true, report })`.
7. Wrap steps 3–6 in try/catch → on error: log + return `{ ok: false, error: "Analysis failed" }` (status 500).

Remove `placeholder: true` from response.
Return type: `Promise<NextResponse<AnalyzeApiResponse>>`.

---

### `src/app/api/search/route.ts`

Two changes only:
1. Add early return for empty query:
   ```typescript
   if (query.length === 0) {
     return NextResponse.json({ ok: true, results: [] });
   }
   ```
2. Remove `placeholder: true` from the final `NextResponse.json` call.

No other changes — the existing implementation is correct.

---

### `src/app/api/monitor/route.ts`

```
GET  /api/monitor              → MonitorApiResponse
POST /api/monitor { companyName, companyId }  → MonitorApiResponse
DELETE /api/monitor?id=...     → MonitorApiResponse
```

Helper:
```typescript
async function getAllItems(): Promise<readonly MonitorItem[]> {
  const records = await db.monitoredCompany.findMany({ orderBy: { createdAt: "desc" } });
  return records.map((r) => ({
    id: r.id,
    label: r.companyName,
    status: r.status as "idle" | "watching",
    updatedAt: r.updatedAt.toISOString(),
  }));
}
```

`GET`: `return NextResponse.json({ ok: true, items: await getAllItems() })`.
Wrap in try/catch → `{ ok: false, items: [], error: "..." }` on failure.

`POST`:
1. Parse body; validate `companyName` and `companyId` are non-empty strings.
   - Invalid: return status 400.
2. `db.monitoredCompany.create({ data: { companyName, companyId } })`.
3. Return `{ ok: true, items: await getAllItems() }`.

`DELETE`:
1. `const id = request.nextUrl.searchParams.get("id")?.trim() ?? ""`.
2. If empty: return status 400.
3. `db.monitoredCompany.delete({ where: { id } })` in try/catch (record may not exist — ignore
   `P2025` Prisma not-found error, still return 200 with current list).
4. Return `{ ok: true, items: await getAllItems() }`.

Export: `export async function GET(...)`, `POST(request: NextRequest)`, `DELETE(request: NextRequest)`.
Remove the `const monitorItems` array and `placeholder: true`.

---

### Verification

1. `npx prisma db push` — schema applies without error
2. `npx tsc --noEmit` — zero errors
3. `curl -X POST localhost:3000/api/analyze -H "Content-Type: application/json" -d '{"company":"Apple"}'`
   → `{ ok: true, report: { company: "Apple", ... } }`
4. Second call → returns cached result (fast)
5. `curl localhost:3000/api/monitor` → `{ ok: true, items: [] }`
6. `curl -X POST localhost:3000/api/monitor -d '{"companyName":"Apple","companyId":"apple"}'`
   → `{ ok: true, items: [{ id: "...", label: "Apple", ... }] }`
7. `curl -X DELETE "localhost:3000/api/monitor?id={id}"` → `{ ok: true, items: [] }`

---

## Step 12 Plan — `src/app/page.tsx` + `src/components/SearchBar.tsx`

### Overview

Replace the Next.js boilerplate `page.tsx` with the actual dashboard. Make `SearchBar`
support live autocomplete. Wire all existing components together.

**No new files** — `page.tsx` becomes `"use client"` and manages all state.
`SearchBar.tsx` gets an optional `onSearch` prop.

---

### `src/components/SearchBar.tsx`

Add `onSearch?: (query: string) => void` prop to `SearchBarProps` (convert `interface` → `type`).

New behaviour:
- If `onSearch` is provided: attach `onChange` to the `<input>` and call `onSearch(e.target.value)`;
  call `e.preventDefault()` in `onSubmit` on the `<form>`.
- If `onSearch` is absent: existing `action` / form-submit behaviour is unchanged (backwards compat).

Keep all existing props. The component stays a server component when `onSearch` is not used;
when `onSearch` is provided the parent (`page.tsx`) passes a client-side handler.

Actually: because the parent is `"use client"`, SearchBar as a child also runs on the client
even without `"use client"` on its own file. Add `"use client"` to SearchBar since it now
handles `onChange`.

Exact additions to SearchBar:
```typescript
"use client";
// ...
type SearchBarProps = {
  action?: string;
  defaultValue?: string;
  placeholder?: string;
  onSearch?: (query: string) => void;
};
```

In JSX:
```tsx
<form
  action={onSearch ? undefined : action}
  onSubmit={onSearch ? (e) => e.preventDefault() : undefined}
  className="..."
>
  <input
    onChange={onSearch ? (e) => onSearch(e.target.value) : undefined}
    ...
  />
```

---

### `src/app/page.tsx`

Full rewrite. Top of file: `"use client"`.

**State:**
```typescript
const [query, setQuery] = useState("");
const [searchResults, setSearchResults] = useState<readonly SearchResult[]>([]);
const [isSearching, setIsSearching] = useState(false);
const [report, setReport] = useState<AnalysisReport | null>(null);
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [monitorItems, setMonitorItems] = useState<readonly MonitorItem[]>([]);
const [error, setError] = useState<string | null>(null);
```

**`useEffect` on mount:**
```typescript
useEffect(() => {
  fetch("/api/monitor")
    .then((r) => r.json())
    .then((data: MonitorApiResponse) => {
      if (data.ok) setMonitorItems(data.items);
    })
    .catch(() => {}); // non-critical
}, []);
```

**`handleSearch(q: string)`** — debounced, 300ms:
- Set `query = q`.
- If `q.trim().length < 2`: clear `searchResults`, return.
- `setIsSearching(true)`.
- `fetch("/api/search?q=" + encodeURIComponent(q))` → `SearchApiResponse`.
- `setSearchResults(data.results)`.
- `setIsSearching(false)`.
- Debounce: use `useRef<ReturnType<typeof setTimeout>>` to cancel prior timer.

**`handleSelect(result: SearchResult)`** — called when user clicks a result:
- `setSearchResults([])` (close dropdown).
- `setIsAnalyzing(true)`, `setError(null)`.
- `fetch("/api/analyze", { method: "POST", body: JSON.stringify({ company: result.name }), headers: { "Content-Type": "application/json" } })`.
- On success: `setReport(data.report)`.
- On failure: `setError(data.error ?? "Analysis failed")`.
- `setIsAnalyzing(false)`.

**`handleWatch(result: SearchResult)`** — called from a Watch button in the results:
- `fetch("/api/monitor", { method: "POST", body: JSON.stringify({ companyName: result.name, companyId: result.id }), ... })`.
- On success: `setMonitorItems(data.items)`.

**Layout:**
```tsx
<main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
  <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
    <h1 className="text-2xl font-semibold tracking-tight">
      Financial Intelligence
    </h1>

    {/* Search */}
    <div className="relative">
      <SearchBar placeholder="Search any company…" onSearch={handleSearch} />
      {/* Search results dropdown */}
      {searchResults.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-xl border bg-white shadow-lg dark:bg-zinc-900">
          {searchResults.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800">
              <button className="flex-1 text-left text-sm" onClick={() => handleSelect(r)}>
                <span className="font-medium">{r.name}</span>
                {r.ticker && <span className="ml-2 text-zinc-500">{r.ticker}</span>}
                {r.jurisdiction && <span className="ml-2 text-xs text-zinc-400">{r.jurisdiction}</span>}
              </button>
              <button className="ml-4 text-xs text-zinc-400 hover:text-zinc-700" onClick={() => handleWatch(r)}>
                Watch
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>

    {/* Loading / error states */}
    {isAnalyzing && <p className="text-sm text-zinc-500">Analyzing…</p>}
    {error && <p className="text-sm text-red-600">{error}</p>}

    {/* Report */}
    {report && <Report report={report} />}

    {/* Monitor list */}
    <MonitorList items={[...monitorItems]} />
  </div>
</main>
```

Imports needed: `SearchBar`, `Report`, `MonitorList` from components; types from `@/lib/types`.

---

### Verification

1. `npx tsc --noEmit` — zero errors
2. `npm run dev` — server starts without error
3. Browser: type "Apple" → dropdown appears with results
4. Click result → loading indicator → Report renders with confidence badge + metrics table
5. Click Watch → item appears in MonitorList
6. Page refresh → MonitorList still shows watched items (persisted in SQLite)

---

## Step 13 Plan — Simplification Pass

### Overview

Review the full codebase for redundancy, style violations, and leftover scaffolding.
No new features. Changes must be justified by a clear simplification win.

---

### Audit checklist

**HTTP fetch helpers (high-value target)**
- `fetchJson` (finnhub.ts), `fetchEdgar` (sec-edgar.ts), `fetchGleif` (gleif.ts),
  `fetchCompaniesHouse` (companies-house.ts) are structurally identical (~25 lines each).
- Extract to `src/lib/http.ts`:
  ```typescript
  export async function fetchWithHeaders<T>(
    url: string,
    headers: Record<string, string>,
  ): Promise<ApiResult<T>>
  ```
  Each datasource replaces its local fetch helper with a call to this.
  Net savings: ~75 lines. This extraction is warranted (4 identical copies, shared behavior).

**`interface` → `type` violations**
- `src/lib/db.ts` (if still using `interface DatabaseClient`) → convert to `type`.
- `src/components/SearchBar.tsx` props (Step 12 already converts this).
- Any remaining `interface` in components → convert to `type`.
- Run: `grep -rn "^interface" src/` and fix each.

**Default exports on datasource stubs**
- `companies-house.ts` and `gleif.ts` still have `export default` from the scaffold.
- After replacing the stubs in Steps 5/6, verify there are no `export default` statements.
- All datasources should use named exports only (consistent with finnhub.ts and sec-edgar.ts).
- `src/lib/analyzer.ts` stub also has `export default analyzer` — remove after Step 9.

**Placeholder removals**
- `confidencePlaceholder` from confidence.ts — remove in Step 8.
- `claudeNarrativePlaceholder` from claude-narrative.ts — remove in Step 10.
- `placeholder: true` in API routes — remove in Step 11.

**Unused imports**
- Run `npx tsc --noEmit` and `npm run lint` after each step to catch any that slip through.
- The `analyzeCompany` stub in analyzer.ts imports `placeholderAnalysisReport` — gone after Step 9.

**`src/lib/db.ts` interface**
- Current stub uses `interface DatabaseClient` — violates "prefer type over interface".
- Step 11 replaces the file entirely with PrismaClient; this goes away automatically.

**Confidence.ts cleanup**
- After Step 8, `calculateConfidence` and `confidencePlaceholder` should be removed.
- Verify no import of these anywhere: `grep -rn "calculateConfidence\|confidencePlaceholder" src/`.

**Component props style**
- `SearchBar.tsx`, `Report.tsx`, `MonitorList.tsx` use `interface` for props.
  Step 12 converts SearchBar. Confirm Report and MonitorList also use `type`.

---

### Verification

1. `npx tsc --noEmit` — zero errors
2. `npm run lint` — zero warnings
3. `grep -rn "^interface" src/` — returns nothing
4. `grep -rn "export default" src/lib/datasources/` — returns nothing
5. `grep -rn "placeholder: true" src/app/api/` — returns nothing
6. `grep -rn "any" src/` — returns nothing
7. Full browser test: search Apple → report renders, watch → persists
