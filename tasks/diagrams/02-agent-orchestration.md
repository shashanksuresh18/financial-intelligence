# Agent Orchestration Sequence

## Overview
This diagram shows how the **Orchestrator** (`runAnalysis()`) coordinates all agents during a company analysis workflow. Each agent runs in sequence, building on outputs from previous agents.

```mermaid
flowchart TD
    A["ORCHESTRATOR<br/>runAnalysis()"] --> B["1️⃣ Market Data Agent"]

    B --> B1["Run Waterfall:<br/>Finnhub, FMP, SEC EDGAR,<br/>Companies House, GLEIF,<br/>Exa Deep, Claude Fallback"]
    B1 --> B2["Returns: WaterfallResult<br/>with all source data"]

    B2 --> C["2️⃣ Entity Agent"]
    C --> C1["Resolve Company<br/>prioritize by source<br/>SEC > Finnhub > CH > GLEIF > Exa"]
    C1 --> C2["Returns: EntityResolution<br/>Canonical name + Primary source"]

    C2 --> D["3️⃣ Validation Agent"]
    D --> D1["Assessment of<br/>Data Quality<br/>Coverage Label"]
    D1 --> D2["Returns: ValidationReport<br/>Coverage + Tensions + Gaps"]

    B2 --> E["4️⃣ Report Assembly<br/>Non-agent functions"]
    E --> E1["Extract Metrics<br/>Street View<br/>Valuation View<br/>Earnings Highlights<br/>Insider Activity<br/>News Sentiment<br/>Peer Comparison<br/>Recent Developments"]
    E1 --> E2["Build Signals<br/>Coverage Gaps<br/>Disagreement Notes<br/>Section Audit"]

    D2 --> F["5️⃣ Memo Agent<br/>DRAFT PASS"]
    E2 --> F
    C2 --> F

    F --> F1["Investment Memo<br/>Narrative<br/>Investment Thesis"]
    F1 --> G["6️⃣ Challenger Agent"]

    G --> G1["Review Draft Memo<br/>Stress test assumptions<br/>Identify gaps"]
    G1 --> G2["Returns: ChallengerReport<br/>Unstated Assumptions<br/>Evidence Gaps<br/>Counter Scenarios"]

    G2 --> H["7️⃣ Memo Agent<br/>FINAL PASS"]

    H --> H1["Incorporate Challenger<br/>Generate Final<br/>Investment Memo"]

    H1 --> I["Return AnalysisReport<br/>Complete Package:<br/>- Entity Resolution<br/>- Metrics<br/>- Memo<br/>- Signals<br/>- Coverage Gaps<br/>- Confidence"]

    I --> J["📊 Display on Dashboard"]

    style A fill:#4A90E2
    style B fill:#50C878
    style C fill:#50C878
    style D fill:#50C878
    style F fill:#FF6B6B
    style G fill:#FF6B6B
    style H fill:#FF6B6B
    style E fill:#FFB84D
```

## Agent Execution Order

### Phase 1: Data Collection
1. **Market Data Agent** (`runWaterfall()`)
   - Fetches from 7 sources in parallel
   - Returns unified `WaterfallResult`

### Phase 2: Entity Resolution
2. **Entity Agent** (`buildEntityResolution()`)
   - Resolves to canonical company name
   - Priority: SEC > Finnhub > Companies House > GLEIF > Exa > Claude
   - Returns `EntityResolution` with all identifiers

3. **Validation Agent** (`validateWaterfall()`)
   - Assesses data quality
   - Flags tensions and gaps
   - Returns `ValidationReport`

### Phase 3: Report Assembly (Non-Agent)
4. **Report Functions** (10+ assembly functions)
   - Extract metrics, valuations, peer data
   - Build evidence signals
   - Identify coverage gaps

### Phase 4: AI Synthesis (Claude API)
5. **Memo Agent** - **DRAFT PASS** (`runMemoAgent()`)
   - Generates initial investment memo
   - Returns draft thesis

6. **Challenger Agent** (`runChallengerAgent()`)
   - Reviews draft for weak spots
   - Identifies assumptions and gaps
   - Returns challenger report

7. **Memo Agent** - **FINAL PASS** (`runMemoAgent()`)
   - Incorporates challenger feedback
   - Generates final investment memo
   - Returns complete narrative

## Typical Execution Time
- Market Data Agent: 1-2s
- Entity Resolution: <100ms
- Validation: <100ms
- Report Assembly: <200ms
- Draft Memo: 2-3s
- Challenger Review: 1-2s
- Final Memo: 2-3s
- **Total: ~7-12 seconds**

## Key Design Patterns
- **No hard failures**: Every agent has a fallback/empty result
- **Parallel data fetch**: All 7 sources fetch simultaneously
- **Staged synthesis**: Draft → Challenge → Final creates adversarial review
- **Composability**: Later agents consume outputs from earlier ones
