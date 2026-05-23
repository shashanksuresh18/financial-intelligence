# Finance LLM Resource Review

Reviewed on 2026-04-21 for the current `finance_intelligence` product.

## Best To Keep

1. Build our own analysis playbooks instead of depending on third-party "skills" ecosystems.
2. Keep the grounded pipeline as the source of truth; use LLMs for synthesis, comparison, and memo writing.
3. Add finance-specific evaluation, not just generic prompt testing. FinQA-style reasoning checks are especially relevant.
4. Improve the data layer before chasing larger models. Free macro and market APIs can materially improve coverage.
5. Use domain models only where they fit a clear job:
   - `FinBERT` for finance-news / transcript sentiment
   - `FinGPT` only if we later need domain fine-tuning or offline finance QA
6. Treat automation as a data-compounding layer, not a gimmick. Scheduled collection and monitoring are more valuable than one-off prompts.
7. Be conservative on third-party agent/skill bundles. Security and prompt-injection risk are real.

## Resource 1: Finance Claude Skills Article

### Useful

- The modular "skill" idea maps well to our product. We should turn that into internal analysis modes:
  - Public Company
  - Private Company
  - Reference Public Comp / Out of Mandate
  - Theme Deep Dive
  - Monitoring Refresh
  - Valuation Stress Test
- The article is directionally right that finance teams want structured workflows, not just chat.
- The categories are helpful roadmap inputs:
  - equity research
  - data analysis
  - DCF / scenario modeling
  - backtesting
  - spreadsheet generation
- The security warnings are highly relevant if we ever import third-party prompt bundles, skills, or scripts.

### Not Worth Copying Directly

- We should not build the product around Claude Skills terminology or a plugin marketplace model.
- Third-party skills are not a substitute for better entity resolution, better evidence, or stronger mandate-fit logic.
- The article is stronger as workflow inspiration than as implementation guidance for this codebase.

## Resource 2: AI Finance Guide V2.1 PDF

The PDF is worth keeping, but mostly as a curated idea list. It is partly educational and partly marketing-heavy.

### Most Useful Ideas

- `FinGPT`
  - Useful as a finance-domain model reference.
  - Most relevant for future fine-tuning, offline experimentation, or finance-specific QA.
  - Not an immediate replacement for our current grounded memo stack.
- `FinBERT`
  - Immediately relevant.
  - Good fit for scoring finance-news and earnings-call sentiment in a deterministic sidecar pipeline.
- `FinQA`
  - Very relevant.
  - We should use it as a mental model for evaluating finance reasoning: multi-step numerical reasoning over filings and reports.
  - Strong candidate for future eval harnesses in this repo.
- Automation layer (`n8n`, `Make`)
  - Useful as orchestration inspiration for scheduled ingestion, monitoring, and alerting.
  - Good for background jobs, not core research logic.
- Free data layer
  - Strongest practical part of the PDF.
  - Especially useful for us:
    - `FRED` for macro regime data
    - `Polygon` for cleaner US market reference data if needed
    - `World Bank` for global macro / EM context
    - `NASDAQ Data Link` for commodity / bond / alternative datasets
    - `CoinGecko` if we ever expand into crypto
  - `yfinance` and `Alpha Vantage` are useful, but more as prototyping sources than primary institutional-quality sources.

### Medium Value

- The "hedge fund AI stack" framing is useful as a system diagram:
  - data layer
  - model layer
  - evaluation layer
  - automation layer
  - delivery layer
- The main strategic point is correct: edge usually comes from better data workflows and evaluation discipline, not from a magic model.

### Low Value / Ignore

- The viral content playbook is not relevant to product quality.
- "Build a hedge fund AI for free" is marketing language, not a serious diligence framework.
- Some claims are oversimplified:
  - model cost comparisons are directionally interesting but not enough to guide architecture
  - free tools do not equal institutional-grade reliability
  - FinGPT is useful, but not a trading system

## What This Means For Our Product

### High Priority

1. Keep the current deterministic evidence stack and Nebius synthesis flow.
2. Add better retrieval content:
   - analyst note summaries
   - prior report snapshots
   - company-specific historical memo snippets
3. Add a finance-specific evaluation layer inspired by FinQA:
   - can the system reason over multiple facts
   - can it reconcile narrative with valuation
   - can it detect when evidence is insufficient
4. Add a deterministic sentiment sidecar for news / transcripts, with `FinBERT` as a candidate.
5. Add macro-context enrichment for relevant names using `FRED` and possibly `World Bank`.

### Good Next, But Not First

1. Test `FinGPT` in a research sandbox for finance QA and memo-comparison experiments.
2. Add scheduled background ingestion / monitoring workflows.
3. Add scenario-analysis or DCF modules for the names where that actually fits the mandate.

### Defer

1. Full model fine-tuning.
2. Backtesting / quant-trading features.
3. Content-marketing playbooks.
4. Any dependency on third-party skills ecosystems inside the product.

## Senior Analyst View

The most important takeaway is that finance LLM systems get better when they are treated as:

- synthesis engines
- evaluation assistants
- workflow accelerators

and not as:

- primary truth sources
- valuation calculators of record
- substitutes for evidence quality

For this repo, the best next improvements are still better evidence, better mandate-fit framing, better retrieval, and better finance-specific evals.
