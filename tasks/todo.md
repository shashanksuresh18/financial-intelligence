# Financial Intelligence — Task Tracker

## Phase 1: Build

- [x] Step 1: Project scaffold (verify: tsc passes, dev server starts)
- [x] Step 2: Types and interfaces
- [ ] Step 3: Finnhub client (verify: call AAPL, log response)
- [ ] Step 4: SEC EDGAR client (verify: call Apple CIK, log financials)
- [ ] Step 5: Companies House client (verify: search Revolut, log response)
- [ ] Step 6: GLEIF client (verify: search Deutsche Bank, log response)
- [ ] Step 7: Claude fallback client (verify: research SpaceX, log JSON)
- [ ] Step 8: Confidence rating logic
- [ ] Step 9: Waterfall analyzer (verify: test all 4 companies)
- [ ] Step 10: Claude narrative generation (verify: Apple report uses real SEC numbers)
- [ ] Step 11: API routes + Prisma schema (verify: curl each endpoint)
- [ ] Step 12: Frontend dashboard (verify: browser test full flow)
- [ ] Step 13: Final simplification pass

---

## Step 2 Plan — `src/lib/types.ts`

### Overview

Replace the scaffold's `interface`-based types with `type` aliases (CLAUDE.md rule).
Add all types needed by every data source, the waterfall, the confidence module,
the narrative generator, the API routes, and the DB layer. Every type is exported.
No `enum`, no `any`, no `interface`. Use `readonly` on all object property types.

---

### Section 1 — Utility / shared primitives

**`DataSource`**
```
type DataSource =
  | "finnhub"
  | "sec-edgar"
  | "companies-house"
  | "gleif"
  | "claude-fallback";
```
Used everywhere a source name is recorded. Replaces bare `string` in
`DataSourceResult.source` and `AnalysisReport.sources`.

**`ConfidenceLevel`** (keep, convert to `type`)
```
type ConfidenceLevel = "low" | "medium" | "high";
```

**`FiscalPeriod`**
```
type FiscalPeriod = "Q1" | "Q2" | "Q3" | "Q4" | "FY";
```
Used in SEC XBRL facts. The string union covers all valid EDGAR period labels.
Edge case: EDGAR also emits empty string and multi-year frames ("CY2023Q4I") — those
are left as `string` in `SecXbrlFact.frame`.

**`AnalystRating`**
```
type AnalystRating =
  | "Strong Buy"
  | "Buy"
  | "Hold"
  | "Sell"
  | "Strong Sell"
  | string;
```
Using `| string` intentionally: third-party firms sometimes emit non-standard
labels ("Outperform", "Neutral"). The known values let editors autocomplete the
common cases; the escape hatch prevents parse failures on unknown labels.

**`ApiResult<T>`** (typed result wrapper from TypeScript rules)
```
type ApiResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };
```
Every library function that touches an external API returns this instead of
throwing. API route handlers unwrap it for HTTP responses.

---

### Section 2 — Core domain types (all converted from `interface` to `type`)

**`ConfidenceScore`**
```
type ConfidenceScore = {
  readonly score: number;        // 0–100 integer
  readonly level: ConfidenceLevel;
  readonly rationale: string;    // human-readable explanation, shown in UI
};
```

**`SearchResult`**
```
type SearchResult = {
  readonly id: string;           // opaque identifier, source-prefixed e.g. "finnhub:AAPL"
  readonly name: string;         // display name
  readonly ticker?: string;      // present for exchange-listed companies
  readonly jurisdiction?: string; // "US" | "GB" | "DE" | ISO 3166-1 alpha-2 | "Global"
  readonly description?: string; // short disambiguation string
};
```
Edge case: `ticker` is absent for private companies and GLEIF/Companies House results
that have no market listing.

**`FinancialMetric`**
```
type FinancialMetric = {
  readonly label: string;              // e.g. "Revenue", "Net Income"
  readonly value: number | string | null; // null when unavailable
  readonly period?: string;            // e.g. "FY2023", "Q3 2024"
  readonly source?: DataSource;        // which data source produced this metric
};
```
Changed `source` from `string` to `DataSource` for type safety.

**`AnalystConsensusEntry`**
```
type AnalystConsensusEntry = {
  readonly firm: string;               // e.g. "Goldman Sachs"
  readonly rating: AnalystRating;
  readonly targetPrice: number | null; // null when no price target issued
};
```

**`MonitorItem`**
```
type MonitorItem = {
  readonly id: string;
  readonly label: string;              // display name (company name + optional ticker)
  readonly status: "idle" | "watching";
  readonly updatedAt: string;          // ISO 8601
};
```

**`DataSourceResult<T>`**
```
type DataSourceResult<T> = {
  readonly source: DataSource;
  readonly data: T;
  readonly fetchedAt: string;          // ISO 8601
  readonly error?: string;             // set when source returned partial data
};
```
Added `error?`: a source can succeed at the HTTP level but return partial/degraded
data. This field surfaces that without crashing the waterfall.

**`AnalysisReport`**
```
type AnalysisReport = {
  readonly company: string;
  readonly summary: string;            // 1–2 sentence lead
  readonly narrative: string;          // full Claude-generated prose
  readonly confidence: ConfidenceScore;
  readonly metrics: readonly FinancialMetric[];
  readonly analystConsensus: readonly AnalystConsensusEntry[];
  readonly sources: readonly DataSource[];  // changed from string[]
  readonly updatedAt: string;          // ISO 8601
};
```
`metrics`, `analystConsensus`, and `sources` are `readonly` arrays to prevent
accidental mutation downstream.

---

### Section 3 — Finnhub raw API shapes

These mirror the actual Finnhub REST responses. Used in `src/lib/datasources/finnhub.ts`
for validation before data is used.

**`FinnhubQuote`**
```
type FinnhubQuote = {
  readonly c: number;        // current price
  readonly d: number | null; // price change
  readonly dp: number | null;// percent change
  readonly h: number;        // day high
  readonly l: number;        // day low
  readonly o: number;        // open
  readonly pc: number;       // previous close
  readonly t: number;        // timestamp (Unix seconds)
};
```
Edge case: Finnhub returns `{ c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 }`
for unknown symbols — all zeros. The client must check `t !== 0` before trusting the quote.

**`FinnhubSymbolMatch`**
```
type FinnhubSymbolMatch = {
  readonly description: string;  // company name
  readonly displaySymbol: string;
  readonly symbol: string;       // e.g. "AAPL"
  readonly type: string;         // "Common Stock" | "ETP" | "ADR" | ...
};
```

**`FinnhubSymbolSearchResponse`**
```
type FinnhubSymbolSearchResponse = {
  readonly count: number;
  readonly result: readonly FinnhubSymbolMatch[];
};
```

**`FinnhubRecommendation`**
```
type FinnhubRecommendation = {
  readonly buy: number;
  readonly hold: number;
  readonly period: string;   // "YYYY-MM-DD" first day of the month
  readonly sell: number;
  readonly strongBuy: number;
  readonly strongSell: number;
  readonly symbol: string;
};
```

**`FinnhubNewsItem`**
```
type FinnhubNewsItem = {
  readonly category: string;
  readonly datetime: number;   // Unix timestamp
  readonly headline: string;
  readonly id: number;
  readonly image: string;      // may be empty string
  readonly related: string;    // ticker symbol(s)
  readonly source: string;     // publisher name
  readonly summary: string;
  readonly url: string;
};
```

**`FinnhubData`** (assembled result returned by the Finnhub client)
```
type FinnhubData = {
  readonly symbol: string;
  readonly quote: FinnhubQuote | null;              // null if symbol lookup failed
  readonly recommendations: readonly FinnhubRecommendation[];
  readonly news: readonly FinnhubNewsItem[];
};
```

---

### Section 4 — SEC EDGAR raw API shapes

**`SecFiling`**
```
type SecFiling = {
  readonly accessionNumber: string;         // "0000320193-23-000106"
  readonly filingDate: string;              // "YYYY-MM-DD"
  readonly form: string;                    // "10-K" | "10-Q" | "8-K" | ...
  readonly primaryDocument: string;         // filename e.g. "aapl-20230930.htm"
  readonly primaryDocDescription: string;
};
```

**`SecCompanyInfo`** (from `/submissions/CIK{cik}.json`)
```
type SecCompanyInfo = {
  readonly cik: string;
  readonly name: string;
  readonly sic: string;
  readonly sicDescription: string;
  readonly tickers: readonly string[];
  readonly exchanges: readonly string[];
  readonly filings: {
    readonly recent: {
      readonly accessionNumber: readonly string[];
      readonly filingDate: readonly string[];
      readonly form: readonly string[];
      readonly primaryDocument: readonly string[];
      readonly primaryDocDescription: readonly string[];
    };
  };
};
```
Edge case: EDGAR returns arrays of equal length, parallel-indexed. The client must
zip them into `SecFiling[]` before use. Empty arrays are valid (new registrants).

**`SecXbrlFact`** (one data point within a concept's unit)
```
type SecXbrlFact = {
  readonly val: number;
  readonly accn: string;          // accession number
  readonly fy: number | null;     // fiscal year e.g. 2023; null for point-in-time
  readonly fp: FiscalPeriod | string; // "FY" | "Q1"–"Q4"; or "" for instant facts
  readonly form: string;          // "10-K" | "10-Q"
  readonly filed: string;         // "YYYY-MM-DD"
  readonly frame: string | null;  // "CY2023Q4I" | null; present only on selected facts
  readonly start?: string;        // "YYYY-MM-DD"; present for duration facts only
  readonly end: string;           // "YYYY-MM-DD"
};
```
Edge case: `frame` is absent from most facts; only facts with the highest
disambiguation signal have it. Never depend on `frame` being present.

**`SecXbrlUnit`**
```
type SecXbrlUnit = {
  readonly USD?: readonly SecXbrlFact[];
  readonly shares?: readonly SecXbrlFact[];
  readonly pure?: readonly SecXbrlFact[];
};
```
Edge case: EDGAR may also use "USD/shares" (EPS). Keep the record open-ended:
```
type SecXbrlUnit = Record<string, readonly SecXbrlFact[]>;
```
Use the Record form so exotic unit keys don't cause type errors.

**`SecXbrlConcept`**
```
type SecXbrlConcept = {
  readonly label: string;
  readonly description: string;
  readonly units: SecXbrlUnit;
};
```

**`SecXbrlFacts`** (from `/api/xbrl/companyfacts/CIK{cik}.json`)
```
type SecXbrlFacts = {
  readonly cik: number;
  readonly entityName: string;
  readonly facts: {
    readonly "us-gaap"?: Record<string, SecXbrlConcept>;
    readonly "dei"?: Record<string, SecXbrlConcept>;
    readonly "ifrs-full"?: Record<string, SecXbrlConcept>;
  };
};
```
Edge case: Non-US filers may use "ifrs-full" instead of "us-gaap". Both keys
can be absent for pre-XBRL or foreign private issuers.

**`SecEdgarData`** (assembled result)
```
type SecEdgarData = {
  readonly cik: string;
  readonly companyInfo: SecCompanyInfo | null;
  readonly recentFilings: readonly SecFiling[];
  readonly xbrlFacts: SecXbrlFacts | null;  // null for companies with no XBRL
};
```

---

### Section 5 — Companies House raw API shapes

**`CompaniesHouseAddress`**
```
type CompaniesHouseAddress = {
  readonly address_line_1?: string;
  readonly address_line_2?: string;
  readonly locality?: string;
  readonly postal_code?: string;
  readonly country?: string;
};
```

**`CompaniesHouseCompany`**
```
type CompaniesHouseCompany = {
  readonly company_number: string;
  readonly company_name: string;
  readonly company_status: "active" | "dissolved" | "liquidation" | "administration" | string;
  readonly company_type: string;       // "ltd" | "plc" | "llp" | ...
  readonly date_of_creation?: string;  // "YYYY-MM-DD"; absent for some older records
  readonly registered_office_address: CompaniesHouseAddress;
  readonly description?: string;
};
```
Edge case: `date_of_creation` is absent for companies incorporated before
Companies House began digital records (~1844–1980). Always treat as optional.

**`CompaniesHouseSearchResponse`**
```
type CompaniesHouseSearchResponse = {
  readonly items: readonly CompaniesHouseCompany[];
  readonly total_results: number;
  readonly start_index: number;
  readonly items_per_page: number;
  readonly kind: string;  // "search#companies"
};
```
Edge case: `total_results` can be 0. `items` will be an empty array, not absent.

**`CompaniesHouseData`** (assembled result)
```
type CompaniesHouseData = {
  readonly company: CompaniesHouseCompany | null;
  readonly allMatches: readonly CompaniesHouseCompany[];
};
```

---

### Section 6 — GLEIF raw API shapes

**`GleifName`**
```
type GleifName = {
  readonly name: string;
  readonly language: string;   // ISO 639-1 e.g. "en"
};
```

**`GleifAddress`**
```
type GleifAddress = {
  readonly lang: string;
  readonly addressLines: readonly string[];
  readonly city: string;
  readonly region?: string;
  readonly country: string;    // ISO 3166-1 alpha-2
  readonly postalCode?: string;
};
```

**`GleifRegistration`**
```
type GleifRegistration = {
  readonly initialRegistrationDate: string; // ISO 8601
  readonly lastUpdateDate: string;          // ISO 8601
  readonly status: "ISSUED" | "LAPSED" | "MERGED" | "RETIRED" | "ANNULLED" | "DUPLICATE" | "TRANSFERRED" | "PENDING_TRANSFER" | "PENDING_ARCHIVAL" | string;
  readonly nextRenewalDate: string;         // ISO 8601
  readonly managingLou: string;             // LEI of the issuing LOU
};
```

**`GleifEntity`**
```
type GleifEntity = {
  readonly legalName: GleifName;
  readonly otherNames?: readonly GleifName[];
  readonly legalAddress: GleifAddress;
  readonly headquartersAddress: GleifAddress;
  readonly registeredAt?: { readonly id: string };  // registration authority
  readonly jurisdiction: string;                     // ISO 3166-1 or ISO 3166-2
  readonly category: "GENERAL" | "BRANCH" | "FUND" | "SOLE_PROPRIETOR" | string;
  readonly legalForm: { readonly id: string };       // GLEIF entity legal form code
};
```

**`GleifAttributes`**
```
type GleifAttributes = {
  readonly lei: string;
  readonly entity: GleifEntity;
  readonly registration: GleifRegistration;
};
```

**`GleifRecord`**
```
type GleifRecord = {
  readonly type: string;   // "lei-records"
  readonly id: string;     // same as attributes.lei
  readonly attributes: GleifAttributes;
};
```

**`GleifSearchResponse`**
```
type GleifSearchResponse = {
  readonly data: readonly GleifRecord[];
  readonly meta: {
    readonly total: number;
    readonly page: number;
  };
};
```
Edge case: GLEIF fuzzy search can return many matches for common names
("Deutsche Bank" → dozens). The client must rank by jurisdiction match
and LEI status ("ISSUED" preferred over "LAPSED").

**`GleifData`** (assembled result)
```
type GleifData = {
  readonly record: GleifRecord | null;      // best match
  readonly allMatches: readonly GleifRecord[];
};
```

---

### Section 7 — Claude fallback types

**`ClaudeFallbackResult`**
```
type ClaudeFallbackResult = {
  readonly narrative: string;
  readonly extractedMetrics: readonly FinancialMetric[];
  readonly disclaimer: string;    // always displayed, warns data may be stale
};
```
The confidence level is not embedded here — `confidence.ts` computes LOW automatically
when `ClaudeFallbackResult` is the only populated source in `WaterfallResult`.

---

### Section 8 — Waterfall / Analyzer types

**`WaterfallInput`**
```
type WaterfallInput = {
  readonly query: string;                          // raw user input
  readonly hint?: "us-public" | "uk" | "global" | "private"; // optional routing hint
};
```

**`WaterfallResult`**
```
type WaterfallResult = {
  readonly query: string;
  readonly finnhub: DataSourceResult<FinnhubData> | null;
  readonly secEdgar: DataSourceResult<SecEdgarData> | null;
  readonly companiesHouse: DataSourceResult<CompaniesHouseData> | null;
  readonly gleif: DataSourceResult<GleifData> | null;
  readonly claudeFallback: DataSourceResult<ClaudeFallbackResult> | null;
  readonly activeSources: readonly DataSource[];   // sources that returned non-null data
};
```
Edge case: `activeSources` can be empty if all sources fail. In that case the
analyze route returns a 503 with a user-friendly error.

**`NarrativeInput`** (what `claude-narrative.ts` receives)
```
type NarrativeInput = {
  readonly company: string;
  readonly waterfallResult: WaterfallResult;
  readonly confidence: ConfidenceScore;
};
```

---

### Section 9 — API route response types

**`AnalyzeApiResponse`**
```
type AnalyzeApiResponse = {
  readonly ok: boolean;
  readonly report?: AnalysisReport;
  readonly error?: string;
};
```

**`SearchApiResponse`**
```
type SearchApiResponse = {
  readonly ok: boolean;
  readonly results: readonly SearchResult[];
  readonly error?: string;
};
```

**`MonitorApiResponse`**
```
type MonitorApiResponse = {
  readonly ok: boolean;
  readonly items: readonly MonitorItem[];
  readonly error?: string;
};
```

---

### Section 10 — DB record types

These mirror the Prisma models that will be added in Step 11.
Defined here so downstream code can type DB results without importing from Prisma.

**`MonitoredCompanyRecord`**
```
type MonitoredCompanyRecord = {
  readonly id: string;
  readonly companyName: string;
  readonly companyId: string;   // normalized key e.g. "finnhub:AAPL" or "gleif:{LEI}"
  readonly status: "idle" | "watching";
  readonly createdAt: string;   // ISO 8601
  readonly updatedAt: string;   // ISO 8601
};
```

**`AnalysisCacheRecord`**
```
type AnalysisCacheRecord = {
  readonly id: string;
  readonly companyId: string;
  readonly report: AnalysisReport;   // stored as JSON in SQLite TEXT column
  readonly createdAt: string;        // ISO 8601
  readonly expiresAt: string;        // ISO 8601; cache TTL, default 24h
};
```

---

### Section 11 — Placeholder constants (keep in types.ts, already imported by components)

```
export const placeholderConfidence: ConfidenceScore = { ... };
export const placeholderAnalysisReport: AnalysisReport = { ... };
```

Remove the meaningless `export type Placeholder = AnalysisReport` alias.

---

### Exports — complete list

Every name below is a named export from `src/lib/types.ts`.

**Types (24 + 2 generics):**
`DataSource`, `ConfidenceLevel`, `FiscalPeriod`, `AnalystRating`,
`ApiResult` (generic), `ConfidenceScore`, `SearchResult`,
`FinancialMetric`, `AnalystConsensusEntry`, `MonitorItem`,
`DataSourceResult` (generic), `AnalysisReport`,
`FinnhubQuote`, `FinnhubSymbolMatch`, `FinnhubSymbolSearchResponse`,
`FinnhubRecommendation`, `FinnhubNewsItem`, `FinnhubData`,
`SecFiling`, `SecCompanyInfo`, `SecXbrlFact`, `SecXbrlUnit`,
`SecXbrlConcept`, `SecXbrlFacts`, `SecEdgarData`,
`CompaniesHouseAddress`, `CompaniesHouseCompany`,
`CompaniesHouseSearchResponse`, `CompaniesHouseData`,
`GleifName`, `GleifAddress`, `GleifRegistration`, `GleifEntity`,
`GleifAttributes`, `GleifRecord`, `GleifSearchResponse`, `GleifData`,
`ClaudeFallbackResult`,
`WaterfallInput`, `WaterfallResult`, `NarrativeInput`,
`AnalyzeApiResponse`, `SearchApiResponse`, `MonitorApiResponse`,
`MonitoredCompanyRecord`, `AnalysisCacheRecord`

**Constants (2):**
`placeholderConfidence`, `placeholderAnalysisReport`

---

### Key decisions and edge cases

| Edge case | Decision |
|---|---|
| Finnhub all-zero quote for unknown symbol | Client checks `t !== 0` before trusting data |
| EDGAR parallel arrays in `SecCompanyInfo.filings.recent` | Client zips into `SecFiling[]` |
| XBRL unit keys beyond USD/shares | `SecXbrlUnit = Record<string, readonly SecXbrlFact[]>` |
| EDGAR `frame` usually absent | `frame: string \| null` — never depend on it |
| GLEIF many matches for common names | `GleifData.allMatches` preserved; client ranks by status + jurisdiction |
| GLEIF LAPSED status | Included in `GleifRegistration.status` union; confidence module uses this to downgrade |
| Companies House pre-digital records | `date_of_creation?: string` (optional) |
| All sources fail | `WaterfallResult.activeSources` empty → 503 from API route |
| `AnalystRating \| string` escape hatch | Intentional to handle non-standard labels without parse failures |
| `interface` → `type` migration | All scaffold interfaces replaced with `type` |
| Placeholder constants location | Keep in `types.ts` (already imported from there by 4+ files) |
| `Placeholder = AnalysisReport` alias | Remove — it's meaningless |

---

### Verification (after implementation)

1. `npx tsc --noEmit` — must pass with zero errors
2. Grep for `interface` in types.ts — must return nothing
3. Grep for `enum` in types.ts — must return nothing
4. Grep for `: any` in types.ts — must return nothing
5. Confirm every downstream import (`finnhub.ts`, `sec-edgar.ts`, etc.) resolves correctly

---

## Step 3 Plan — `src/lib/datasources/finnhub.ts`

### Overview

Replace the placeholder stub with the real Finnhub REST client. The file has no
default export. All public API is named exports. Every external call returns
`ApiResult<T>` — never throws. Partial sub-failures (quote down, news empty) are
logged and result in a null/empty field; `fetchFinnhubData` still returns success
as long as the symbol resolved.

---

### Environment variable

**`FINNHUB_API_KEY`**
- Server-side only. No `NEXT_PUBLIC_` prefix.
- Read at call-time (not module load) so test environments can set it after import.
- If unset, `getApiKey()` returns `""` → Finnhub returns HTTP 401 →
  `fetchJson` returns `{ success: false, error: "HTTP 401: Unauthorized" }`.
- Never log the full request URL (it contains the token).

---

### Module-level constants (not exported)

```
const BASE_URL = "https://finnhub.io/api/v1";
const NEWS_LOOKBACK_DAYS = 30;
const MAX_NEWS_ITEMS = 10;
```

`MAX_NEWS_ITEMS` caps the slice returned in `FinnhubData.news` so the waterfall
result stays lean. `NEWS_LOOKBACK_DAYS` sets the default `from`/`to` window for
the company-news endpoint (which requires both params).

---

### Imports

```typescript
import type {
  ApiResult,
  FinnhubData,
  FinnhubQuote,
  FinnhubSymbolMatch,
  FinnhubSymbolSearchResponse,
  FinnhubRecommendation,
  FinnhubNewsItem,
  SearchResult,
} from "@/lib/types";
```

`DataSourceResult` is intentionally NOT imported here — it is assembled by
`analyzer.ts`, not by the data-source client itself.

---

### Private helpers (not exported)

**`getApiKey(): string`**
- Returns `process.env.FINNHUB_API_KEY ?? ""`
- Pure, synchronous.
- Called inside each URL builder, not once at module load.

**`buildUrl(path: string, params: Record<string, string>): string`**
- Returns `${BASE_URL}${path}?${new URLSearchParams({ ...params, token: getApiKey() })}`
- `token` is appended last (consistent ordering, easier diff).
- Edge case: `URLSearchParams` handles all percent-encoding of query/symbol values.
- Never called at the top level (would embed the key at import time).

**`async function fetchJson<T>(url: string): Promise<ApiResult<T>>`**
- Wraps `fetch(url)` in a try/catch.
- Network error path: `catch (err)` → `{ success: false, error: "Network error: ${String(err)}" }`.
- Non-OK HTTP path: `if (!res.ok)` → `{ success: false, error: "HTTP ${res.status}: ${res.statusText}" }`.
  - HTTP 401 → API key missing or invalid.
  - HTTP 403 → API key revoked or plan mismatch.
  - HTTP 429 → rate limit hit (60 calls/min on free tier).
- JSON parse error path: second try/catch around `res.json()` →
  `{ success: false, error: "Invalid JSON response from Finnhub" }`.
- Success path: `{ success: true, data: (await res.json()) as T }`.
- Never throws. All paths return `ApiResult<T>`.

**`function newsDateRange(lookbackDays: number): { from: string; to: string }`**
- Computes today's date and `today - lookbackDays` as `"YYYY-MM-DD"` strings.
- Uses `new Date()` and `toISOString().slice(0, 10)`.
- Edge case: server-side only; no browser timezone issues for date-only strings.
- Edge case: `from === to` is valid (e.g., same-day call) — Finnhub accepts it,
  may return 0 items on weekends/holidays.

**`function pickBestSymbol(matches: readonly FinnhubSymbolMatch[]): FinnhubSymbolMatch | null`**
- Returns first match where `match.type === "Common Stock"`.
- If none, returns first match where `match.type === "ADR"`.
- If none, returns `matches[0]` (any type).
- If `matches` is empty, returns `null`.
- Rationale: "Common Stock" is most likely the primary exchange listing.
  ADRs are valid for foreign companies. ETPs/indices are last resort.

**`function isValidQuote(quote: FinnhubQuote): boolean`**
- Returns `quote.t !== 0`.
- Finnhub sentinel: unknown symbols return all-zero object with `t === 0`.
- Callers must run this check before trusting any field.

**`function symbolToSearchResult(match: FinnhubSymbolMatch): SearchResult`**
- Returns:
  ```
  {
    id:           `finnhub:${match.symbol}`,
    name:         match.description || match.symbol,   // fallback if description empty
    ticker:       match.symbol,
    jurisdiction: "US",
    description:  match.type,
  }
  ```
- `id` format `"finnhub:AAPL"` matches the convention in `SearchResult` (Step 2 plan).
- `jurisdiction` is hardcoded `"US"` for now; Finnhub does return non-US symbols
  (e.g. `"7203.T"` for Toyota) but jurisdiction detection is deferred to Step 9.
- Edge case: `match.description` can be `""` for some OTC symbols — fall back to `match.symbol`.

---

### Exported functions (6)

**`export async function searchSymbols(query: string): Promise<ApiResult<FinnhubSymbolSearchResponse>>`**

Endpoint: `GET /search?q={query}&token={key}`

Steps:
1. `buildUrl("/search", { q: query })`
2. `fetchJson<FinnhubSymbolSearchResponse>(url)`
3. If `result.success`, validate shape:
   - `typeof result.data.count === "number"` AND `Array.isArray(result.data.result)`
   - Failure: `{ success: false, error: "Unexpected Finnhub /search response shape" }`
4. Return `ApiResult<FinnhubSymbolSearchResponse>`.

Edge cases:
- Empty `query` string → Finnhub returns `{ count: 0, result: [] }` — valid, not an error.
- `query` with special characters → `URLSearchParams` encodes them.

---

**`export async function getQuote(symbol: string): Promise<ApiResult<FinnhubQuote>>`**

Endpoint: `GET /quote?symbol={symbol}&token={key}`

Steps:
1. `buildUrl("/quote", { symbol })`
2. `fetchJson<FinnhubQuote>(url)`
3. If `result.success`, validate shape: `typeof result.data.t === "number"`
   - Failure: `{ success: false, error: "Unexpected Finnhub /quote response shape" }`
4. Return `ApiResult<FinnhubQuote>`.

Note: does NOT apply `isValidQuote` here. The caller (`fetchFinnhubData`) does
that and maps the all-zero case to `quote: null`. Keeping the concern separate
makes `getQuote` more testable in isolation.

Edge cases:
- Valid symbol with no market data → all-zero response → passes shape validation,
  `isValidQuote` returns false in caller.
- Delisted symbol → same as unknown symbol.

---

**`export async function getRecommendations(symbol: string): Promise<ApiResult<readonly FinnhubRecommendation[]>>`**

Endpoint: `GET /stock/recommendation?symbol={symbol}&token={key}`

Steps:
1. `buildUrl("/stock/recommendation", { symbol })`
2. `fetchJson<readonly FinnhubRecommendation[]>(url)`
3. If `result.success`, validate: `Array.isArray(result.data)`
   - Edge case: Finnhub returns `null` for symbols with no analyst coverage →
     NOT an array → shape validation fails → return `{ success: false, error: "..." }`
   - Caller (`fetchFinnhubData`) maps a failure here to `recommendations: []`.
4. Return `ApiResult<readonly FinnhubRecommendation[]>`.

Edge cases:
- Empty array `[]` → valid; no analyst coverage.
- `null` response → shape validation catches it, treated as failure by caller.
- Very old data in array → all recommendations returned; caller takes most recent
  entry (index 0) as the current period's consensus.

---

**`export async function getNews(symbol: string, lookbackDays: number = NEWS_LOOKBACK_DAYS): Promise<ApiResult<readonly FinnhubNewsItem[]>>`**

Endpoint: `GET /company-news?symbol={symbol}&from={from}&to={to}&token={key}`

Steps:
1. `const { from, to } = newsDateRange(lookbackDays)`
2. `buildUrl("/company-news", { symbol, from, to })`
3. `fetchJson<readonly FinnhubNewsItem[]>(url)`
4. If `result.success`, validate: `Array.isArray(result.data)`
   - Edge case: `null` response → shape validation fails.
5. Slice to `MAX_NEWS_ITEMS` if validation passes:
   `{ success: true, data: result.data.slice(0, MAX_NEWS_ITEMS) }`
6. Return `ApiResult<readonly FinnhubNewsItem[]>`.

Note: `from`/`to` are REQUIRED by Finnhub for company news. Omitting them returns
general market news, not company-specific results. Always supply both.

Edge cases:
- Weekend/holiday window → may return 0 items — valid, empty array.
- `lookbackDays` param allows callers to request more/less history without changing
  the module constant (useful for test scenarios).
- `image` field in items may be `""` — UI must handle empty string.

---

**`export async function fetchFinnhubData(query: string): Promise<ApiResult<FinnhubData>>`**

This is the **primary entry point** for the waterfall analyzer (`analyzer.ts`).
It orchestrates symbol lookup + parallel data fetching and assembles `FinnhubData`.

Steps:
1. **Symbol search**: `searchSymbols(query)`.
   - If `{ success: false }`: log the error, return `{ success: false, error }`.
2. **Pick best symbol**: `pickBestSymbol(searchResult.data.result)`.
   - If `null` (no matches): return
     `{ success: false, error: \`No Finnhub symbol found for: "${query}"\` }`.
3. **Parallel fetch** (all three called with `Promise.all`):
   - `getQuote(symbol.symbol)`
   - `getRecommendations(symbol.symbol)`
   - `getNews(symbol.symbol)`
   - `Promise.all` never rejects here — each returns `ApiResult`, not a raw Promise.
4. **Assemble `FinnhubData`**:
   ```
   {
     symbol:          symbol.symbol,
     quote:           quoteResult.success && isValidQuote(quoteResult.data)
                        ? quoteResult.data
                        : null,
     recommendations: recsResult.success
                        ? recsResult.data
                        : [],
     news:            newsResult.success
                        ? newsResult.data          // already sliced to MAX_NEWS_ITEMS
                        : [],
   }
   ```
5. Log any sub-failure at `console.error` with context (function, symbol, error).
6. Return `{ success: true, data: assembled }`.

Partial failure policy: as long as the symbol resolved, the overall result is
`success: true`. Downstream confidence scoring will lower the rating if `quote`
is null or `recommendations` is empty.

Rate budget: this function makes 4 Finnhub calls total (1 search + 3 parallel).
With the 60 calls/min free-tier limit and the waterfall running sources serially
in `analyzer.ts`, this is safe at normal query rates.

Edge cases:
- `query` is an exact ticker (`"AAPL"`) → symbol search will match immediately;
  `pickBestSymbol` returns it as first "Common Stock" result.
- `query` is a full company name (`"Apple Inc"`) → search returns multiple matches;
  `pickBestSymbol` picks first "Common Stock".
- No matches for private companies → `{ success: false }` → waterfall moves on.

---

**`export function toSearchResults(matches: readonly FinnhubSymbolMatch[]): readonly SearchResult[]`**

Pure function. Used by `src/app/api/search/route.ts` for autocomplete responses.

- Maps `matches` through `symbolToSearchResult`.
- Returns `readonly SearchResult[]`.
- Never throws.
- Input can be empty array → returns empty array.

---

### Exports — complete list

**Functions (6):**

| Export | Signature | Purpose |
|---|---|---|
| `searchSymbols` | `(query: string) => Promise<ApiResult<FinnhubSymbolSearchResponse>>` | Raw symbol search |
| `getQuote` | `(symbol: string) => Promise<ApiResult<FinnhubQuote>>` | Raw market quote |
| `getRecommendations` | `(symbol: string) => Promise<ApiResult<readonly FinnhubRecommendation[]>>` | Raw analyst recs |
| `getNews` | `(symbol: string, lookbackDays?: number) => Promise<ApiResult<readonly FinnhubNewsItem[]>>` | Raw company news |
| `fetchFinnhubData` | `(query: string) => Promise<ApiResult<FinnhubData>>` | **Waterfall entry point** |
| `toSearchResults` | `(matches: readonly FinnhubSymbolMatch[]) => readonly SearchResult[]` | Normalize for autocomplete |

No default export.

---

### Types used from `@/lib/types` (imported, not re-exported)

| Type | Used in |
|---|---|
| `ApiResult<T>` | All return types |
| `FinnhubData` | `fetchFinnhubData` return type |
| `FinnhubQuote` | `getQuote` return type; `isValidQuote` param |
| `FinnhubSymbolMatch` | `searchSymbols` result item; `pickBestSymbol` param; `symbolToSearchResult` param |
| `FinnhubSymbolSearchResponse` | `searchSymbols` return type |
| `FinnhubRecommendation` | `getRecommendations` return type |
| `FinnhubNewsItem` | `getNews` return type |
| `SearchResult` | `toSearchResults` return type; `symbolToSearchResult` return type |

---

### Error logging conventions

- Pattern: `console.error("[finnhub] <functionName> failed", { symbol/query, error: result.error })`
- Never log the full request URL (contains API token).
- Log at the point of sub-failure inside `fetchFinnhubData`; do not re-log in callers.

---

### Edge case table

| Edge case | Handling |
|---|---|
| `FINNHUB_API_KEY` not set | `getApiKey()` returns `""` → 401 from Finnhub → `ApiResult` error propagated upward |
| All-zero quote (unknown symbol) | `isValidQuote(quote)` returns false → `quote: null` in `FinnhubData` |
| No symbol match for query | `pickBestSymbol` returns null → `fetchFinnhubData` returns `{ success: false }` |
| Empty recommendations array `[]` | Valid — no analyst coverage; returned as-is |
| `null` recommendations from Finnhub | Shape validation fails → treated as failure → `recommendations: []` |
| News requires `from`/`to` params | `newsDateRange()` always computes and supplies both |
| News returns 0 items (holiday/weekend) | Valid empty array |
| News item with `image: ""` | Structural — UI must guard against empty string |
| HTTP 429 rate limit | `fetchJson` returns `{ success: false, error: "HTTP 429: Too Many Requests" }` |
| HTTP 403 invalid key | `fetchJson` returns `{ success: false, error: "HTTP 403: Forbidden" }` |
| Malformed JSON body | Caught in `fetchJson` → `{ success: false, error: "Invalid JSON response..." }` |
| Network error | Caught in `fetchJson` → `{ success: false, error: "Network error: ..." }` |
| Partial sub-failure in `fetchFinnhubData` | Logged; sub-field defaults to `null`/`[]`; overall success if symbol resolved |
| Query with special characters | `URLSearchParams` handles percent-encoding |
| Non-US symbol (e.g. `"7203.T"`) | Supported by Finnhub; `jurisdiction` defaults to `"US"` — deferred to Step 9 |
| Query is exact ticker (`"AAPL"`) | Symbol search matches; `pickBestSymbol` returns it directly |
| Delisted symbol | All-zero quote → `isValidQuote` false → `quote: null` |

---

### Verification (after implementation)

1. `npx tsc --noEmit` — zero errors
2. `npm run lint` — zero warnings
3. `node -e "require('./src/lib/datasources/finnhub.ts')"` or equivalent Next.js script:
   - Call `fetchFinnhubData("Apple")` — confirm `symbol === "AAPL"`, `quote !== null`,
     `quote.t !== 0`, `recommendations.length > 0`
   - Call `fetchFinnhubData("INVALID_XXXXXX_COMPANY")` — confirm `success: false`
   - Call `getQuote("AAPL")` — confirm `data.c > 0` and `data.t > 0`
   - Call `searchSymbols("Apple")` — confirm `data.count > 0` and first result is AAPL
4. Grep for `interface`, `enum`, `: any`, `as any` in the file — must return nothing
5. Confirm no default export in the file

---

## Test Companies (must work before demo)
| Company | Expected Sources | Expected Confidence |
|---------|-----------------|-------------------|
| Apple | Finnhub + SEC EDGAR | ★★★ HIGH |
| Revolut | Finnhub + Companies House | ★★☆ MEDIUM |
| Deutsche Bank | Finnhub + GLEIF | ★★☆ MEDIUM |
| SpaceX | Claude fallback | ★☆☆ LOW |

## Review Notes
(Add after each step)
