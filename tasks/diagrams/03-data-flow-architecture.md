# System Architecture: Data Flow & Dependencies

## Overview
This diagram shows how all components (agents, data sources, reports) connect and flow through the system.

```mermaid
flowchart LR
    subgraph DATA_SOURCES["🔌 DATA SOURCES"]
        D1["Finnhub"]
        D2["FMP"]
        D3["SEC EDGAR"]
        D4["Companies House"]
        D5["GLEIF"]
        D6["Exa Deep"]
        D7["Claude Fallback"]
    end

    subgraph AGENTS_COMPANIES["🤖 COMPANY AGENTS"]
        A1["Market Data Agent<br/>️runWaterfall"]
        A2["Entity Agent<br/>buildEntityResolution"]
        A3["Validation Agent<br/>validateWaterfall"]
        A4["Memo Agent<br/>runMemoAgent"]
        A5["Challenger Agent<br/>runChallengerAgent"]
    end

    subgraph AGENTS_THEMES["🤖 THEME AGENTS"]
        B1["Theme Agent<br/>exploreTheme"]
    end

    subgraph REPORT_COMPONENTS["📋 REPORT COMPONENTS"]
        R1["Financial Metrics"]
        R2["Street View"]
        R3["Valuation View"]
        R4["Peer Comparison"]
        R5["Analyst Consensus"]
        R6["Earnings/Insider"]
        R7["News Sentiment"]
        R8["Evidence Signals"]
        R9["Coverage Gaps"]
        R10["Section Audit"]
    end

    subgraph OUTPUT["📊 OUTPUT"]
        O1["AnalysisReport"]
        O2["ThemeResult"]
        O3["Dashboard UI"]
    end

    D1 --> A1
    D2 --> A1
    D3 --> A1
    D4 --> A1
    D5 --> A1
    D6 --> A1
    D7 --> A1

    A1 -->|WaterfallResult| A2
    A1 -->|WaterfallResult| A3
    A1 -->|WaterfallResult| R1
    A1 -->|WaterfallResult| R2
    A1 -->|WaterfallResult| R3
    A1 -->|WaterfallResult| R4
    A1 -->|WaterfallResult| R5
    A1 -->|WaterfallResult| R6
    A1 -->|WaterfallResult| R7
    A1 -->|WaterfallResult| R8
    A1 -->|WaterfallResult| R9
    A1 -->|WaterfallResult| R10

    A2 -->|EntityResolution| A4
    A3 -->|ValidationReport| A4
    R1 --> A4
    R2 --> A4
    R3 --> A4

    A4 -->|Draft Memo| A5
    A5 -->|Challenger Report| A4
    A4 -->|Final Memo| O1

    A2 --> O1
    A1 --> O1
    A3 --> O1

    B1 --> O2

    O1 --> O3
    O2 --> O3

    style AGENTS_COMPANIES fill:#E3F2FD
    style AGENTS_THEMES fill:#F3E5F5
    style DATA_SOURCES fill:#E8F5E9
    style REPORT_COMPONENTS fill:#FFF3E0
    style OUTPUT fill:#FCE4EC
```

## Data Flow Summary

### 1. Data Sources Layer
All 7 sources are queried in parallel by the Market Data Agent:
- **Finnhub**: Market data, quotes, analyst ratings
- **FMP**: Financial metrics, peer data, historical multiples
- **SEC EDGAR**: US company filings, XBRL financials
- **Companies House**: UK company registry, accounts filings
- **GLEIF**: Global legal entity data
- **Exa Deep**: Private company research
- **Claude Fallback**: Web search synthesis (last resort)

### 2. Agents Layer

**Company Agents (5):**
1. **Market Data Agent** - Orchestrates waterfall, returns `WaterfallResult`
2. **Entity Agent** - Resolves to canonical name, returns `EntityResolution`
3. **Validation Agent** - Assesses quality, returns `ValidationReport`
4. **Memo Agent** - AI synthesis (runs twice: draft + final)
5. **Challenger Agent** - Stress tests assumptions

**Theme Agents (1):**
1. **Theme Agent** - Discovers themed companies via web search

### 3. Report Assembly Layer
Non-agent functions extract and structure data from `WaterfallResult`:
- **Financial Metrics**: Revenue, growth, margins, multiples
- **Street View**: Analyst consensus, price targets
- **Valuation View**: Current/forward P/E, EV/Sales, comparables
- **Peer Comparison**: Similar companies ranked
- **Analyst Consensus**: Buy/hold/sell ratings
- **Earnings/Insider**: Latest earnings, insider trading
- **News Sentiment**: Article tone, market mentions
- **Evidence Signals**: Key findings ranked by importance
- **Coverage Gaps**: Data limitations and blind spots
- **Section Audit**: Report quality assessment per section

### 4. Output Layer
- **AnalysisReport**: Complete structured report for companies
- **ThemeResult**: Themed companies with exposure scores
- **Dashboard UI**: Renders both reports to user

## Key Dependencies
- Market Data Agent must run first (all others depend on its output)
- Entity & Validation agents run in parallel (independent of each other)
- Report assembly happens after all agents finish
- Memo Agent (draft & final) requires Entity + Validation + Report data
- Challenger Agent depends on Memo Agent draft
- Theme Agent runs independently in separate API call

## Caching Strategy
- `AnalysisCache` table stores complete reports (15-min TTL by default)
- Report deltas compute differences from previous cached version
- Re-runs avoid redundant API calls if cache is fresh
