# Financial Intelligence — Company Analysis Tool

## What This Project Does
AI-powered company analysis dashboard. User enters any company name → system routes through 5 free data sources → Claude API synthesizes a structured analyst report with confidence ratings.

## Tooling
- **Always use `npm`, not `yarn` or `pnpm`.**
- Framework: Next.js 15 (App Router, TypeScript strict mode)
- Styling: Tailwind CSS only, no external component libraries
- Database: SQLite via Prisma
- AI: Anthropic Claude API (Sonnet 4.6 for narrative synthesis)
- Deployment: Vercel

## Commands
```sh
# 1. Dev server
npm run dev

# 2. Typecheck (run before every commit)
npx tsc --noEmit

# 3. Lint
npm run lint

# 4. Tests
npm test
npm test -- --testPathPattern="finnhub"   # Specific file

# 5. Format
npx prettier --write "src/**/*.{ts,tsx}"

# 6. Database
npx prisma db push
npx prisma studio

# 7. Verify APIs manually
curl "https://finnhub.io/api/v1/quote?symbol=AAPL&token=$FINNHUB_API_KEY"
curl "https://api.gleif.org/api/v1/lei-records?filter[fulltext]=Apple"
curl "https://api.company-information.service.gov.uk/search/companies?q=Revolut" -u "$COMPANIES_HOUSE_API_KEY:"
```

## Architecture Rules
- Claude API is the SYNTHESIS layer only. Never the data source.
- Every number in a report must be traceable to a structured data source.
- If data comes from web search fallback, flag it as ★☆☆ low confidence.
- All API clients in `src/lib/datasources/` — one file per source.
- Every data source call wrapped in try/catch. Failures log and continue to next source.
- Never silently swallow errors. Log detailed context server-side.
- Validate all external API responses before using them. Never trust external data blindly.

## Data Source Waterfall (try in this order)
1. **Finnhub** (free, 60 calls/min) — symbol search, quotes, analyst recommendations, news
2. **SEC EDGAR** (free, no key) — US public company filings, XBRL financial facts
3. **Companies House UK** (free, 600 req/5min) — UK company registry data
4. **GLEIF** (free, no key) — global legal entity lookup, fuzzy search, ownership data
5. **Claude API + web search** (last resort only) — private/thin-data companies

## Confidence Rating Logic
```
★★★ HIGH   — SEC filing data present (XBRL financials parsed successfully)
★★☆ MEDIUM — Market API data (Finnhub/Companies House/GLEIF matched, no SEC filing)
★☆☆ LOW    — Web-search derived only (Claude fallback was primary data source)
```

## Code Style (TypeScript)
- Prefer `type` over `interface`
- **Never use `enum`**; use string literal unions instead
- Keep functions small and composable — single responsibility
- File organization: many small files. 200-400 lines typical, 800 max.
- Organize by feature/domain, not by type
- Always create new objects, never mutate existing ones
- Server components by default; `"use client"` only when needed
- All API routes return typed JSON responses
- No `any` types. TypeScript strict mode everywhere.
- Validate all user input at system boundaries. Fail fast with clear messages.
- Handle errors at every level. Provide user-friendly messages in UI, log detailed context server-side.
- Commit messages: imperative mood, < 72 chars

## Forbidden Patterns
- Do NOT use `any` type
- Do NOT use `enum` — use string literal unions
- Do NOT mutate objects or arrays in place
- Do NOT commit API keys or secrets (use .env.local)
- Do NOT use Claude API as a data source — only as synthesis
- Do NOT skip verification after implementation
- Do NOT modify linter/formatter configs to suppress warnings — fix the actual code
- Do NOT use `--no-verify` on git commits

## Verification Requirements (non-negotiable)
- **Never mark a task complete without proving it works.**
- After building a data source client: call the real API, inspect the response, confirm types match.
- After building the analyzer: test with "Apple" (US), "Revolut" (UK), "Deutsche Bank" (GLEIF), "SpaceX" (fallback).
- After changing entity resolution, verify primary-listing selection and ambiguity filtering with HSBC, Shell, Virgin, Apple, and Microsoft scenarios.
- In entity resolution, only explicitly-listed primary exchange suffixes qualify as Tier 0. Unknown 1-2 letter suffixes default to Tier 1, and ADR promotion must prefer Tier 0 common stock before Tier 1 fallback.
- When fixing a regression, verify the guard sits on the live execution path end-to-end; scoring tweaks or mount-time restores do not count unless refreshed UI state and waterfall routing prove the fix.
- After building the frontend: open browser, test search, confirm report renders with confidence badge.
- Run typecheck and lint before every commit.
- Ask yourself: "Would a senior engineer approve this?"

## Workflow (Plan → Build → Verify → Simplify)
1. **Plan first** — use `/plan` for anything touching 2+ files. Do not edit until plan is approved.
2. **Implement** — follow the plan, keep changes minimal. Impact only what's necessary.
3. **Self-verify** — run typecheck, lint, tests. Call actual APIs. Demonstrate correctness.
4. **Simplify** — for non-trivial changes, pause and ask "is there a more elegant way?"
5. **Document** — update tasks/todo.md, mark items complete.

## Self-Improvement Loop
- After ANY correction from the user:
  1. Fix the issue immediately
  2. Update `tasks/lessons.md` with what went wrong and the rule to prevent it
  3. If the mistake could recur, add the rule to this CLAUDE.md
- Review tasks/lessons.md at session start for relevant patterns

## Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them.
- Zero context switching required from the user.
- Go fix failing tests without being told how.

## Project Structure
```
src/
├── app/
│   ├── page.tsx                    # Main dashboard UI
│   ├── layout.tsx
│   └── api/
│       ├── analyze/route.ts        # Main orchestrator endpoint
│       ├── search/route.ts         # Company search/autocomplete
│       └── monitor/route.ts        # CRUD monitor list
├── lib/
│   ├── datasources/
│   │   ├── finnhub.ts              # Finnhub API client
│   │   ├── sec-edgar.ts            # SEC EDGAR direct API client
│   │   ├── companies-house.ts      # UK Companies House client
│   │   ├── gleif.ts                # GLEIF entity lookup
│   │   └── claude-fallback.ts      # Claude web search (last resort)
│   ├── analyzer.ts                 # Waterfall routing + data assembly
│   ├── claude-narrative.ts         # Claude API narrative generation
│   ├── confidence.ts               # Confidence rating logic
│   ├── types.ts                    # All shared TypeScript types
│   └── db.ts                       # Prisma client
├── components/
│   ├── SearchBar.tsx
│   ├── Report.tsx
│   ├── ConfidenceBadge.tsx
│   ├── FinancialTable.tsx
│   ├── AnalystConsensus.tsx
│   └── MonitorList.tsx
tasks/
├── todo.md
└── lessons.md
prisma/
└── schema.prisma
.claude/
├── commands/
├── agents/
├── rules/
├── hooks/
└── settings.json
```
