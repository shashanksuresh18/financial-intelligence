# Handoff

## Phase 2

- Status: Fixed on 2026-04-17.
- Scope: Removed the exact-match Finnhub bypass, added exchange-tier tie-breaking, and filtered ambiguity candidates to brand-relevant company names.
- Verification: `cmd /c npx tsc --noEmit` passed. `node --loader ./test-entity-loader.mjs ./test-entity.mjs` exercised the resolver with HSBC, Shell, Virgin, Apple, and Microsoft fixtures because outbound network access is blocked in this sandbox.
