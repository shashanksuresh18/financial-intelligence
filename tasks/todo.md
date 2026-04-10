# Financial Intelligence — Task Tracker

## Phase 1: Build

- [x] Step 1: Project scaffold (verify: tsc passes, dev server starts)
- [x] Step 2: Types and interfaces
- [x] Step 3: Finnhub client (verify: call AAPL, log response)
- [x] Step 4: SEC EDGAR client (verify: call Apple CIK, log financials)
- [x] Step 5: Companies House client (verify: search Revolut, log response)
- [ ] Step 6: GLEIF client (verify: search Deutsche Bank, log response)
- [ ] Step 7: Claude fallback client (verify: research SpaceX, log JSON)
- [ ] Step 8: Confidence rating logic
- [ ] Step 9: Waterfall analyzer (verify: test all 4 companies)
- [ ] Step 10: Claude narrative generation (verify: Apple report uses real SEC numbers)
- [ ] Step 11: API routes + Prisma schema (verify: curl each endpoint)
- [ ] Step 12: Frontend dashboard (verify: browser test full flow)
- [ ] Step 13: Final simplification pass

---

## Step 6 Plan — `src/lib/datasources/gleif.ts`

### Overview

Replace the placeholder stub with the real GLEIF REST client. GLEIF (Global Legal
Entity Identifier Foundation) provides a free, public API for looking up any legal
entity worldwide by name or LEI. No API key required.

Base URL: `https://api.gleif.org/api/v1`
Auth: None.
Rate limit: undocumented but generous; well within waterfall usage.
Response format: JSON API (`{ data: [...], meta: { ... } }`).

---

### Environment variables

None required. GLEIF is fully public.

---

### Module-level constants (not exported)

```typescript
const BASE_URL = "https://api.gleif.org/api/v1";
const PAGE_SIZE = 5;
```

`PAGE_SIZE` caps results to keep payloads small. Five matches is enough to pick
the best one and still surface alternatives.

---

### Imports

```typescript
import type {
  ApiResult,
  GleifData,
  GleifRecord,
  GleifSearchResponse,
} from "@/lib/types";
```

`DataSourceResult` is assembled by `analyzer.ts`, not here.

---

### Private helpers (not exported)

**`buildSearchUrl(query: string): string`**
- Returns `${BASE_URL}/lei-records?filter[fulltext]=${encodeURIComponent(query)}&page[size]=${PAGE_SIZE}&page[number]=1`
- `filter[fulltext]` is GLEIF's fuzzy full-text search param.
- Edge case: `encodeURIComponent` handles spaces and special chars in company names.

**`async function fetchGleif<T>(url: string): Promise<ApiResult<T>>`**
- `fetch(url, { headers: { Accept: "application/vnd.api+json" } })`
- GLEIF uses the JSON API content type; `Accept` header avoids any format negotiation.
- Network error → `{ success: false, error: "Network error: ${String(err)}" }`
- Non-OK HTTP → `{ success: false, error: "HTTP ${res.status}: ${res.statusText}" }`
- JSON parse error → `{ success: false, error: "Invalid JSON from GLEIF" }`
- Never throws.

**`function isRecord(value: unknown): value is Record<string, unknown>`**
- Returns `typeof value === "object" && value !== null`
- Used throughout normalization to narrow `unknown` safely.

**`function normalizeGleifName(value: unknown): { name: string; language: string } | null`**
- Returns `null` if value is not an object.
- Requires `name` (string, non-empty) and `language` (string).
- Returns `null` if either is missing.

**`function normalizeGleifAddress(value: unknown): GleifAddress | null`**
- Returns `null` if value is not an object.
- Requires `lang` (string), `city` (string), `country` (string, 2-char ISO).
- `addressLines`: must be an array of strings; defaults to `[]` if missing.
- Optional: `region` (string | undefined), `postalCode` (string | undefined).
- Returns `null` if required fields fail.

**`function normalizeGleifEntity(value: unknown): GleifEntity | null`**
- Returns `null` if value is not an object.
- `legalName`: `normalizeGleifName(value["legalName"])` — required; null → return null.
- `legalAddress`: `normalizeGleifAddress(value["legalAddress"])` — required; null → return null.
- `headquartersAddress`: `normalizeGleifAddress(value["headquartersAddress"])` — required; null → return null.
- `otherNames`: array, map through `normalizeGleifName`, filter nulls; defaults to `[]`.
- `jurisdiction` (string, non-empty) — required; missing → return null.
- `category` (string): defaults to `""` if absent.
- `legalForm`: requires `id` (string); if missing → use `{ id: "" }`.
- `registeredAt`: optional `{ id: string }` — omit if absent or malformed.

**`function normalizeGleifRegistration(value: unknown): GleifRegistration | null`**
- Returns `null` if value is not an object.
- Required string fields: `initialRegistrationDate`, `lastUpdateDate`, `status`,
  `nextRenewalDate`, `managingLou`. Any missing → return null.

**`function normalizeGleifRecord(value: unknown): GleifRecord | null`**
- Returns `null` if value is not an object.
- `type` (string), `id` (string, non-empty) — required; missing → return null.
- `attributes`: isRecord check, then:
  - `lei` (string, non-empty) — required.
  - `entity`: `normalizeGleifEntity(attributes["entity"])` — required; null → return null.
  - `registration`: `normalizeGleifRegistration(attributes["registration"])` — required; null → return null.

**`function normalizeSearchResponse(value: unknown): GleifSearchResponse | null`**
- Returns `null` if value is not an object.
- `data` must be an array; otherwise return null.
- `meta`: `{ total: number, page: number }` — extract if present, else `{ total: 0, page: 1 }`.
- Maps `data` through `normalizeGleifRecord`, filters nulls.
- Returns normalized `GleifSearchResponse`.

**`function pickBestMatch(records: readonly GleifRecord[], query: string): GleifRecord | null`**
- Returns `null` if array is empty.
- Priority order:
  1. Exact legal name match (case-insensitive) **and** `registration.status === "ISSUED"`.
  2. Exact legal name match regardless of status.
  3. `registration.status === "ISSUED"` (any name match).
  4. First result.
- Pure function, no side effects.
- Edge case: "Deutsche Bank" → many hits → exact + ISSUED wins.

---

### Exported function (1)

**`export async function fetchGleifData(query: string): Promise<ApiResult<GleifData>>`**

Primary entry point for the waterfall analyzer.

Steps:
1. `buildSearchUrl(query)` → `fetchGleif<unknown>(url)`.
2. If fetch fails → log error, return `{ success: false, error }`.
3. `normalizeSearchResponse(result.data)`.
4. If null → log error, return `{ success: false, error: "Unexpected GLEIF response shape" }`.
5. If `normalized.data.length === 0`:
   - Log: `console.error("[gleif] no results", { query })`
   - Return `{ success: false, error: "No GLEIF results for: \"${query}\"" }`.
6. `pickBestMatch(normalized.data, query)` → `record`.
7. Return:
   ```
   {
     success: true,
     data: {
       record,
       allMatches: normalized.data,
     },
   }
   ```

---

### Exports — complete list

| Export | Signature | Purpose |
|---|---|---|
| `fetchGleifData` | `(query: string) => Promise<ApiResult<GleifData>>` | Waterfall entry point |

No default export.

---

### Edge case table

| Edge case | Handling |
|---|---|
| Common name → many hits | `pickBestMatch` ranks: exact+ISSUED > exact > ISSUED > first |
| LAPSED LEI | Included in results; confidence module uses status to downgrade |
| No results (private/thin company) | `{ success: false, error: "No GLEIF results..." }` |
| Non-English legal name | `legalName.language` preserved; `otherNames` array carries variants |
| Missing `headquartersAddress` | `normalizeGleifEntity` returns null → record skipped |
| `otherNames` absent | Defaults to `[]` in entity normalization |
| `registeredAt` absent (many entities) | Optional field — omitted from result |
| `legalForm.id` missing | Falls back to `{ id: "" }` rather than dropping the record |
| JSON API content type | `Accept: application/vnd.api+json` header sent on every request |

---

### Verification (after implementation)

1. `npx tsc --noEmit` — zero errors
2. `npm run lint` — zero warnings
3. Test `fetchGleifData("Deutsche Bank")`:
   - `data.record.attributes.lei` is non-empty
   - `data.record.attributes.registration.status === "ISSUED"`
   - `data.record.attributes.entity.legalName.name` contains "Deutsche Bank"
   - `data.allMatches.length > 0`
4. Test `fetchGleifData("Apple Inc")`:
   - Returns a valid LEI record
5. Test `fetchGleifData("xyzxyzxyz-no-such-company-123")`:
   - Returns `{ success: false, error: "No GLEIF results..." }`
