# Improvement Roadmap: Evidence-First Institutional Analyst Tool

This roadmap is based on the current architecture in `CLAUDE.md`, `tasks/todo.md`, `src/lib/types.ts`, `src/lib/analyzer.ts`, `src/lib/datasources/finnhub.ts`, `src/components/Report.tsx`, `src/lib/claude-narrative.ts`, and `src/lib/confidence.ts`.

## Current State

- The app already has a source waterfall across Finnhub, SEC EDGAR, Companies House, GLEIF, and a Claude fallback.
- Confidence is computed from a small set of coarse rules, not from evidence completeness, source freshness, or claim support.
- The narrative layer is still mostly freeform prose, with only light guardrails against invented numbers.
- The report UI shows a summary, a narrative, a metrics table, a consensus block, and source count, but not a claim-level evidence trail.
- Placeholder types still exist in `src/lib/types.ts`, which signals that the domain model is not yet fully institutionalized.

## Target State

Build an analyst workflow where every important statement is backed by:

- a named source
- a timestamp
- a structured claim or metric
- a confidence weight
- a traceable provenance record

The output should read like an institutional research note:

- evidence-first
- explicit about what is known and unknown
- separated into facts, inference, and commentary
- auditable after the fact

---

## P0 - Correctness, Evidence, and Traceability

Priority goal: make every report claim traceable to structured evidence before expanding scope.

### 1. Introduce an evidence ledger

- Add a first-class evidence model for source facts, derived claims, and narrative assertions.
- Capture source, endpoint, fetched time, raw value, normalized value, and validation status.
- Distinguish between direct facts, derived metrics, and analyst interpretation.
- Attach evidence references to every metric and consensus item.

### 2. Replace coarse confidence with evidence-based scoring

- Score confidence from source coverage, source freshness, data type quality, and claim support.
- Penalize stale or partial data.
- Separate confidence for the company-level conclusion from confidence for individual claims.
- Make rationale machine-readable so the UI can render why the score changed.

### 3. Make narrative generation citation-aware

- Require Claude output to reference evidence IDs or source labels for each paragraph.
- Prevent uncited numeric claims from entering the report.
- Force explicit labeling of inferred statements versus factual statements.
- Preserve the fallback role of Claude as synthesis only, not as a hidden source of facts.

### 4. Strengthen the analyzer contract

- Return a structured report payload with evidence blocks, not only prose and metrics.
- Keep source failures visible in the payload instead of collapsing them away.
- Preserve the waterfall order, but expose which sources were attempted, succeeded, or failed.
- Record why the final confidence score was chosen.

### 5. Upgrade validation boundaries

- Validate every external response against source-specific schemas.
- Normalize timestamps, currencies, units, and accounting periods at ingestion.
- Reject malformed or ambiguous fields instead of silently passing them through.

### Acceptance criteria

- Every metric in the report can point back to a source and fetch timestamp.
- Confidence changes when evidence coverage changes.
- No report contains a numeric statement that lacks a source reference.
- Failed sources are visible to the user or to downstream consumers.

---

## P1 - Institutional Research Workflow

Priority goal: turn the analyzer into a repeatable research workflow rather than a one-shot report generator.

### 1. Add claim extraction and categorization

- Split output into facts, management signals, market signals, risks, and unresolved questions.
- Categorize claims as direct, derived, or inferred.
- Track whether each claim is supported by one source, multiple sources, or only partial evidence.

### 2. Add an evidence-ranked report structure

- Surface the most important evidence first instead of leading with prose.
- Show company identity, source coverage, key financials, analyst consensus, and open questions in a fixed order.
- Let the narrative summarize the evidence, not replace it.

### 3. Add source freshness and coverage reporting

- Expose how recent each source is.
- Show which parts of the company profile are covered by which sources.
- Highlight when the analysis is mostly registry data, mostly market data, or mostly filing data.

### 4. Improve entity resolution

- Resolve ambiguous company names into explicit identifiers and candidate matches.
- Prefer stable identifiers such as ticker, CIK, company number, or LEI where available.
- Persist the chosen entity resolution path for reproducibility.

### 5. Add analyst workflow primitives

- Add watchlist state that can store followed companies and prior report snapshots.
- Track report history so users can compare today’s analysis with prior runs.
- Support manual notes and analyst overrides without overwriting source facts.

### Acceptance criteria

- Users can see why a company was resolved to a specific entity.
- Reports expose coverage gaps as first-class UI elements.
- Historical report snapshots can be compared without recomputing the entire interpretation.
- Analyst notes remain separate from source-backed facts.

---

## P2 - Productization and Analyst Productivity

Priority goal: make the tool useful in an institutional workflow day to day.

### 1. Build diffing and change detection

- Compare the latest report to the prior snapshot.
- Highlight changes in key metrics, source freshness, analyst consensus, and confidence.
- Flag material changes in wording when the underlying facts are unchanged.

### 2. Add alerting and monitoring

- Trigger alerts when confidence drops, filings change, consensus shifts, or a key source disappears.
- Make alerts based on specific evidence changes rather than general company updates.
- Support per-company and portfolio-level monitoring.

### 3. Add export-ready report formats

- Produce board-style summaries, research notes, and terse evidence memos.
- Export the evidence ledger alongside the narrative so downstream teams can audit claims.
- Provide a consistent format for copy/paste into internal systems.

### 4. Add user-facing provenance details

- Display source timestamps, source quality notes, and exact origin labels in the UI.
- Make the distinction between primary and fallback sources obvious.
- Provide explainability for why the report trusts one source over another.

### 5. Add operational telemetry

- Track waterfall failures by source and company type.
- Track how often fallback synthesis is used.
- Track report completion time, source latency, and validation failures.

### Acceptance criteria

- Users can see a before/after delta for any company they monitor.
- Alerts are tied to evidence changes, not just keyword matches.
- Exported reports preserve provenance and timestamps.
- The team can identify which data sources are degrading in production.

---

## P3 - Institutional Platform Maturity

Priority goal: evolve from a research tool into a durable analyst platform.

### 1. Add multi-company and portfolio views

- Compare companies within the same sector, geography, or capital structure.
- Aggregate confidence and evidence coverage across a watchlist or portfolio.
- Surface relative ranking on evidence completeness rather than only headline performance.

### 2. Add reusable research objects

- Save thesis statements, evidence bundles, and resolved questions as reusable artifacts.
- Link multiple reports to a single company dossier.
- Support cross-report citation reuse where the same source fact appears in several notes.

### 3. Add governance and review workflows

- Add approval states for research notes before they are shared.
- Record who reviewed or edited an interpretation.
- Preserve an audit trail for factual changes, not only UI edits.

### 4. Add stronger source expansion

- Add more filing and registry sources where jurisdictional coverage is thin.
- Expand beyond single-company lookups into document-level and event-level ingestion.
- Support sector-specific enrichment when a company profile needs deeper analysis.

### 5. Add quality controls for institutional use

- Measure statement-level factuality.
- Measure unsupported-claim rate.
- Measure source overlap and contradiction detection.
- Create regression tests for high-value companies and edge cases.

### Acceptance criteria

- The platform supports repeatable research workflows for multiple companies.
- Research artifacts are reviewable, auditable, and reusable.
- Source quality and factuality are tracked as metrics.
- New sources can be added without breaking the evidence model.

---

## Implementation Order

1. P0 first: evidence model, traceability, validation, and confidence redesign.
2. P1 next: claim classification, entity resolution, and report structure.
3. P2 after that: diffs, alerts, exports, provenance UI, and telemetry.
4. P3 last: portfolio workflows, governance, reusable research artifacts, and broader source coverage.

## Non-Negotiables

- Claude remains synthesis only.
- Every number must stay traceable to a structured source.
- Every report must distinguish fact from inference.
- Data-source failures must remain visible internally.
- The UI should never imply certainty beyond the available evidence.

## Suggested Definition of Done

- Source-backed facts and derived claims are separate types.
- Reports show provenance at the claim or metric level.
- Confidence is evidence-aware, not just source-presence aware.
- Narratives cite or reference the evidence they summarize.
- The UI makes freshness, coverage, and uncertainty obvious.
