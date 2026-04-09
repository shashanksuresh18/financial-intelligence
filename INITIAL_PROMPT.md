# Financial Intelligence — Claude Code Build Prompt

Read CLAUDE.md first. Then build this project step by step.

## Session Rules
- Start every step with /plan. Do not edit code until the plan is approved.
- After each step, verify it works by running typecheck and calling real APIs.
- If something goes wrong, STOP and re-plan. Do not brute-force forward.
- Track progress in tasks/todo.md. Mark items complete as you go.
- After any correction from me, update tasks/lessons.md.

## Step 1: Project Scaffold
/plan then execute:
- Create Next.js 15 project with TypeScript, Tailwind CSS, App Router
- Initialize Prisma with SQLite
- Create the full directory structure from CLAUDE.md
- Install: @anthropic-ai/sdk, prisma, @prisma/client
- Set up .env.local from .env.example
- Add prettier config
- Verify: npx tsc --noEmit passes, npm run dev starts

## Step 2: Types (src/lib/types.ts)
/plan then execute:
- CompanyData, FinancialData, ValuationData, AnalystData
- RiskItem, CatalystItem, ConfidenceLevel, DataSourceResult, AnalysisReport
- Verify: typecheck passes

## Step 3: Finnhub Client (src/lib/datasources/finnhub.ts)
/plan then execute:
- searchCompany, getQuote, getRecommendations, getBasicFinancials, getCompanyProfile, getCompanyNews
- Verify: call each with AAPL, log response

## Step 4: SEC EDGAR Client (src/lib/datasources/sec-edgar.ts)
/plan then execute:
- searchCompany, getCompanyFacts, getFilings
- Parse XBRL into revenue, net income, total assets
- Verify: call with Apple CIK 0000320193, log financials

## Step 5: Companies House Client (src/lib/datasources/companies-house.ts)
/plan then execute:
- searchCompany, getCompanyProfile, getOfficers, getFilingHistory
- Verify: search Revolut, log response

## Step 6: GLEIF Client (src/lib/datasources/gleif.ts)
/plan then execute:
- searchEntity, getEntityByLEI, getRelationships
- Verify: search Deutsche Bank and Stripe, log responses

## Step 7: Claude Fallback (src/lib/datasources/claude-fallback.ts)
/plan then execute:
- webResearch with multi-turn tool use loop (server-side, up to 10 turns)
- LAST RESORT only
- Verify: research SpaceX, confirm JSON

## Step 8: Confidence Rating (src/lib/confidence.ts)
- HIGH if sec-edgar in sources
- MEDIUM if finnhub/companies-house/gleif in sources
- LOW if only claude-fallback

## Step 9: Waterfall Analyzer (src/lib/analyzer.ts)
/plan then execute:
- Finnhub → SEC → Companies House → GLEIF → Claude fallback
- Verify: Apple (★★★), Revolut (★★☆), Deutsche Bank (★★☆), SpaceX (★☆☆)

## Step 10: Claude Narrative (src/lib/claude-narrative.ts)
/plan then execute:
- generateReport: single Claude API call, NO web search, only interprets given data
- Verify: Apple report uses real SEC numbers

## Step 11: API Routes + Prisma
/plan then execute:
- POST /api/analyze, GET /api/search, GET/POST/DELETE /api/monitor
- Prisma schema for MonitoredCompany
- Verify: curl each endpoint

## Step 12: Frontend Dashboard
/plan then execute:
- SearchBar, Report, ConfidenceBadge, FinancialTable, AnalystConsensus, MonitorList
- Dark theme, professional financial aesthetic, Tailwind only
- Verify: browser test full flow

## Step 13: Final Review
- Remove dead code, simplify, ensure files under 400 lines
- Test all 4 companies one final time
- Commit: "feat: complete financial intelligence dashboard v1"
