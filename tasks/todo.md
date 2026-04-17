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
- [x] Step 10: Claude narrative generation (verify: Apple report uses real SEC numbers)
- [x] Step 11: API routes + Prisma schema (verify: curl each endpoint)
- [x] Step 12: Frontend dashboard (verify: browser test full flow)
- [x] Step 13: Final simplification pass

## Phase A: Memo-First Refactor

- [x] Step 1: Claude Code — Refactor UI

## Phase B: Entity Disambiguation

- [x] Step 4 & 5: Rank multiple candidates by market cap, prefer holding company, flag ambiguous names below 50% confidence.
- [x] Step 6: Phase 2 entity disambiguation — suppress description-noise matches, demote ADRs and Tier 2 instruments, and skip Companies House for strong US common-stock resolutions.

---

## Project Status — Complete

All 13 steps shipped. Final verification (Step 13):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✓ zero errors |
| `npm run lint` | ✓ zero errors (added `.claude/**` and `src/generated/**` to ESLint ignore — both are non-app infrastructure) |
| `npm run dev` | ✓ starts in ~2.6s on port 3002 |
| No `any` in source | ✓ (only in auto-generated Prisma client) |
| No `enum` in source | ✓ all string literal unions |
| No `interface` in source | ✓ all `type` |
| No mutations | ✓ spread / map / filter throughout |
| All components Tailwind-only, dark theme | ✓ zinc-950 base, emerald/amber/rose accents |
| All 5 datasources imported in analyzer.ts | ✓ finnhub, sec-edgar, companies-house, gleif, claude-fallback |
| All API routes return typed JSON | ✓ `NextResponse<AnalyzeApiResponse \| SearchApiResponse \| MonitorApiResponse>` |
| File size limits (800-line hard cap) | ✓ largest hand-written file: sec-edgar.ts at 591 lines |
| No hardcoded secrets | ✓ all keys in .env.local |
| Dead code / unused imports | ✓ none found |

### Architecture summary

```
Search flow:   GET /api/search?q= → [Finnhub + Companies House + GLEIF] parallel → unified SearchResult[]
Analyze flow:  POST /api/analyze  → waterfall [Finnhub + SEC EDGAR + CH + GLEIF] parallel
                                   → Claude fallback if all fail
                                   → computeConfidence → generateNarrative → AnalysisReport
                                   → 24-hour SQLite cache
Monitor flow:  GET/POST/DELETE /api/monitor → SQLite (custom adapter, no Prisma ORM at runtime)
```

### Confidence tiers (CLAUDE.md)

| Tier | Condition | Score |
|---|---|---|
| ★★★ HIGH | SEC EDGAR XBRL facts present | 85 |
| ★★☆ MEDIUM | Finnhub / Companies House / GLEIF matched | 60 |
| ★★☆ MEDIUM | SEC company info only (no XBRL) | 40 |
| ★☆☆ LOW | Claude fallback only | 25 |
| ★☆☆ LOW | No sources | 10 |

### Known notes

- `db.ts` uses a custom SQLite adapter (executes `sqlite3` CLI directly) rather than
  Prisma ORM at runtime. The Prisma schema + `prisma db push` are used for schema
  documentation and migration tracking only. `prisma.config.ts` handles the
  Prisma 7 connection URL (no longer in schema.prisma).
- `sec-edgar.ts` is 591 lines — above the 200–400 typical range but well under the
  800-line hard cap. Splitting it would harm cohesion (all logic is one domain).
