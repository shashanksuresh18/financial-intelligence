You are a senior financial analyst, investment-research product architect, and ruthless editor.

Your task is to redesign and refactor this repo so the output stops feeling like a polished source aggregator and starts feeling like a credible underwriting assistant for first-pass diligence.

Do not optimize for prettier prose.
Do not add more generic AI commentary.
Do not preserve weak sections just because the current UI has them.
Optimize for analyst trust, falsifiability, and economic depth.

## Product truth

The current product is strong on:
- report structure
- source aggregation
- data-confidence vs investment-conviction separation
- memo organization
- public/private routing
- overall UX scaffolding

The current product is weak on:
- economic driver depth
- peer relevance and peer-metric density
- valuation credibility
- source/evidence class separation
- hard section withholding when evidence is thin
- private-company underwriting discipline
- explicit unknowns and diligence gates
- company-specific risk and scenario logic

The client feedback is that the product feels shallow.
Assume that criticism is correct.

## Goal

Transform the product from:
“source-backed analyst-style report generator”

into:
“source-backed diligence and underwriting assistant that clearly distinguishes:
1. verified facts,
2. justified inferences,
3. investment judgment,
4. unknowns that block conviction.”

The new version must be narrower, harsher, and more trustworthy.

## Non-negotiable principles

1. Never generate a full analyst-style section unless the evidence is strong enough.
2. Bad peer sets are worse than no peer sets.
3. Quantified bull/bear cases must be withheld unless assumption inputs are explicit and evidence-backed.
4. Every important statement must map to an evidence class.
5. Private-company analysis must prioritize diligence gaps over narrative richness.
6. The system must be willing to say:
   - no valid peer set,
   - valuation withheld,
   - no underwriting view yet,
   - primary diligence required,
   - evidence insufficient for scenario range.
7. Stop treating consensus targets as core thesis inputs; they are context, not thesis.
8. Replace generic finance prose with variable-based reasoning.

## Required redesign

### 1. Evidence architecture
Refactor report assembly so every fact and section is tagged with one of:
- Primary filing-backed
- Registry-backed
- Market-data vendor
- Analyst consensus
- News/reporting
- Synthesized web research
- Model inference

Expose this in the internal report model and surface it in the UI where useful.

### 2. Hard gating and section withholding
Implement deterministic gating so the app does NOT render or synthesize:
- peer comparison if peers fail relevance checks
- priced-in analysis when valuation inputs are unreconciled
- bull/bear scenario ranges when assumption support is weak
- strong recommendation language when the evidence base is thin
- private-company “thesis” sections that exceed the available diligence evidence

Instead show explicit withheld states such as:
- “No valid peer set produced”
- “Valuation view withheld due to unresolved source mismatch”
- “Scenario analysis withheld because key assumptions are unverified”
- “No real underwriting view until primary diligence closes the following gaps”

### 3. Facts / inferences / judgment split
Refactor the report into three logical layers:
- Facts: directly supported source-backed statements only
- Inferences: mechanically or analytically derived observations from facts
- Investment judgment: recommendation/role/conviction only after thresholds are met

Do not blur these layers in either code or UI.

### 4. Company-type driver trees
Implement company archetype-specific underwriting frameworks.

Examples:
- Consumer fintech / BNPL:
  GMV, active users, frequency, merchant count, take rate, funding cost, loss rate, contribution margin, opex ratio
- Software / AI infrastructure:
  ARR/usage revenue mix, gross margin, NDR, concentration, CAC/payback if available, inference cost, burn, runway
- Mega-cap platform tech:
  segment mix, services mix, geography concentration, gross margin, buyback effect, capex intensity, installed-base monetization

Use these driver trees to control memo generation and risk framing.
If the required driver data is missing, the system should elevate that as a block to conviction.

### 5. Peer engine redesign
Refactor peer selection with business-model-aware relevance scoring.
Peers must be screened on:
- business model
- monetization model
- customer type
- margin profile
- capital intensity
- regulatory similarity where relevant

If fewer than a credible minimum number of peers pass, withhold relative valuation instead of showing bad comps.

Then enrich peer rows from available APIs deterministically before display.

### 6. Reconciliation layer
Before any valuation judgment is shown, reconcile:
- market cap
- share count
- enterprise value
- cash / debt inputs if available
- currency
- source timestamps / date alignment

If unresolved, mark valuation as incomplete and withhold opinionated valuation framing.

### 7. Public vs private mode separation
Public-company mode:
- can use filing-backed financial facts, earnings, consensus, valuation context
- must still avoid generic prose and require driver-aware analysis

Private-company mode:
- should behave as a diligence gate, not a pseudo-public-company note
- prioritize:
  - what is verified
  - what is estimated
  - what is missing
  - what is required before underwriting
- add explicit checklist fields such as:
  - revenue verified?
  - gross margin verified?
  - retention verified?
  - concentration verified?
  - round terms reviewed?
  - governance understood?
  - unit economics understood?
- if those are missing, the report must say there is no valid investment view yet

### 8. Challenger redesign
The challenger agent must stop producing generic counterpoints.
It should explicitly attack:
- the main hidden assumption
- the most fragile variable in the thesis
- the fastest disconfirming signal
- whether growth is product-led, pricing-led, subsidy-led, or hype-led
- whether the moat is actually demonstrated
- whether valuation rests on unsupported expectations

Prefer fewer, sharper challenges over many vague ones.

### 9. UI output changes
Change the report UX to emphasize:
- What we know
- What we infer
- What we cannot underwrite yet
- What would change the view
- Top 3 variables that matter
- Missing evidence required for higher conviction

De-emphasize:
- long memo prose
- consensus-target-centric framing
- generic section completeness

### 10. Recommendation discipline
Tighten recommendation logic:
- recommendation should only upgrade when evidence thresholds are met
- conviction should not be inflated by breadth of weak sources
- “Reference public comp” and “Primary diligence required” should remain valid restrained outputs
- “buy” or similarly strong outputs must require deeper support than simple target-price upside or narrative enthusiasm

## Deliverables

1. A concrete refactor plan
   - list of files to change
   - what logic moves where
   - what new types/interfaces are needed
   - where deterministic gating should live
   - where memo generation should become conditional

2. A revised internal report schema
   Include explicit support for:
   - evidence classes
   - withheld sections
   - facts vs inferences vs judgment
   - driver trees
   - reconciliation status
   - diligence checklist for private names

3. Implementation of the new logic
   Modify the repo code directly.

4. Updated UI behavior
   Ensure the rendered report reflects the new stricter logic.

5. Updated README / product positioning
   Reposition the product honestly as a diligence and underwriting assistant, not a fully formed investment analyst.

6. Before/after examples
   Show how Apple, Klarna, and Anthropic outputs change under the stricter system.

## Coding instructions

- Prefer deterministic logic over additional LLM calls.
- Use shorter, harder templates instead of longer generative prose where possible.
- Do not add cost-heavy loops unless clearly justified.
- Reuse existing source integrations.
- Keep memo synthesis optional and subordinate to the grounded pipeline.
- Preserve backward compatibility where practical, but do not protect weak abstractions just because they already exist.

## Output style

Be direct.
Do not flatter the current implementation.
Point out where the current architecture is faking depth.
When in doubt, narrow claims and withhold sections instead of generating polished nonsense.

Start by inspecting the existing architecture and proposing the exact refactor plan before making changes.