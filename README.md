# Financial Diligence Assistant

A source-backed diligence and underwriting assistant that distinguishes verified facts, justified inferences, investment judgment, and unknowns that block conviction.

This repo is not an analyst in a box, a Bloomberg alternative, or a recommendation engine that tries to make every company look underwriteable. It is a first-pass diligence system: it assembles available evidence, labels the provenance of that evidence, separates facts from interpretation, and withholds sections when the inputs are too thin or internally inconsistent.

## What This Repo Does

- Resolves public and private company names across market, filing, registry, and web-research sources.
- Tags fact-producing outputs by evidence class: primary filing, registry, market-data vendor, analyst consensus, news reporting, synthesized web research, or model inference.
- Separates the memo into facts, mechanically derived inferences, investment judgment, and unresolved gaps.
- Reconciles valuation inputs before allowing opinionated valuation framing.
- Screens peer sets for business-model relevance before rendering comparable-company analysis.
- Uses company-type driver trees to identify the variables that matter for underwriting.
- Treats private-company analysis as a diligence checklist rather than a pseudo-public-company memo.
- Runs a targeted challenger pass against hidden assumptions, fragile variables, disconfirming signals, growth quality, moat support, and valuation grounding.
- Caches reports and supports a small monitored-company workflow for repeated review.

## Key Features

- **Evidence classes:** Report facts carry provenance labels so the UI can distinguish filing-backed facts from vendor data, registry metadata, consensus context, news, synthesized web research, and model inference.
- **Facts / inferences / judgment split:** The top report view shows what is known, what is inferred from those facts, what judgment is being made, and what remains unknown.
- **Withheld sections:** Peer comparison, priced-in analysis, scenario ranges, private-company thesis sections, and strong recommendations can be withheld with explicit reasons.
- **Source reconciliation:** Market cap, enterprise value, cash/debt, currency, share count, and timestamp mismatches are reconciled before valuation judgment is shown.
- **Peer relevance engine:** Peer rows are screened for business model, monetization model, customer type, margin profile, capital intensity, and regulatory similarity.
- **Driver trees:** Public and private companies are mapped to archetypes such as BNPL fintech, SaaS, AI infrastructure, mega-cap platform, UK retail, industrial B2B, and turnaround.
- **Private diligence gates:** Private reports track revenue, gross margin, retention, concentration, round terms, governance, and unit economics. Missing critical items block thesis generation.
- **Recommendation discipline:** Buy-level language requires resolved reconciliation, adequate evidence depth, peer support or a sound peer-withheld state, meaningful primary or registry evidence, and a bull case not driven only by consensus targets.

## Recommendation Model

Recommendations are constrained by evidence quality. The app can produce restrained outputs even when the business is interesting.

- `buy`: reserved for cases where evidence, reconciliation, valuation support, peer framing, and scenario support clear the required thresholds.
- `hold`: used when the company has enough evidence to be useful, but the case is balanced or better treated as a benchmark.
- `watch`: used when the company is worth follow-up but underwriting support is incomplete.
- `avoid`: used when the evidence is negative, the entity match is weak, the mandate fit breaks, or source tensions make the case hard to defend.

Each report also carries a role:

- `Core target`: mandate-fit company with sufficient underwriting support.
- `Reference public comp`: high-quality public evidence, but better used as a benchmark than a direct target.
- `Private diligence`: private-company read where primary work is still required.
- `Watchlist candidate`: usable lead, but not enough support for a stronger view.
- `Entity resolution case`: company match is too uncertain for investment judgment.

Consensus targets are context, not thesis support. Strong upside from target price alone should not upgrade the recommendation.

## Product Flow

### Company Flow

1. User searches for a company.
2. `/api/search` resolves candidates or returns a private-company match for known private names.
3. `/api/analyze` runs the source waterfall, entity resolution, validation, reconciliation, memo generation, challenger pass, and final report assembly.
4. The UI renders facts, inferences, gaps, driver variables, withheld states, memo notes, valuation context, peer context, and source audit panels.

### Theme Flow

1. User enters an investment theme.
2. `/api/themes` runs Exa-backed thematic research.
3. The app returns relevant companies and exposure notes.
4. Clicking a company opens a full company analysis.

## Architecture

### Agents

- `market-data-agent`: runs the public/private source waterfall.
- `entity-agent`: resolves canonical name and identifiers.
- `validation-agent`: detects coverage gaps and evidence tensions.
- `memo-agent`: builds the memo, evidence layers, driver tree, and conditional depth fields.
- `challenger-agent`: attacks the thesis with targeted challenges.
- `theme-agent`: runs theme exploration.
- `orchestrator`: ties the pipeline together.

### Data Sources

- `Finnhub`: quotes, financial ratios, recommendations, earnings, insider activity, and headlines.
- `FMP`: valuation history, forward estimates, peers, enterprise values, and target-price context.
- `SEC EDGAR`: filing-backed identity and XBRL facts.
- `Companies House`: UK registry and accounts metadata.
- `GLEIF`: legal-entity resolution.
- `Exa Deep`: structured private-company and theme research.
- `Claude fallback`: last-resort web synthesis.
- `Nebius`: optional memo wording overlay and retrieval layer, not a primary data source.

### Storage

Runtime storage is handled by [`src/lib/db.ts`](src/lib/db.ts):

- Turso when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are configured.
- Local SQLite by default through `DATABASE_URL=file:./prisma/dev.db`.
- In-memory fallback if durable storage is unavailable.

## Important Files

- [`src/app/page.tsx`](src/app/page.tsx): main Company/Themes UI.
- [`src/app/api/analyze/route.ts`](src/app/api/analyze/route.ts): analyze entrypoint and cache normalization.
- [`src/lib/agents/orchestrator.ts`](src/lib/agents/orchestrator.ts): main pipeline.
- [`src/lib/investment-memo.ts`](src/lib/investment-memo.ts): recommendation, role, memo, inference, and judgment logic.
- [`src/lib/report-assembly.ts`](src/lib/report-assembly.ts): metrics, evidence classes, fact layer, valuation, Street view, and report panels.
- [`src/lib/gates.ts`](src/lib/gates.ts): deterministic rendering and recommendation gates.
- [`src/lib/reconciliation.ts`](src/lib/reconciliation.ts): source reconciliation.
- [`src/lib/peer-engine.ts`](src/lib/peer-engine.ts): peer relevance scoring.
- [`src/lib/driver-trees.ts`](src/lib/driver-trees.ts): archetype-specific driver requirements.
- [`src/lib/diligence-checklist.ts`](src/lib/diligence-checklist.ts): private-company checklist.
- [`src/lib/agents/challenger-agent.ts`](src/lib/agents/challenger-agent.ts): targeted challenger pass.
- [`src/components/Report.tsx`](src/components/Report.tsx): evidence-led report renderer.

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create `.env.local`

Copy `.env.example` to `.env.local` and fill in the keys you plan to use.

```bash
cp .env.example .env.local
```

Recommended keys:

- `ANTHROPIC_API_KEY`
- `FINNHUB_API_KEY`
- `EXA_API_KEY`
- `FMP_API_KEY`
- `COMPANIES_HOUSE_API_KEY`
- `SEC_EDGAR_USER_AGENT`

Optional:

- `NEBIUS_API_KEY`
- `NEBIUS_BASE_URL`
- `NEBIUS_LLM_MODEL`
- `NEBIUS_EMBED_MODEL`
- `USE_NEBIUS_MEMO`
- `DATABASE_URL`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

### 3. Run The App

```bash
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Useful smoke names:

- Public: `Apple`, `NVIDIA`, `Microsoft`, `Snowflake`, `Klarna`
- Private: `Stripe`, `Anthropic`, `OpenAI`
- UK/global: `Diageo`, `Greggs`, `Rolls-Royce`, `Compass Group`

## Refreshing Evaluation Runs

Use the analyze API with `forceRefresh: true` when cached reports are stale after schema or memo changes.

```bash
npm run dev -- -p 3001
$env:ANALYZE_ENDPOINT='http://localhost:3001/api/analyze'
node scripts/refresh-eval-after.mjs
```

The batch runner writes fresh responses to `eval/after/`.

## Known Limitations

- The app does not replace primary diligence, management calls, data-room review, channel checks, or audited financial analysis.
- Private-company valuations are not treated as reliable pricing when there is no liquid market or primary disclosure.
- Diligence gates can identify missing gross margin, retention, concentration, governance, and unit-economics evidence; they cannot infer those facts safely.
- Reconciliation can flag source mismatches, but it cannot guarantee upstream vendor data is correct.
- Peer screening improves relevance, but peer data still depends on FMP/Finnhub coverage and may be withheld.
- The challenger is model-assisted. It can sharpen review, but it does not replace human judgment.
- External API outages can block fresh runs or search resolution.
- The app is built for first-pass underwriting support, not final investment approval.

## Supporting Docs

- [`before-after.md`](before-after.md): short examples of the output change.
- [`refactor-plan.md`](refactor-plan.md): implementation plan for the stricter architecture.
- [`meta-prompt.md`](meta-prompt.md): product redesign prompt.
- [`tasks/diagrams/`](tasks/diagrams/): architecture diagrams and flow notes.
