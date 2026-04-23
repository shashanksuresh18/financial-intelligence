# Financial Intelligence

Source-backed company analysis for fast diligence. This app combines structured market, filing, registry, and private-company research into an analyst-style report with separate data-confidence and investment-conviction framing, memo synthesis, challenger review, recent developments, and thematic exploration.

## What This Repo Does

- Analyze public companies with filing-backed and market-data-backed evidence.
- Analyze private companies with Exa Deep research and a thinner fallback path when primary disclosure is limited.
- Generate an investment memo, then stress-test it with a report-aware challenger agent.
- Surface recent developments, news sentiment, valuation context, coverage gaps, and evidence tensions.
- Explore investment themes and click through from a theme to a company analysis.
- Cache reports and keep a small monitored-company list.

## Product Flow

### Company flow

1. User searches for a company on the Company tab.
2. `/api/search` resolves candidates from public sources or returns a synthetic private-company match for known private names.
3. `/api/analyze` runs the orchestrated pipeline:
   - market-data waterfall
   - entity resolution
   - validation and confidence scoring
   - report assembly
   - draft memo generation
   - challenger review
   - final memo generation
   - optional Nebius memo rewrite
4. The UI renders the report, recent developments, memo, evidence audit, analyst-help tooltips, and monitoring controls.

### Theme flow

1. User enters a theme on the Themes tab.
2. `/api/themes` runs the theme agent with Exa Deep research.
3. The app returns an exposure map of relevant companies.
4. Clicking a company switches back to the Company tab and runs a full analysis.

## Current Architecture

### Agents

- `market-data-agent`: runs the public/private source waterfall
- `entity-agent`: canonical name and identifier resolution
- `validation-agent`: coverage quality, tensions, and gap detection
- `memo-agent`: deterministic memo plus optional Nebius synthesis overlay
- `challenger-agent`: attacks the draft memo with report-aware assumptions, gaps, and counter-scenarios
- `theme-agent`: Exa-powered thematic research
- `orchestrator`: step runner that ties the pipeline together

### Data sources

- `Finnhub`: quotes, financial ratios, recommendations, earnings, insider activity, headlines
- `FMP`: valuation history, forward estimates, peer framing, target-price context
- `SEC EDGAR`: filing-backed identity and XBRL financial facts
- `Companies House`: UK registry and accounts metadata
- `GLEIF`: legal-entity resolution
- `Exa Deep`: private-company structured web research and theme exploration
- `Claude fallback`: last-resort web-synthesis path
- `Nebius`: optional memo-synthesis and retrieval layer, not a primary data source

### Storage

Runtime storage is handled by [`src/lib/db.ts`](src/lib/db.ts), which uses:

- Turso if `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are configured
- local SQLite by default via `DATABASE_URL=file:./prisma/dev.db`
- in-memory fallback if durable storage is unavailable

The Prisma schema in [`prisma/schema.prisma`](prisma/schema.prisma) documents the `MonitoredCompany` and `AnalysisCache` tables.

## Key Features In The Current App

- Company analysis with report caching
- Theme exploration with click-through to company analysis
- Recommendation plus separate analyst `role` classification
- Explicit separation between `Data Confidence` and `Investment Conviction`
- Display-layer private-company labels like `Primary diligence required` and `Pass for now`
- Public-comp / out-of-mandate handling for mega-cap names
- Recent Developments panel near the top of the report
- News sentiment rollup from recent headlines
- Evidence signals, coverage gaps, disagreement notes, section audit, and analyst-help tooltips
- Watchlist / monitor list support
- Private-company handling for names like Stripe, SpaceX, Anthropic, OpenAI, and xAI

## Important Files

- `src/app/page.tsx`: main Company/Themes UI
- `src/app/api/analyze/route.ts`: report fetch, cache normalization, analyze entrypoint
- `src/app/api/search/route.ts`: autocomplete and private-company search routing
- `src/app/api/themes/route.ts`: theme exploration API
- `src/lib/agents/orchestrator.ts`: main analysis pipeline
- `src/lib/investment-memo.ts`: recommendation, role, verdict, and memo logic
- `src/lib/confidence.ts`: data-confidence weighting, caps, and underwriting-quality penalties
- `src/lib/agents/challenger-agent.ts`: report-aware challenger generation and false-positive filtering
- `src/lib/report-assembly.ts`: metrics, valuation, street view, earnings, news extraction
- `src/lib/recent-developments.ts`: recent developments ranking and private fallback parsing
- `src/lib/news-sentiment.ts`: deterministic finance-news sentiment scoring
- `src/lib/nebius-memo.ts`: optional Nebius memo synthesis
- `src/components/Report.tsx`: top-level report renderer
- `src/components/SectionInfoTooltip.tsx`: reusable analyst-help info icon and tooltip

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env.local`

Copy `.env.example` to `.env.local` and fill in the keys you plan to use.

```bash
cp .env.example .env.local
```

### 3. Recommended environment variables

#### Core

- `ANTHROPIC_API_KEY`
- `FINNHUB_API_KEY`
- `EXA_API_KEY`

#### Strongly recommended

- `COMPANIES_HOUSE_API_KEY`
- `SEC_EDGAR_USER_AGENT`

#### Optional but useful

- `FMP_API_KEY`
- `NEBIUS_API_KEY`
- `NEBIUS_BASE_URL`
- `NEBIUS_LLM_MODEL`
- `NEBIUS_EMBED_MODEL`
- `USE_NEBIUS_MEMO`
- `DATABASE_URL`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

### 4. Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Verification Commands

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Useful smoke tests after setup:

- Company tab: `Apple`, `NVIDIA`, `Tesla`, `Stripe`, `SpaceX`
- Thin private-name behavior: `Anthropic`, `OpenAI`, `xAI`
- Themes tab: `AI inference chips`, `BNPL payments`

## Recommendation Model

The app does not treat recommendation as the only output. Each report includes:

- `recommendation`: `buy`, `hold`, `watch`, or `avoid`
- `conviction`: low / medium / high
- `role`: `Core target`, `Reference public comp`, `Private diligence`, `Watchlist candidate`, or `Entity resolution case`
- `mandateFit`: aligned, borderline, or out of mandate

This matters because a company can be high-quality but still be better treated as a benchmark or reference comp rather than a direct target.

### Analyst-facing label behavior

The internal recommendation enum stays stable for compatibility, but the UI can render a more analyst-friendly display label:

- thin private `watch` can render as `Primary diligence required`
- thin private `avoid` caused mainly by insufficient evidence can render as `Pass for now`
- visible `Avoid` is reserved for cases where the read is genuinely negative beyond thin evidence

## Data Confidence vs Investment Conviction

The app separates the evidence question from the investment question:

- `Data Confidence`: how strong the evidence base is
  This reflects entity match, source quality, freshness, filing depth, valuation support, and underwriting-quality evidence.
- `Investment Conviction`: how strong the actual investment case is
  A company can have high-quality public evidence and still only merit low conviction if the upside is conditional, mandate fit is weak, or downside is hard to defend.

This separation is visible in the report header and memo hero.

## Notes On Public vs Private Companies

### Public companies

Best results come from a strong mix of:

- SEC EDGAR identity and XBRL facts
- Finnhub market and earnings data
- FMP valuation and forward-estimate context

### Private companies

Private-company reports are intentionally more conservative. They often rely on:

- Exa Deep structured web research
- public estimates of revenue, funding, valuation, and investors
- thinner primary-disclosure support

That means the app can still produce a useful first-pass diligence note, but the right read is often:

- interesting business, but not yet underwriteable
- primary diligence required before conviction can increase
- mandate fit may remain borderline or out of threshold for very early-stage names

The product is designed to avoid turning thin evidence into a falsely harsh fundamental verdict.

## Report UX

The top of the report is meant to read like an investment note, while the lower panels preserve auditability.

- top of report: recommendation, mandate fit, role, data confidence, investment conviction, recent developments, and memo
- lower sections: supporting evidence, source attribution, confidence mechanics, Street context, entity resolution, and section support

Each major section includes a small info icon with short analyst guidance on what the section means and how to interpret it.

## Known Limitations

- Private-company analysis can still be thin when management materials or primary disclosures are unavailable.
- Recent developments for private companies currently come from compressed Exa research strings, so categorization can be useful but still somewhat generic.
- Data Confidence is more conservative than earlier builds, but still depends on upstream source quality and current gap/tension detection.
- Challenger output is materially better, but it is still model-assisted rather than fully deterministic.
- Nebius improves memo wording, but the grounded pipeline remains the source of truth.
- Some valuation and peer panels are much stronger when `FMP_API_KEY` is configured.

## Supporting Docs

- [`CLAUDE.md`](CLAUDE.md): project rules and engineering constraints
- [`INITIAL_PROMPT.md`](INITIAL_PROMPT.md): original build prompt
- [`tasks/handoff.md`](tasks/handoff.md): implementation and verification history
- [`tasks/diagrams/01-complete-flow.md`](tasks/diagrams/01-complete-flow.md): end-to-end flow
- [`tasks/diagrams/02-agent-orchestration.md`](tasks/diagrams/02-agent-orchestration.md): agent sequence
- [`tasks/diagrams/04-agent-responsibilities.md`](tasks/diagrams/04-agent-responsibilities.md): agent specs
- [`tasks/finance-llm-resource-review.md`](tasks/finance-llm-resource-review.md): saved notes on finance LLM ideas and tooling

## Current Status

This repo is beyond the original MVP scaffold. The current system includes:

- multi-agent orchestration
- theme exploration
- public/private routing hardening
- report-aware memo challenger flow
- Nebius memo integration
- recent developments and finance-news sentiment
- analyst-style recommendation plus role classification
- explicit data-confidence vs investment-conviction framing
- section-help tooltips for analyst UX

The next high-value work is likely deeper private-company evidence, stronger retrieval corpora, and more analyst-grade valuation / unit-economics support.
