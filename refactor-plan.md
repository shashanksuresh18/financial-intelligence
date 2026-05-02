# Refactor Plan — Investment Intelligence Underwriting Upgrade

*Based on meta-prompt.md. All paths are relative to `src/`. Written against the live codebase as of the current commit.*

---

## Preamble: Architecture Honesty

The current system is a well-engineered source aggregator that **pretends to be an underwriting assistant**. The memo-agent synthesizes depth fields unconditionally, the challenger generates vague counterpoints, peers are shown even when the set is incoherent, and `'buy'` can be issued on thin evidence when consensus targets imply upside. The following plan makes the product narrower and harsher, which is the correct direction.

Fields that shipped recently and must not regress:
`thesisDrivers`, `bullCase`, `bearCase`, `pricedInAnalysis`, `comparablesAnchor`, `whatWouldChangeTheCall`,
and all `LegacyInvestmentMemo` fields: `verdict`, `thesis`, `antiThesis`, `businessSnapshot`, `valuationCase`, `upsideCase`, `downsideCase`, `keyRisks`, `catalystsToMonitor`, `verifiedFacts`, `reasonedInference`, `unknowns`, `logic`.

---

## Section 1 — Evidence Architecture

### 1.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `lib/types.ts` | modify | Add `EvidenceClass` string-literal union. Add `evidenceClass` field to `EvidenceAnchor`, `FinancialMetric`, and `EvidenceSignal`. These are all optional (?) additions so existing data continues to compile. |
| `lib/report-assembly.ts` | modify | In `assembleMetrics`, map each metric's `source` field to its `EvidenceClass` using the canonical source→class table. In `buildPeerComparison` and `buildStreetView`, attach `evidenceClass` where determinable. |
| `lib/agents/memo-agent.ts` | modify | In `buildEvidenceAnchors`, extend each `EvidenceAnchor` with `evidenceClass` derived from source. Add `inferredAnchors` for Claude-synthesized depth fields tagged as `'model-inference'`. |

### 1.2 New Types

```typescript
// src/lib/types.ts

export type EvidenceClass =
  | 'primary-filing'      // SEC XBRL facts, CH full accounts
  | 'registry'           // CH basic profile, GLEIF LEI record
  | 'market-data-vendor' // Finnhub quotes/financials, FMP multiples/estimates
  | 'analyst-consensus'  // Finnhub recommendations, FMP price-target consensus
  | 'news-reporting'     // Finnhub news, Exa headlines
  | 'synthesized-web'    // Exa Deep Research overview, claude-fallback narrative
  | 'model-inference';   // Claude-synthesized fields: thesisDrivers, bullCase, etc.

// Canonical source → class mapping (deterministic, not inferred):
// 'sec-edgar'         → 'primary-filing'
// 'companies-house'   → 'registry' (CH profile) or 'primary-filing' (if full accounts parsed)
// 'gleif'             → 'registry'
// 'finnhub'           → 'market-data-vendor' (quotes/metrics) | 'analyst-consensus' (recs/targets) | 'news-reporting' (news)
// 'fmp'               → 'market-data-vendor' (multiples/EV) | 'analyst-consensus' (price targets/estimates)
// 'exa-deep'          → 'synthesized-web'
// 'claude-fallback'   → 'synthesized-web'
// Claude depth output → 'model-inference'

// Augment existing types (additive only):
export type EvidenceAnchor = {
  readonly id: string;
  readonly source: DataSource;
  readonly label: string;
  readonly value: string;
  readonly period: string | null;
  readonly evidenceClass?: EvidenceClass;        // NEW
};

export type FinancialMetric = {
  readonly label: string;
  readonly value: number | string | null;
  readonly format?: 'currency' | 'number' | 'percent';
  readonly period?: string;
  readonly source?: DataSource;
  readonly evidenceClass?: EvidenceClass;        // NEW
};

export type EvidenceSignal = {
  readonly title: string;
  readonly detail: string;
  readonly tone: 'positive' | 'negative' | 'neutral';
  readonly sources: readonly DataSource[];
  readonly evidenceClass?: EvidenceClass;        // NEW — highest-trust source in sources[]
};
```

### 1.3 Deterministic Gating Logic

None in this section — S1 is tagging infrastructure consumed by S2–S6 gates.

### 1.4 Conditional Memo Generation

No memo generation changes. Only data enrichment: every evidence anchor now carries its class. The class is propagated into the LLM context in `buildDepthPromptPayload` so the model can reference it in driver interpretations.

### 1.5 Backward Compatibility

All three type augmentations use `readonly field?: Type` — existing cached reports deserialize without `evidenceClass` and the field resolves to `undefined`. UI components must treat `undefined` as "class unknown" and show no badge. Zero schema breakage.

### 1.6 Implementation Sequencing

**Step 1** (ship alone). No behavior change. Pure tagging.

### 1.7 Effort Estimate

**4 hours.** One engineer: types (1h), `assembleMetrics` mapping (1.5h), `buildEvidenceAnchors` (1h), typecheck/lint pass (0.5h).

### 1.8 Risk Register

**Risk:** FMP peers endpoint returns multiples that FMP itself derived from SEC filings — tagging these as `'market-data-vendor'` understates their provenance.
**Mitigation:** Never promote vendor-derived data to `'primary-filing'`. If FMP sourced it from SEC, the SEC source itself is available via `sec-edgar` — use that. Vendor tag is correct for FMP.

---

## Section 2 — Hard Gating and Section Withholding

### 2.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `lib/gates.ts` | **new** | All five deterministic gate functions. Single source of truth for "can this section render?" logic. Pure functions, zero I/O. |
| `lib/types.ts` | modify | Add `WithheldSection`, `WithheldSectionReason` types. Extend `AnalysisReport` with `withheldSections`. |
| `lib/agents/orchestrator.ts` | modify | After building `confidence`, `valuationView`, `reconciliationStatus` (S6), call gate functions. Pass resulting `withheldSections[]` into `memoContext` so `runMemoAgent` can skip expensive LLM depth calls for withheld sections. |
| `lib/agents/memo-agent.ts` | modify | `synthesizeDepthFields` accepts `withheldSections` parameter. Skips LLM calls for `pricedInAnalysis` if `'priced-in-analysis'` is withheld, `bullCase`/`bearCase` if `'scenario-range'` is withheld, `thesisDrivers` if `'private-thesis'` is withheld. |
| `components/InvestmentMemoPanel.tsx` | modify | For each optional depth section, check `withheldSections` before rendering. Render `WithheldNotice` component instead of empty/null sections. |
| `components/PeerComparisonPanel.tsx` | modify | Render `"No valid peer set produced"` state when `'peer-comparison'` is withheld. |
| `components/ValuationOverviewPanel.tsx` | modify | Render `"Valuation view withheld — source mismatch unresolved"` when `'priced-in-analysis'` is withheld. |

### 2.2 New Types

```typescript
// src/lib/types.ts

export type WithheldSectionReason =
  | 'insufficient-peer-relevance'      // fewer than min peers passed relevance check
  | 'unreconciled-valuation-inputs'   // ReconciliationStatus.blocksValuationView === true
  | 'weak-assumption-support'         // thesisDrivers count < 2 or all 'model-inference'
  | 'thin-evidence-base'             // confidence.level === 'low' with no primary filing
  | 'private-diligence-insufficient' // DiligenceChecklist.blockThesis === true
  | 'no-filing-depth';               // sec-edgar absent for a public-routing company

export type WithheldSection = {
  readonly section:
    | 'peer-comparison'
    | 'priced-in-analysis'
    | 'scenario-range'
    | 'strong-recommendation'
    | 'private-thesis';
  readonly reason: WithheldSectionReason;
  readonly userMessage: string;       // shown verbatim in the UI
};

// Extend AnalysisReport:
// readonly withheldSections: readonly WithheldSection[];   // NEW — replaces implicit undefined behaviour
```

### 2.3 Deterministic Gating Logic

All functions live in `src/lib/gates.ts`. Return type is always `boolean`. No async, no LLM.

```typescript
// src/lib/gates.ts

import type {
  ConfidenceScore,
  DiligenceChecklist,
  InvestmentRecommendation,
  PeerRelevanceScore,
  ReconciliationStatus,
  RecommendationLogic,
  ThesisDriver,
  ValuationView,
  WithheldSection,
} from '@/lib/types';

/** Gate: should the peer-comparison panel render? */
export function canRenderPeerPanel(
  peerRelevanceScores: readonly PeerRelevanceScore[],
  minPassCount = 2,
): boolean {
  return peerRelevanceScores.filter(s => s.passes).length >= minPassCount;
}

/** Gate: should priced-in analysis render? Requires clean reconciliation + usable multiple. */
export function canRenderPricedInAnalysis(
  reconciliationStatus: ReconciliationStatus,
  valuationView: ValuationView | null,
): boolean {
  if (reconciliationStatus.blocksValuationView) return false;
  const hasPrimaryMultiple = (valuationView?.metrics ?? []).some(
    m => m.current !== null
  );
  return hasPrimaryMultiple;
}

/** Gate: should quantified bull/bear scenarios render? */
export function canRenderScenarioRange(
  thesisDrivers: readonly ThesisDriver[] | null,
  confidence: ConfidenceScore,
): boolean {
  if (confidence.level === 'low') return false;
  const verifiedDrivers = (thesisDrivers ?? []).filter(d => d.currentlyHolds && d.confidence !== 'low');
  return verifiedDrivers.length >= 2;
}

/** Gate: is a 'buy' recommendation defensible given current evidence? */
export function canRenderStrongRecommendation(
  recommendation: InvestmentRecommendation,
  confidence: ConfidenceScore,
  logic: RecommendationLogic,
  withheldSections: readonly WithheldSection[],
): boolean {
  if (recommendation !== 'buy') return true; // only gates 'buy'
  if (confidence.level === 'low') return false;
  if (logic.financialDepth === 'thin') return false;
  if (logic.valuationSupport === 'weak') return false;
  const blockingSections: WithheldSection['section'][] = ['priced-in-analysis', 'peer-comparison'];
  if (withheldSections.some(s => blockingSections.includes(s.section))) return false;
  return true;
}

/** Gate: can a private-company thesis be generated? */
export function canRenderPrivateThesis(
  checklist: DiligenceChecklist,
): boolean {
  return !checklist.blockThesis && checklist.passCount >= 3;
}
```

### 2.4 Conditional Memo Generation Decision Tree

In `orchestrator.ts`, after Step 3 (validation), before Step 4 (draft memo):

```
1. Compute reconciliationStatus (S6 step)
2. Compute peerRelevanceScores (S5 step)
3. Evaluate gates:
   a. !canRenderPeerPanel(scores)        → add WithheldSection('peer-comparison', 'insufficient-peer-relevance', ...)
   b. !canRenderPricedInAnalysis(...)    → add WithheldSection('priced-in-analysis', 'unreconciled-valuation-inputs', ...)
   c. [S7 private check]                → add WithheldSection('private-thesis', ...)
4. Pass withheldSections[] into memoContext

In memo-agent.ts → synthesizeDepthFields:
   IF 'priced-in-analysis' in withheldSections → skip pricedInAnalysis LLM call, return null
   IF 'scenario-range' in withheldSections     → skip bullCase/bearCase LLM call, return null for both
   IF 'private-thesis' in withheldSections     → skip thesisDrivers LLM call, return null
   ELSE → run LLM depth synthesis as today

   After LLM synthesis:
   !canRenderScenarioRange(thesisDrivers, confidence) → null out bullCase/bearCase even if LLM returned them
   !canRenderStrongRecommendation(...)                → downgrade recommendation to 'watch', add WithheldSection
```

### 2.5 Backward Compatibility

`withheldSections` is a new required field on `AnalysisReport`. Cached reports stored as JSON will not have it. The deserialisation layer in `lib/db.ts` must coerce missing field: `report.withheldSections ?? []`. All UI components that consume it must use `withheldSections ?? []`. No existing fields removed.

### 2.6 Implementation Sequencing

**Step 3** alongside Section 5. Defines the `WithheldSection` schema and `gates.ts` that S5 also uses.

### 2.7 Effort Estimate

**8 hours.** New `gates.ts` with 5 functions (2h), types (1h), orchestrator wiring (1.5h), memo-agent conditional calls (1.5h), UI withheld states in 3 components (2h).

### 2.8 Risk Register

**Risk:** Gate functions are evaluated with stale data if confidence is computed before reconciliation, causing `canRenderPricedInAnalysis` to pass incorrectly.
**Mitigation:** Enforce strict evaluation order in `orchestrator.ts`: `reconcileSources → computeConfidence → evaluateGates → runMemoAgent`. Document this order in a comment block at the top of the orchestrator pipeline.

---

## Section 3 — Facts / Inferences / Judgment Split

### 3.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `lib/types.ts` | modify | Add `SourcedFact`, `FactLayer`, `DerivedInference`, `InferenceLayer`, `JudgmentLayer` types. Extend `InvestmentMemo` with optional `factLayer`, `inferenceLayer`, `judgmentLayer` fields. |
| `lib/report-assembly.ts` | modify | Add `buildFactLayer(waterfallResult, metrics, evidenceAnchors)` function that converts structured source data into `SourcedFact[]` items without LLM involvement. |
| `lib/investment-memo.ts` | modify | Add `buildInferenceLayer(facts, metrics, valuationView)` that derives ratio/delta/trend observations mechanically from `FactLayer`. Add `buildJudgmentLayer(memo, confidence, withheldSections)` that evaluates whether conviction is blocked. |
| `lib/agents/memo-agent.ts` | modify | Call `buildFactLayer` and `buildInferenceLayer` before the depth LLM call. Attach layers to final memo. Pass `factLayer` into depth prompt so LLM interpretations must reference specific `evidenceId` values from it. |
| `components/InvestmentMemoPanel.tsx` | modify | Add three collapsible/tabbed panels: "What We Know" (FactLayer), "What We Infer" (InferenceLayer), "Our View" (JudgmentLayer). When new layers are present, suppress `verifiedFacts`/`reasonedInference` legacy arrays from the primary view (they remain in the data for backward compat). |

### 3.2 New Types

```typescript
// src/lib/types.ts

export type SourcedFact = {
  readonly claim: string;
  readonly value: string | number | null;
  readonly evidenceClass: EvidenceClass;
  readonly evidenceId: string | null;
  readonly period: string | null;
  readonly source: DataSource;
};

export type FactLayer = {
  readonly items: readonly SourcedFact[];
  readonly primaryFilingCount: number;
  readonly vendorDataCount: number;
  readonly synthesizedCount: number;
};

export type DerivedInference = {
  readonly claim: string;
  readonly derivedFrom: readonly string[];         // evidenceIds
  readonly mechanismType: 'delta' | 'ratio' | 'comparison' | 'trend';
  readonly quantified: boolean;                    // false = qualitative only
};

export type InferenceLayer = {
  readonly items: readonly DerivedInference[];
};

export type JudgmentLayer = {
  readonly recommendation: InvestmentRecommendation | null;
  readonly conviction: ConfidenceLevel | null;
  readonly blocked: boolean;
  readonly blockReasons: readonly string[];         // human-readable, shown in UI
};

// Extend InvestmentMemo (these are all additive optional fields):
// readonly factLayer?: FactLayer | null;
// readonly inferenceLayer?: InferenceLayer | null;
// readonly judgmentLayer?: JudgmentLayer | null;
```

### 3.3 Deterministic Gating Logic

`JudgmentLayer.blocked` is set in `investment-memo.ts` by `buildJudgmentLayer`:

```typescript
// src/lib/investment-memo.ts
function buildJudgmentLayer(
  memo: InvestmentMemo,
  confidence: ConfidenceScore,
  withheldSections: readonly WithheldSection[],
): JudgmentLayer

// blocked = true when:
//   confidence.level === 'low' AND no primary-filing EvidenceClass present in factLayer
//   OR 'strong-recommendation' is in withheldSections
//   OR diligenceChecklist.blockThesis === true (for private companies)
```

### 3.4 Conditional Memo Generation

In `memo-agent.ts`, before the Claude depth call:
1. Build `factLayer` from `metrics` + `evidenceAnchors` (deterministic, no LLM)
2. Build `inferenceLayer` from `factLayer` + `valuationView` (deterministic, no LLM)
3. Build `judgmentLayer` from `baseMemo` + `confidence` + `withheldSections`
4. If `judgmentLayer.blocked` → skip all LLM depth synthesis → return base fields with `null` for `thesisDrivers`, `bullCase`, `bearCase`, `pricedInAnalysis`

### 3.5 Backward Compatibility

`factLayer`, `inferenceLayer`, `judgmentLayer` are all new optional fields on `InvestmentMemo`. Legacy `verifiedFacts`, `reasonedInference`, `unknowns` arrays are retained and still populated. UI: when `factLayer` is present, show it; when absent (cached report), fall back to `verifiedFacts` array.

### 3.6 Implementation Sequencing

**Step 7** (alongside Section 9 UI). The three-layer model is primarily a UI construct on top of data already being assembled; the infrastructure work is modest.

### 3.7 Effort Estimate

**6 hours.** Types (1h), `buildFactLayer` + `buildInferenceLayer` (2h), `buildJudgmentLayer` (1h), memo-agent wiring (0.5h), UI three-panel layout (1.5h).

### 3.8 Risk Register

**Risk:** `FactLayer` items overlap with existing `verifiedFacts[]` strings, causing duplicated information in the UI for users on fresh reports.
**Mitigation:** When `factLayer !== null`, suppress the legacy `verifiedFacts` list from the primary view. Gate this in `InvestmentMemoPanel` with `memo.factLayer != null ? renderFactLayer() : renderLegacyFacts()`.

---

## Section 4 — Company-Type Driver Trees

### 4.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `lib/driver-trees.ts` | **new** | `classifyArchetype(metrics, waterfallResult, businessModelTag)` returns `CompanyArchetype`. `buildDriverTree(archetype, metrics, evidenceAnchors)` returns `DriverTree` with per-driver status. Per-archetype driver definitions as `readonly` const maps. |
| `lib/types.ts` | modify | Add `CompanyArchetype`, `DriverMetricStatus`, `DriverMetric`, `DriverTree` types. Extend `InvestmentMemo` with optional `driverTree` field. |
| `lib/investment-memo.ts` | modify | Call `classifyArchetype` and `buildDriverTree` inside `buildInvestmentMemo`. Store result in `driverTree`. Set `keyRisks` entries for each `criticalMissing` driver (elevating gaps to named risks, not just coverage-gap prose). |
| `lib/agents/memo-agent.ts` | modify | In `buildDepthPromptPayload`, add `driverTree` section so Claude's thesis drivers must reference archetype-specific economic metrics, not generic claims. In `buildDepthSystemPrompt`, add archetype-specific instruction: "For a `consumer-fintech-bnpl` company, thesis drivers must address take rate, loss rate, or contribution margin.". |
| `components/InvestmentMemoPanel.tsx` | modify | Add "Key Value Drivers" section rendering `driverTree.drivers` as a status table: metric name | status | value (or "Missing — required before conviction"). |

### 4.2 New Types

```typescript
// src/lib/types.ts

export type CompanyArchetype =
  | 'consumer-fintech-bnpl'   // GMV, active users, take rate, funding cost, loss rate
  | 'software-saas'           // ARR, gross margin, NDR, CAC payback, burn/runway
  | 'ai-infrastructure'       // ARR/usage mix, inference cost, gross margin, NDR, concentration
  | 'mega-cap-platform'       // segment mix, services margin, capex intensity, buyback yield
  | 'uk-retail-lfl'           // LFL sales growth, store count, EBITDA margin, lease liability
  | 'industrial-b2b'          // order book, backlog, EBITDA margin, capex/revenue, ROCE
  | 'private-early-stage'     // revenue (any), gross margin (any), runway, investor quality
  | 'private-growth'          // revenue, gross margin, NDR or retention proxy, burn multiple
  | 'turnaround'              // FCF target, margin trajectory, debt/EBITDA, cost program
  | 'other';                  // no archetype-specific driver tree applied

export type DriverMetricStatus = 'verified' | 'estimated' | 'inferred' | 'missing';

export type DriverMetric = {
  readonly name: string;
  readonly status: DriverMetricStatus;
  readonly value: string | number | null;
  readonly evidenceId: string | null;
  readonly importance: 'critical' | 'important' | 'supplementary';
  readonly note: string | null;
};

export type DriverTree = {
  readonly archetype: CompanyArchetype;
  readonly drivers: readonly DriverMetric[];
  readonly criticalMissing: readonly string[];   // names of critical drivers with status 'missing'
  readonly blocksConviction: boolean;            // true if ≥1 critical driver is missing
};

// Extend InvestmentMemo:
// readonly driverTree?: DriverTree | null;
```

### 4.3 Deterministic Gating Logic

`DriverTree.blocksConviction` is set deterministically in `buildDriverTree`:

```typescript
// src/lib/driver-trees.ts
export function buildDriverTree(
  archetype: CompanyArchetype,
  metrics: readonly FinancialMetric[],
  anchors: readonly EvidenceAnchor[],
): DriverTree

// blocksConviction = criticalMissing.length > 0
// criticalMissing = drivers.filter(d => d.importance === 'critical' && d.status === 'missing').map(d => d.name)
```

If `driverTree.blocksConviction` is `true`, in `memo-agent.ts → synthesizeDepthFields`:
- Do not generate `thesisDrivers` via LLM (they would be hallucinated; return `null`)
- Add each `criticalMissing` item as a `CoverageGap` with severity `'high'`

### 4.4 Conditional Memo Generation

Decision tree in `memo-agent.ts`:

```
1. classifyArchetype(metrics, waterfallResult, businessModelTag) → archetype
2. buildDriverTree(archetype, metrics, evidenceAnchors) → driverTree
3. IF driverTree.blocksConviction:
     → skip thesisDrivers LLM call → thesisDrivers = null
     → skip bullCase/bearCase LLM call (scenario range requires thesis drivers)
     → add each criticalMissing as CoverageGap(severity='high')
   ELSE:
     → run LLM depth synthesis, but constrain prompt with archetype driver context
4. Attach driverTree to final memo
```

### 4.5 Backward Compatibility

`driverTree` is a new optional field. Cached reports without it: panel not rendered, no regression. `criticalMissing` items surfaced as `keyRisks` and `coverageGaps` replaces what was previously generic "data quality" risks — text changes on re-run, not on cached reads. Existing `businessModelTag` field on `LegacyInvestmentMemo` is used as one signal in `classifyArchetype` — no removal needed.

### 4.6 Implementation Sequencing

**Step 4.** After S1 (needs `evidenceClass` on anchors), after S2 (needs gate infrastructure). Before S7 (private archetype used in diligence checklist).

### 4.7 Effort Estimate

**10 hours.** Per-archetype driver definitions for 8 archetypes (4h), `classifyArchetype` logic (1.5h), `buildDriverTree` including metric matching (2h), memo-agent wiring + prompt update (1.5h), UI driver table (1h).

### 4.8 Risk Register

**Risk:** `classifyArchetype` misroutes a UK fintech (e.g., Klarna) as `'private-growth'` instead of `'consumer-fintech-bnpl'` because Exa data doesn't expose GMV clearly, so the BNPL-specific drivers are never checked.
**Mitigation:** Archetype classification uses a scoring approach: SIC code hint (from SEC/CH) + `businessModelTag` (already set in the existing memo logic) + keyword matching on `exaDeep.overview`. If score is ambiguous, default to `'private-growth'` — its driver tree is a strict subset of the BNPL tree and won't hallucinate. Add an explicit override map for known companies (`'Klarna' → 'consumer-fintech-bnpl'`) seeded from `src/lib/demo-names.ts`.

---

## Section 5 — Peer Engine Redesign

### 5.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `lib/peer-engine.ts` | **new** | `scorePeerRelevance(subject, candidate)` returns `PeerRelevanceScore`. `filterRelevantPeers(scores, minPassCount)` returns passing peers. Scoring criteria: business model match (30pts), monetization match (25pts), margin profile compatibility (20pts), capital intensity (15pts), customer type (10pts). Deterministic, no LLM. |
| `lib/types.ts` | modify | Add `PeerRelevanceScore` type. |
| `lib/agents/memo-agent.ts` | modify | `buildComparablePeers` now calls `scorePeerRelevance` for each FMP peer. Calls `canRenderPeerPanel` gate. If gate fails, returns `[]` and adds `WithheldSection('peer-comparison', ...)`. |
| `lib/report-assembly.ts` | modify | `buildPeerComparison` filters through peer engine before returning `PeerComparisonItem[]`. Passes scored list to memo context. |
| `components/PeerComparisonPanel.tsx` | modify | Render "No valid peer set produced — fewer than 2 peers passed business-model relevance screening" when `peerComparison.length === 0` AND `'peer-comparison'` in `withheldSections`. |

### 5.2 New Types

```typescript
// src/lib/types.ts

export type PeerRelevanceScore = {
  readonly symbol: string;
  readonly companyName: string;
  readonly totalScore: number;          // 0-100
  readonly passes: boolean;             // totalScore >= PEER_PASS_THRESHOLD (default: 50)
  readonly breakdown: {
    readonly businessModelMatch: number;     // 0 or 30
    readonly monetizationModelMatch: number; // 0 or 25
    readonly marginProfileCompatible: number;// 0, 10, or 20
    readonly capitalIntensityMatch: number;  // 0 or 15
    readonly customerTypeMatch: number;      // 0 or 10
  };
  readonly disqualifyingReasons: readonly string[];
};
```

### 5.3 Deterministic Gating Logic

```typescript
// src/lib/gates.ts (already shown in S2 but reproduced for clarity)
export function canRenderPeerPanel(
  peerRelevanceScores: readonly PeerRelevanceScore[],
  minPassCount = 2,
): boolean {
  return peerRelevanceScores.filter(s => s.passes).length >= minPassCount;
}
```

Scoring in `peer-engine.ts`:

```typescript
export function scorePeerRelevance(
  subject: {
    readonly archetype: CompanyArchetype;
    readonly grossMargin: number | null;
    readonly isB2B: boolean;
    readonly isHighCapex: boolean;
  },
  candidate: FmpPeerProfile & { readonly archetype?: CompanyArchetype },
): PeerRelevanceScore
```

Business-model match is determined from `CompanyArchetype` (S4) of the subject vs. inferred archetype of the candidate based on the candidate's FMP profile (SIC, name heuristics). Margin-profile compatibility: if subject gross margin > 60% and candidate gross margin < 20%, penalty applied. Capital intensity: if subject is software (low capex) and candidate is industrial (high capex), disqualified.

### 5.4 Conditional Memo Generation

In `memo-agent.ts → buildComparablePeers`:

```
1. Score all FMP peers with scorePeerRelevance
2. canRenderPeerPanel(scores) → if false:
     - return [] (empty peer group)
     - add WithheldSection('peer-comparison', 'insufficient-peer-relevance',
         'No valid peer set produced — fewer than 2 peers passed business-model relevance screening.')
3. comparablesAnchor.peerGroup = passing peers only
4. computeMedianRow from passing peers only (smaller n is better than corrupt n)
```

### 5.5 Backward Compatibility

`PeerComparisonItem[]` type is unchanged. When peer panel is withheld, `peerComparison: []` which is the same as the existing behavior when FMP returns no peers. Cached reports with peers already set render normally. No schema change to `ComparablesAnchor`.

### 5.6 Implementation Sequencing

**Step 3** alongside Section 2. Both define and consume `WithheldSection`. The peer gate is the first gate to be exercised in the new system.

### 5.7 Effort Estimate

**8 hours.** `peer-engine.ts` scoring logic (3h), archetype-to-archetype compatibility matrix (1.5h), `buildComparablePeers` integration (1.5h), UI withheld state (1h), tests with FMP mock data (1h).

### 5.8 Risk Register

**Risk:** FMP `/v3/peers` returns index constituents or ADRs as peers for non-US companies (e.g., for Diageo, returning generic "food & beverage" ETF constituents), causing most candidates to fail the relevance check, withholding the peer panel for companies where a real peer set exists.
**Mitigation:** Pre-filter candidates: drop any symbol whose FMP type is not `'Stock'`, whose exchange is `'ETF'` or `'INDEX'`, or whose market cap is >20x or <0.05x the subject's market cap. Apply these deterministic exclusions before running relevance scoring. This reduces false withholding significantly.

---

## Section 6 — Reconciliation Layer

### 6.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `lib/reconciliation.ts` | **new** | `reconcileSources(waterfallResult, metrics)` returns `ReconciliationStatus`. Checks: (1) market cap: Finnhub `marketCapitalization` vs FMP `enterpriseValues[0].marketCapitalization` — delta >15% → unresolved. (2) share count: if inferrable from both, compare. (3) EV: FMP EV vs (market cap + net debt from metrics). (4) currency: detect if metrics mix USD and GBP without conversion. (5) date alignment: Finnhub quote date vs FMP multiples date — if >30 days apart, flag. |
| `lib/types.ts` | modify | Add `ReconciliationField`, `ReconciliationCheck`, `ReconciliationStatus` types. Extend `AnalysisReport` with `reconciliationStatus`. |
| `lib/agents/orchestrator.ts` | modify | After `assembleMetrics`, call `reconcileSources(waterfallResult, metrics)`. Pass `reconciliationStatus` into both gate evaluation and `memoContext`. |
| `components/ValuationOverviewPanel.tsx` | modify | If `reconciliationStatus.overall === 'failed'`, render warning banner: "Valuation inputs from multiple sources are unreconciled — figures shown may be inconsistent." If `'partial'`, render softer note. If `priced-in-analysis` withheld, render the withheld notice. |

### 6.2 New Types

```typescript
// src/lib/types.ts

export type ReconciliationField =
  | 'market-cap'
  | 'share-count'
  | 'enterprise-value'
  | 'cash-debt'
  | 'currency'
  | 'date-alignment';

export type ReconciliationCheck = {
  readonly field: ReconciliationField;
  readonly status: 'reconciled' | 'partial' | 'unresolved' | 'unavailable';
  readonly sources: readonly DataSource[];
  readonly note: string;
};

export type ReconciliationStatus = {
  readonly overall: 'clean' | 'partial' | 'failed';
  readonly checks: readonly ReconciliationCheck[];
  readonly blocksValuationView: boolean;  // true when overall === 'failed'
};

// Extend AnalysisReport:
// readonly reconciliationStatus: ReconciliationStatus;   // NEW required field (not optional)
```

### 6.3 Deterministic Gating Logic

```typescript
// src/lib/reconciliation.ts
export function reconcileSources(
  waterfallResult: WaterfallResult,
  metrics: readonly FinancialMetric[],
): ReconciliationStatus

// overall = 'failed' when any check.status === 'unresolved'
// overall = 'partial' when any check.status === 'partial' and none 'unresolved'
// overall = 'clean' when all checks are 'reconciled' or 'unavailable'
// blocksValuationView = overall === 'failed'
```

### 6.4 Conditional Memo Generation

In `orchestrator.ts`:

```
After assembleMetrics:
  reconciliationStatus = reconcileSources(waterfallResult, metrics)

Before buildValuationView:
  (valuationView is still built regardless — it provides the data even if opinionated framing is withheld)

In gate evaluation:
  !canRenderPricedInAnalysis(reconciliationStatus, valuationView)
  → add WithheldSection('priced-in-analysis', 'unreconciled-valuation-inputs',
      'Priced-in analysis withheld — market cap figures from Finnhub and FMP diverge by more than 15%.')
```

### 6.5 Backward Compatibility

`reconciliationStatus` becomes a new required field on `AnalysisReport`. Cached reports will be missing it. Deserialization in `lib/db.ts` must handle: `report.reconciliationStatus ?? defaultReconciliationStatus` where `defaultReconciliationStatus = { overall: 'clean', checks: [], blocksValuationView: false }`. This means cached reports will not trigger valuation withholding on read — correct behavior (don't retroactively withhold).

### 6.6 Implementation Sequencing

**Step 2.** After S1 (needs `DataSource` tagging on metrics). Before S2 (S2's `canRenderPricedInAnalysis` gate consumes `ReconciliationStatus`). Independently shippable — zero UI change needed to ship the reconciliation logic.

### 6.7 Effort Estimate

**6 hours.** `reconciliation.ts` with 5 check functions (3h), orchestrator wiring (1h), UI warning banner (1h), deserialization coercion in db.ts (0.5h), typecheck pass (0.5h).

### 6.8 Risk Register

**Risk:** Finnhub and FMP market cap figures diverge by >15% for most large-cap stocks because Finnhub uses shares outstanding × price while FMP uses an adjusted float figure. This would cause `overall = 'failed'` and withhold `pricedInAnalysis` for nearly all public companies.
**Mitigation:** Widen the reconciliation tolerance to 20% for `market-cap` specifically, and use the FMP figure as the canonical source when both are present (FMP has explicit EV construction). Document the tolerance as a named constant `MARKET_CAP_RECONCILE_TOLERANCE = 0.20` so it can be tuned without touching logic.

---

## Section 7 — Public vs Private Mode Separation

### 7.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `lib/diligence-checklist.ts` | **new** | `buildDiligenceChecklist(archetype, metrics, waterfallResult, evidenceAnchors)` returns `DiligenceChecklist`. Each of the 8 checklist fields maps to a deterministic check against `metrics` and `exaDeep` data. `blockThesis` is set when ≥1 `'critical'` field has status `'missing'`. |
| `lib/types.ts` | modify | Add `DiligenceCheckItem`, `DiligenceChecklist` types. Extend `InvestmentMemo` with optional `diligenceChecklist`. |
| `lib/investment-memo.ts` | modify | When `isPrivateMode(waterfallResult)` is true (existing `isPrivateResearchOnly` function), call `buildDiligenceChecklist`. Set `thesis` to a structured string of missing items instead of an LLM-generated narrative when `blockThesis = true`. Set `verdict` to "Primary diligence required" prefix when `!underwritingReady`. |
| `lib/agents/memo-agent.ts` | modify | For private-mode companies, `buildDepthSystemPrompt` returns a private-diligence-specific prompt that emphasizes checklist gap enumeration over narrative richness. Pass checklist into depth prompt payload. |
| `components/InvestmentMemoPanel.tsx` | modify | Add `DiligenceChecklistPanel` that renders the checklist as a status table (verified ✓, estimated ~, missing ✗) for private-mode names. This panel is shown above the thesis section. When `blockThesis = true`, replace `thesis` display with "Primary diligence required — [N] critical checks are unresolved" notice. |

### 7.2 New Types

```typescript
// src/lib/types.ts

export type DiligenceCheckField =
  | 'revenue-verified'
  | 'gross-margin-verified'
  | 'retention-verified'
  | 'concentration-verified'
  | 'round-terms-reviewed'
  | 'governance-understood'
  | 'unit-economics-understood'
  | 'competitive-moat-assessed';

export type DiligenceCheckItem = {
  readonly field: DiligenceCheckField;
  readonly label: string;              // human-readable
  readonly status: 'verified' | 'estimated' | 'missing';
  readonly evidenceId: string | null;
  readonly note: string;
  readonly isCritical: boolean;        // revenue, gross-margin, retention = critical
};

export type DiligenceChecklist = {
  readonly items: readonly DiligenceCheckItem[];
  readonly passCount: number;          // verified + estimated
  readonly totalCount: number;         // always 8
  readonly criticalMissingCount: number;
  readonly blockThesis: boolean;       // criticalMissingCount > 0
  readonly underwritingReady: boolean; // passCount >= 5 AND criticalMissingCount === 0
};

// Extend InvestmentMemo:
// readonly diligenceChecklist?: DiligenceChecklist | null;
```

### 7.3 Deterministic Gating Logic

```typescript
// src/lib/gates.ts
export function canRenderPrivateThesis(
  checklist: DiligenceChecklist,
): boolean {
  return !checklist.blockThesis && checklist.passCount >= 3;
}

// src/lib/diligence-checklist.ts
export function buildDiligenceChecklist(
  archetype: CompanyArchetype,
  metrics: readonly FinancialMetric[],
  waterfallResult: WaterfallResult,
  evidenceAnchors: readonly EvidenceAnchor[],
): DiligenceChecklist
```

Checklist field mapping (deterministic, not LLM):
- `revenue-verified`: metrics has Revenue or Estimated Revenue with class ≠ `'model-inference'` → `'verified'`; has Estimated Revenue from `synthesized-web` → `'estimated'`; else `'missing'`
- `gross-margin-verified`: metrics has Gross Margin → `'verified'`; exaDeep.overview mentions margin → `'estimated'`; else `'missing'`
- `retention-verified`: metrics has NDR or Retention → `'verified'`; else `'missing'` (rarely available from Exa for private)
- `concentration-verified`: exaDeep competitors non-empty → `'estimated'`; else `'missing'`
- `round-terms-reviewed`: exaDeep.fundingTotal or lastValuation present → `'estimated'`; else `'missing'`
- `governance-understood`: gleif or companies-house present → `'estimated'`; else `'missing'`
- `unit-economics-understood`: metrics has CAC or LTV or Contribution Margin → `'verified'`; else `'missing'`
- `competitive-moat-assessed`: exaDeep.competitors non-empty AND keyInvestors non-empty → `'estimated'`; else `'missing'`

### 7.4 Conditional Memo Generation

```
IF isPrivateMode(waterfallResult):
  diligenceChecklist = buildDiligenceChecklist(archetype, metrics, waterfallResult, anchors)
  IF !canRenderPrivateThesis(checklist):
    → skip thesisDrivers LLM call → null
    → set thesis = "Primary diligence required. [N] critical checks are unresolved: [list]"
    → add WithheldSection('private-thesis', 'private-diligence-insufficient', ...)
  ELSE:
    → run LLM depth synthesis with private-focused system prompt
    → LLM prompt instructs: enumerate verified fields first, inferred second, state unknowns third
```

### 7.5 Backward Compatibility

`diligenceChecklist` is a new optional field on `InvestmentMemo`. Cached private-company reports (where `isPrivateResearchOnly` was true) render without the checklist panel — no regression. The new `thesis` text (when `blockThesis = true`) only applies on fresh runs; cached reports keep their original `thesis` text.

### 7.6 Implementation Sequencing

**Step 5.** After S4 (needs `CompanyArchetype` for archetype-specific critical field weighting). Before S8 (challenger can reference checklist gaps). Before S9 (UI panel needed).

### 7.7 Effort Estimate

**8 hours.** `diligence-checklist.ts` with 8 deterministic checks (3h), types (0.5h), `investment-memo.ts` private thesis gating (1.5h), `memo-agent.ts` private prompt mode (1h), `DiligenceChecklistPanel` UI component (2h).

### 7.8 Risk Register

**Risk:** `DiligenceChecklist` over-blocks private companies that have good Exa data (Klarna, Stripe) because `retention-verified` and `unit-economics-understood` will almost always be `'missing'` from public web sources. This would set `blockThesis = true` for every private company, making the private diligence mode useless.
**Mitigation:** Only `revenue-verified` and `gross-margin-verified` are classified as `isCritical = true` for `'private-growth'` and `'private-early-stage'` archetypes. `retention-verified` and `unit-economics-understood` are `isCritical = false`. Adjust `blockThesis` logic: `blockThesis = items.filter(i => i.isCritical && i.status === 'missing').length > 0`. This means Klarna (with revenue + margin from Exa) clears the critical bar and thesis is generated, while a company with no revenue evidence is correctly blocked.

---

## Section 8 — Challenger Redesign

### 8.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `lib/agents/challenger-agent.ts` | modify | Replace the `2+2+2` instruction schema with a `4-attack` schema targeting the five specific attack vectors from the meta-prompt. Rewrite the system prompt to remove generic mandate-calibration boilerplate and focus on thesis-specific attacks. Replace `buildChallengerPrompt` to include `driverTree` and `diligenceChecklist` context. Add bridge function that maps `attacks` back to the legacy `unstatedAssumptions / evidenceGaps / counterScenarios` arrays for backward compat. |
| `lib/types.ts` | modify | Add `ChallengerAttackType`, `ChallengerAttack` types. Extend `ChallengerReport` with optional `attacks` field. |

### 8.2 New Types

```typescript
// src/lib/types.ts

export type ChallengerAttackType =
  | 'hidden-assumption'     // main implicit assumption underlying the thesis
  | 'fragile-variable'      // single metric whose change most threatens the case
  | 'disconfirming-signal'  // fastest-observable signal that would falsify thesis
  | 'growth-quality'        // is growth product-led, pricing-led, subsidy-led, or hype-led?
  | 'moat-challenge'        // is the moat actually demonstrated in the data?
  | 'valuation-grounding';  // does valuation rest on unsupported expectations?

export type ChallengerAttack = {
  readonly attackType: ChallengerAttackType;
  readonly claim: string;              // one specific, falsifiable sentence
  readonly severity: ValidationSeverity;
  readonly citedSource: string;        // data source or 'none'
  readonly counterMeasure: string | null; // what evidence would neutralize this attack
};

// Extend ChallengerReport:
// readonly attacks?: readonly ChallengerAttack[] | null;
```

### 8.3 Deterministic Gating Logic

No new gate functions. The challenger redesign is a prompt and schema change, not a gating change. The existing `convictionDowngraded` logic in `memo-agent.ts` reads `attacks.filter(a => a.severity === 'high').length > 0` via the bridge function.

**Bridge function (backward compatibility):**

```typescript
// src/lib/agents/challenger-agent.ts
function mapAttacksToLegacySchema(attacks: readonly ChallengerAttack[]): {
  unstatedAssumptions: readonly ChallengerItem[];
  evidenceGaps: readonly ChallengerItem[];
  counterScenarios: readonly ChallengerItem[];
}
// Mapping:
// 'hidden-assumption' → unstatedAssumptions
// 'fragile-variable', 'valuation-grounding', 'moat-challenge' → evidenceGaps
// 'disconfirming-signal', 'growth-quality' → counterScenarios
```

### 8.4 Conditional Memo Generation

Challenger is run conditionally (as today, skipped for `'Reference public comp'` role). No new conditions added here. The memo-agent conviction downgrade logic reads from the bridge-mapped legacy arrays — unchanged.

### 8.5 Backward Compatibility

`ChallengerReport.attacks` is new optional field. `unstatedAssumptions / evidenceGaps / counterScenarios` are still populated (via bridge). `StressTestResult` type is unchanged. Conviction downgrade logic in `memo-agent.ts` is unchanged (still reads `highSeverityCount` from legacy arrays). Cached reports have no `attacks` field — UI renders only the legacy three-bucket display.

### 8.6 Implementation Sequencing

**Step 6.** After S4 (challenger prompt references `driverTree`) and S7 (challenger references `diligenceChecklist`). Independently shippable in terms of interface.

### 8.7 Effort Estimate

**5 hours.** New system prompt (1h), `buildChallengerPrompt` refactor (1h), new JSON schema for 4 attacks (0.5h), `mapAttacksToLegacySchema` bridge (0.5h), types (0.5h), test against Klarna and Apple (1.5h).

### 8.8 Risk Register

**Risk:** The 4-attack schema produces fewer items than the 2+2+2 schema (4 vs 6). If all 4 attacks are `'medium'` severity, `convictionDowngraded` stays `false` — the challenger becomes toothless against genuinely risky names.
**Mitigation:** Change conviction downgrade threshold in `memo-agent.ts` from `highSeverityCount > 0` to `(highSeverityCount > 0 || mediumSeverityCount >= 3)`. This ensures that 3+ medium attacks (from 4) still trigger a downgrade. Document this as the new "4-attack downgrade rule."

---

## Section 9 — UI Output Changes

### 9.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `components/InvestmentMemoPanel.tsx` | modify | Restructure into four primary panels: "What We Know" (FactLayer or legacy verifiedFacts), "What We Infer" (InferenceLayer or legacy reasonedInference), "What We Cannot Underwrite Yet" (withheldSections + diligence gaps), "What Would Change The View" (whatWouldChangeTheCall, promoted to top-level). Add "Top 3 Variables That Matter" derived from driverTree.drivers sorted by importance, with their status. De-emphasize long thesis/antiThesis prose blocks by collapsing them under an "Analyst Notes" expandable. |
| `components/PeerComparisonPanel.tsx` | modify | Render named withheld state. When peers present, add `PeerRelevanceScore` badge next to each peer row showing pass/fail. Remove peers that failed scoring from display entirely. |
| `components/ValuationOverviewPanel.tsx` | modify | Render `ReconciliationStatus` warnings. Show withheld notice for priced-in analysis. Surface `reconciliationStatus.checks` as a collapsible "Source Reconciliation" panel. |
| `components/SectionAuditPanel.tsx` | modify | Add withheld-section count summary at top: "N sections withheld due to insufficient evidence." Link each withheld section to its `userMessage`. |
| `components/Report.tsx` | modify | Pass `withheldSections`, `reconciliationStatus`, `driverTree`, `factLayer`, `inferenceLayer`, `judgmentLayer`, `diligenceChecklist` down to child panels. |

### 9.2 New Types

No new types required for S9 — all types defined in prior sections. S9 is a rendering layer.

### 9.3 Deterministic Gating Logic

No new gate functions. UI panels check `memo.withheldSections` (or `report.withheldSections`) directly.

### 9.4 Conditional Memo Generation

No memo generation changes. S9 is rendering only.

### 9.5 Backward Compatibility

All new panels are conditional on new optional fields: `factLayer ?? null`, `inferenceLayer ?? null`, `driverTree ?? null`, `diligenceChecklist ?? null`. When these are absent (cached reports), the UI falls back to the existing layout:
- "What We Know" → `verifiedFacts[]` (legacy)
- "What We Infer" → `reasonedInference[]` (legacy)
- No driver tree panel rendered
- No diligence checklist rendered
- Withheld section notices: `withheldSections ?? []` → zero notices on cached reports

Existing panels (`StreetViewPanel`, `EarningsHighlightsPanel`, `InsiderActivityPanel`, etc.) are untouched.

### 9.6 Implementation Sequencing

**Step 7** alongside Section 3. Both restructure the memo display. S9 depends on all prior sections being wired into the data model.

### 9.7 Effort Estimate

**8 hours.** `InvestmentMemoPanel` restructure (3h), `ValuationOverviewPanel` reconciliation UI (1h), `PeerComparisonPanel` withheld state + relevance badges (1h), `SectionAuditPanel` withheld count (0.5h), `Report.tsx` prop threading (1h), visual QA across Apple/Klarna/Anthropic (1.5h).

### 9.8 Risk Register

**Risk:** Restructuring `InvestmentMemoPanel` into four panels changes the visual layout in a way that feels more sparse for well-covered public companies (Apple, NVIDIA), where the old long-prose memo felt substantive.
**Mitigation:** For companies with `confidence.level === 'high'` and `factLayer.primaryFilingCount >= 3`, expand the "What We Know" panel by default (not collapsed). Keep the analyst notes expandable visible for all companies. The goal is narrower and harsher, not shorter-feeling for well-covered names.

---

## Section 10 — Recommendation Discipline

### 10.1 Files to Change

| File | Change | Description |
|------|--------|-------------|
| `lib/gates.ts` | modify | Implement `canRenderStrongRecommendation` (signature given in S2, logic defined here). Also add `computeEvidenceBreadthPenalty(sources, hasPrimaryFiling)`. |
| `lib/investment-memo.ts` | modify | In `deriveRecommendation`: `'buy'` requires `confidence.level !== 'low'` + `financialDepth !== 'thin'` + at least one of `['sec-edgar', 'fmp']` in active sources + no high-severity tensions. Consensus-target upside alone (i.e., only `logic.streetSignals === 'strong'` but `logic.financialDepth === 'thin'`) must not produce `'buy'`. Add `'hold'` as a valid output (distinct from `'watch'`) for medium-evidence mid-conviction cases. |
| `lib/confidence.ts` | modify | Add breadth-without-depth penalty: if ≥3 sources active, none is `sec-edgar` or has XBRL facts, and at least 2 are `market-data-vendor` class, apply a `-5` penalty component (`'breadth-without-depth'` key). |
| `lib/agents/memo-agent.ts` | modify | After `buildInvestmentMemo`, call `canRenderStrongRecommendation`. If it returns false and current recommendation is `'buy'`, downgrade to `'watch'` and add a `WithheldSection('strong-recommendation', 'thin-evidence-base', 'Buy recommendation withheld — evidence base does not meet the minimum threshold for conviction.')`. |

### 10.2 New Types

```typescript
// src/lib/types.ts — extend ConfidenceComponent key:
// | 'breadth-without-depth'    // NEW penalty component
```

No other new types. `canRenderStrongRecommendation` uses existing types defined in S2.

### 10.3 Deterministic Gating Logic

```typescript
// src/lib/gates.ts
export function canRenderStrongRecommendation(
  recommendation: InvestmentRecommendation,
  confidence: ConfidenceScore,
  logic: RecommendationLogic,
  withheldSections: readonly WithheldSection[],
): boolean {
  if (recommendation !== 'buy') return true;
  if (confidence.level === 'low') return false;
  if (logic.financialDepth === 'thin') return false;
  if (logic.valuationSupport === 'weak') return false;
  const blockingWithheld: WithheldSection['section'][] = [
    'priced-in-analysis',
    'peer-comparison',
  ];
  if (withheldSections.some(s => blockingWithheld.includes(s.section))) return false;
  return true;
}

// src/lib/confidence.ts — new sub-function:
function buildBreadthWithoutDepthComponent(
  result: WaterfallResult,
): ConfidenceComponent | null {
  const hasPrimaryFiling =
    result.secEdgar !== null && result.secEdgar.data.xbrlFacts !== null;
  if (hasPrimaryFiling) return null;

  const vendorCount = [result.finnhub, result.fmp].filter(s => s !== null).length;
  const totalActive = result.activeSources.length;

  if (totalActive >= 3 && vendorCount >= 2 && !hasPrimaryFiling) {
    return {
      key: 'breadth-without-depth',
      label: 'Breadth Without Depth',
      score: -5,
      rationale:
        'Multiple vendor sources are active but none provides filing-backed primary evidence; source breadth does not substitute for depth.',
    };
  }
  return null;
}
```

### 10.4 Conditional Memo Generation

In `memo-agent.ts → runMemoAgent`, after `buildInvestmentMemo`:

```
1. Evaluate gates (withheldSections already computed)
2. canRenderStrongRecommendation(recommendation, confidence, logic, withheldSections)
3. IF false AND recommendation === 'buy':
     → recommendation = 'watch'
     → displayRecommendationLabel = 'Watch (evidence threshold not met for Buy)'
     → add WithheldSection('strong-recommendation', 'thin-evidence-base', ...)
4. No other recommendation changes — 'hold', 'watch', 'avoid' pass through unchanged
```

### 10.5 Backward Compatibility

`deriveRecommendation` changes affect re-runs only. Cached reports keep their existing recommendation (served from cache). The breadth-without-depth penalty (-5) is small — in most cases it does not change `ConfidenceLevel` band. The new `'hold'` recommendation option requires adding `'hold'` to `InvestmentRecommendation` union and to the `RECOMMENDATION_LABELS` and style maps in `InvestmentMemoPanel.tsx`.

> **Breaking change check:** `InvestmentRecommendation` currently is `'buy' | 'watch' | 'hold' | 'avoid'` — `'hold'` is already in the type. The `RECOMMENDATION_STYLES` in `InvestmentMemoPanel.tsx` already includes `hold`. No schema break.

### 10.6 Implementation Sequencing

**Step 8.** Depends on S2 (withheld sections), S6 (reconciliation for valuation gate input), and S5 (peer gate input). Must come last among logic sections before README.

### 10.7 Effort Estimate

**5 hours.** `deriveRecommendation` threshold changes (1.5h), `canRenderStrongRecommendation` gate (0.5h), breadth-without-depth penalty in `confidence.ts` (1h), memo-agent recommendation cap (0.5h), UI `'hold'` recommendation styling (already exists, 0.5h), end-to-end verification on 4 companies (1h).

### 10.8 Risk Register

**Risk:** Stricter `'buy'` thresholds cause most UK-listed companies (Diageo, Greggs) to output `'watch'` instead of `'buy'` even when the case is solid, because Companies House doesn't provide XBRL and their `financialDepth` is `'adequate'` not `'strong'`.
**Mitigation:** The `financialDepth` check in `canRenderStrongRecommendation` gates on `'thin'` — `'adequate'` still passes. Only `'thin'` is blocked. UK companies with CH + Finnhub + FMP active and `logic.financialDepth === 'adequate'` continue to be `'buy'`-eligible. Verify with Diageo before shipping.

---

## Implementation Sequencing — Confirmed Order

| Step | Sections | Rationale |
|------|----------|-----------|
| 1 | **S1** — Evidence architecture | Tagging infrastructure. Zero behavior change. Safe first ship. |
| 2 | **S6** — Reconciliation layer | New `reconciliation.ts`, wired into orchestrator. `ReconciliationStatus` needed by S2 gate. |
| 3 | **S2 + S5** — Gating + Peer engine | Both define and consume `WithheldSection`. Peer gate is first concrete gate exercised. Ship together. |
| 4 | **S4** — Driver trees | Needs S1 evidence IDs. Produces `CompanyArchetype` needed by S5 scoring and S7 checklist. |
| 5 | **S7** — Public/private separation | Needs S4 archetype for `isCritical` thresholds. Produces `DiligenceChecklist` needed by S8. |
| 6 | **S8** — Challenger redesign | Needs S4 driver tree and S7 checklist for richer prompt context. Self-contained interface. |
| 7 | **S9 + S3** — UI + Facts/inferences/judgment | S3 layer types feed the four-panel S9 restructure. Both are UI-facing and ship together. |
| 8 | **S10** — Recommendation discipline | Needs S2 withheld sections, S5 peer gate, S6 reconciliation as inputs to `canRenderStrongRecommendation`. |
| 9 | **README** | Reposition product as diligence assistant. No code. |

Each step is independently mergeable and does not break the prior step's behavior.

---

## Effort Estimate Summary

| Section | Hours |
|---------|-------|
| S1 — Evidence architecture | 4 |
| S6 — Reconciliation layer | 6 |
| S2 — Hard gating | 8 |
| S5 — Peer engine | 8 |
| S4 — Driver trees | 10 |
| S7 — Public/private separation | 8 |
| S8 — Challenger redesign | 5 |
| S9 — UI output changes | 8 |
| S3 — Facts/inferences/judgment | 6 |
| S10 — Recommendation discipline | 5 |
| README rewrite | 2 |
| **Total** | **70 hours** |

Assuming a single experienced engineer working full 8-hour days with no context switching: **~9 working days**.

---

## Risk Register Summary

| # | Section | Biggest Risk | Mitigation |
|---|---------|-------------|-----------|
| 1 | S1 | FMP vendor data tagged lower than its true provenance | Source→class mapping is explicit const table, not inferred from label |
| 2 | S6 | Finnhub vs FMP market cap diverges >15% for most stocks, blocking priced-in analysis universally | Widen tolerance to 20%, use FMP as canonical, constant is tunable |
| 3 | S2 | Gate functions called before reconciliation completes | Enforce strict call order in orchestrator; document with comment block |
| 4 | S5 | FMP peers endpoint returns ETF/index constituents for non-US stocks | Pre-filter: type must be `'Stock'`, no ETF/index exchange, cap 0.05x–20x subject market cap |
| 5 | S4 | Archetype misclassifies UK fintech as generic private-growth | Scoring approach with `businessModelTag` + SIC + keyword; explicit override map for known names |
| 6 | S7 | Checklist over-blocks legitimate private companies with Exa data | Only `revenue-verified` and `gross-margin-verified` are `isCritical`; retention/unit-econ are not |
| 7 | S8 | 4 attacks fewer than 2+2+2; conviction downgrade becomes less sensitive | Change downgrade threshold to `highCount > 0 OR mediumCount >= 3` |
| 8 | S9 | Four-panel restructure feels sparse for well-covered public companies | Expand "What We Know" by default when `confidence.level === 'high'` |
| 9 | S3 | FactLayer duplicates `verifiedFacts[]` in UI | Gate: `if (memo.factLayer != null) renderFactLayer() else renderLegacyFacts()` |
| 10 | S10 | Strict 'buy' threshold breaks UK companies without XBRL | Gate checks `financialDepth === 'thin'` — `'adequate'` still passes; verify Diageo before shipping |

---

## Open Questions (Required Before Implementation Begins)

1. **Evidence class exposure in UI (S1):** Should `EvidenceClass` badges be shown inline on every metric in the `FinancialTable` component, or only on `EvidenceAnchor` items in the memo depth panel? The former is more transparent but visually noisy.

2. **Peer pass threshold (S5):** Is `minPassCount = 2` the right floor? With 3 passing peers you get a median row. With 2 you get a median that's just an average of two points. Should the threshold be raised to 3, which means more reports show "no valid peer set"?

3. **`'hold'` vs `'watch'` (S10):** The spec says `'hold'` should be a valid restrained output. The type already supports it. Should `'hold'` replace `'watch'` as the mid-tier output, or coexist? Current logic generates `'watch'` for medium-evidence cases. If `'hold'` now means "I own it and evidence supports staying," that's a different use case than `'watch'` (not yet in the position). Clarify intended semantics before wiring in `deriveRecommendation`.

4. **Challenger mandatory for public companies (S8):** Currently the challenger is skipped for `'Reference public comp'` role. Should it run for public companies but with the redesigned attack types? The new attacks (e.g., `'valuation-grounding'`, `'fragile-variable'`) are arguably more useful for public names than private ones.

5. **Driver tree coverage for `'other'` archetype (S4):** When `classifyArchetype` returns `'other'`, should the system apply a minimal generic driver tree (e.g., revenue + gross margin + EBITDA) or skip the driver tree entirely? Skipping means `blocksConviction` is always `false` for unclassified companies, which is permissive but avoids false blocks.

6. **Reconciliation tolerance for non-USD companies (S6):** Companies House and Finnhub values for UK companies will be in GBP and USD respectively. Currency reconciliation currently flags this as `'unresolved'`. Should it be `'partial'` (flagged but not blocking) until an FX conversion layer is added? Blocking priced-in analysis for all UK names on currency alone seems too aggressive.

7. **Cache invalidation policy:** When a cached report is served that pre-dates all these changes, should we show a "This report was generated before the evidence-quality upgrade" banner? Or silently serve the old format? The answer affects how much legacy-compat work is needed in the UI.
