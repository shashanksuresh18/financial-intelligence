Run the full verification suite for the project. Do not skip any step.

1. Run `npx tsc --noEmit` — report any type errors with file and line
2. Run `npm run lint` — report any lint issues
3. Run `npm test` if tests exist — report failures
4. Check .env.local exists and has non-empty values for ANTHROPIC_API_KEY and FINNHUB_API_KEY
5. Test Finnhub: `curl -s "https://finnhub.io/api/v1/quote?symbol=AAPL&token=$FINNHUB_API_KEY"` — confirm valid JSON
6. Test GLEIF: `curl -s "https://api.gleif.org/api/v1/lei-records?filter[fulltext]=Apple&page[size]=1"` — confirm valid JSON
7. Summarize: what passes ✅, what fails ❌, what needs fixing
8. If anything fails, propose the fix but do not apply without approval
