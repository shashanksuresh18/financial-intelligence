# Financial Intelligence — Task Tracker

## Phase 1: Build

- [ ] Step 1: Project scaffold (verify: tsc passes, dev server starts)
- [ ] Step 2: Types and interfaces
- [ ] Step 3: Finnhub client (verify: call AAPL, log response)
- [ ] Step 4: SEC EDGAR client (verify: call Apple CIK, log financials)
- [ ] Step 5: Companies House client (verify: search Revolut, log response)
- [ ] Step 6: GLEIF client (verify: search Deutsche Bank, log response)
- [ ] Step 7: Claude fallback client (verify: research SpaceX, log JSON)
- [ ] Step 8: Confidence rating logic
- [ ] Step 9: Waterfall analyzer (verify: test all 4 companies)
- [ ] Step 10: Claude narrative generation (verify: Apple report uses real SEC numbers)
- [ ] Step 11: API routes + Prisma schema (verify: curl each endpoint)
- [ ] Step 12: Frontend dashboard (verify: browser test full flow)
- [ ] Step 13: Final simplification pass

## Test Companies (must work before demo)
| Company | Expected Sources | Expected Confidence |
|---------|-----------------|-------------------|
| Apple | Finnhub + SEC EDGAR | ★★★ HIGH |
| Revolut | Finnhub + Companies House | ★★☆ MEDIUM |
| Deutsche Bank | Finnhub + GLEIF | ★★☆ MEDIUM |
| SpaceX | Claude fallback | ★☆☆ LOW |

## Review Notes
(Add after each step)
