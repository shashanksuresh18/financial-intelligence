Test the full analysis pipeline for a company.

Company to analyze: $ARGUMENTS

Steps:
1. If the dev server is not running, start it with `npm run dev &`
2. Call POST http://localhost:3000/api/analyze with body: {"name": "$ARGUMENTS"}
3. Wait for the response (may take 10-30 seconds for Claude fallback companies)
4. Report:
   - Company name and ticker
   - Which data sources returned data (and which failed)
   - Confidence rating
   - Whether all report sections have content
   - Any errors or empty fields
5. If the analysis failed entirely, inspect the error and suggest a fix
