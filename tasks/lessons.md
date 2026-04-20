# Lessons Learned

## How To Use This File
After ANY correction from the user:
1. Document what went wrong
2. Write the rule to prevent it
3. If it could recur, also add the rule to CLAUDE.md

Review this file at the start of every session.

## Rules
(None yet - this file grows as the project progresses)

## Log
(Add entries in reverse chronological order)

- Cross-registry waterfalls must treat Companies House as jurisdictional evidence, not a default fallback. Explicit UK signals should allow it, strong US SEC/listing evidence should suppress it, and any SEC-vs-Companies House name mismatch must be flagged so downstream memo sections ignore contaminated UK registry cues.
- Autocomplete fixes must be applied on the live `/api/search` path, not just the analysis waterfall. Known private-company queries need an early synthetic result and must bypass Companies House before dormant shell-company matches can enter the dropdown.
- Known-private-company routing must bypass Companies House as well as Finnhub/FMP, and challenger-style JSON generation needs both enough token headroom and explicit truncation diagnostics/repair so dense memos do not collapse into empty arrays.
- Regression fixes must be verified on the live execution path: parsing needs to handle wrapped model JSON, private-company guards must short-circuit the waterfall before bad market matches run, and persisted UI state must restore before first render when refresh behavior matters.
- QA regressions clustered around integration seams: model IDs can silently deprecate, backend fields can be generated without UI coverage, and free-tier APIs can reject optional endpoints. Before calling a feature complete, verify model IDs are current, every persisted memo field is rendered where intended, and optional upstream failures degrade to partial coverage instead of breaking the run.
- Private-company resolution must never rely on loose substring matches. Exact or near-exact name matches must outrank market-cap heuristics, and known private-company queries should reject weak non-US low-cap public listings so fallback research can run.
- Entity disambiguation must treat unknown 1-2 letter exchange suffixes as Tier 1 by default, and ADR promotion must prefer Tier 0 common-stock listings before any Tier 1 fallback regardless of market cap ordering.
- Entity resolution must never short-circuit on exact ticker hits or partial symbol substrings. Run all candidates through name-relevance filtering plus primary-listing ranking before choosing a company.
- Search flows must separate live input from loaded report state. If the user edits the query, clear or invalidate any in-flight analysis so the UI cannot keep showing a previous company's report for a new query.
