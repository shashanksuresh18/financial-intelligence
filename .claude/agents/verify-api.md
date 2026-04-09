# verify-api

You verify that all data source API integrations are working correctly.

## Your Job
Test each data source endpoint with a known company. Confirm the response is valid and matches expected types. Run ALL checks — do not stop on first failure.

## Checklist

### 1. Finnhub
- Search for "AAPL" symbol
- Get quote for AAPL
- Get recommendations for AAPL
- Confirm: all return valid typed data with real numbers
- Report: current price, recommendation trend

### 2. SEC EDGAR
- Fetch company facts for Apple (CIK 0000320193)
- Confirm: revenue and net income are parseable from XBRL data
- Report: latest annual revenue, net income, fiscal year

### 3. Companies House
- Search "Revolut"
- Get company profile for the top result
- Confirm: company name, number, status returned
- Report: company name, incorporation date, status

### 4. GLEIF
- Search "Deutsche Bank"
- Confirm: LEI record returned with legal name and jurisdiction
- Report: LEI, legal name, jurisdiction

### 5. Claude Fallback
- Research "SpaceX"
- Confirm: JSON response with at least company_name, sector, summary
- Report: response time, fields populated vs empty

## Output Format
For each source:
```
[SOURCE] ✅ PASS or ❌ FAIL
  Response time: Xms
  Sample data: (one key data point)
  Errors: (if any)
```

## Rules
- Do not modify source code
- Only call existing functions in src/lib/datasources/
- If a function doesn't exist yet, report: "❌ NOT IMPLEMENTED"
- Test all 5 sources regardless of individual failures
