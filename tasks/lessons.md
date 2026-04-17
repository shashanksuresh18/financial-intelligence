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

- Entity disambiguation must treat unknown 1-2 letter exchange suffixes as Tier 1 by default, and ADR promotion must prefer Tier 0 common-stock listings before any Tier 1 fallback regardless of market cap ordering.
- Entity resolution must never short-circuit on exact ticker hits or partial symbol substrings. Run all candidates through name-relevance filtering plus primary-listing ranking before choosing a company.
- Search flows must separate live input from loaded report state. If the user edits the query, clear or invalidate any in-flight analysis so the UI cannot keep showing a previous company's report for a new query.
