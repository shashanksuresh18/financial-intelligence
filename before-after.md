# Before / After Examples

These examples compare the older memo style with the stricter evidence-led output. Excerpts are taken from saved local JSON artifacts where available.

## Apple Inc.

| Old report excerpt | New report excerpt |
| --- | --- |
| `Hold: Apple Inc. is a reference public comp, not a direct target: latest reported revenue growth is +10.1% on the current evidence set, with +15.7% Street upside to $313.95, but its scale and mandate mismatch keep it in benchmark territory rather than the actionable target set.`<br><br>`The thesis rests on $313.95 consensus target (+15.7% upside), EV/Sales of 9.4x, 2028-09-27 estimates of revenue $531,788,544,152/EPS 10.36, SEC-backed gross margin of 78.4%, CapEx / Revenue of 5.1%, free-cash-flow margin of 46.2%.` | **Facts:** Revenue (Latest FY): `$215.6B` `[primary-filing]`; Gross Margin (Latest FY): `78.44%` `[primary-filing]`; Free Cash Flow Margin (Latest FY): `46.18%` `[primary-filing]`.<br><br>**Inference:** Revenue growth is positive at `10.1%`; P/E compresses from `33.7x` current to `26.2x` forward, making the valuation view dependent on forecast delivery.<br><br>**Judgment:** `hold`, `Reference public comp`, medium conviction, `judgmentLayer.blocked = false`. |

**Commentary:** The old output mixed facts, consensus upside, valuation, and mandate judgment in one prose thesis. The new output separates filing-backed facts from mechanical valuation inferences and keeps Apple in the restrained `Reference public comp` role instead of trying to force it into a direct target view.

## Klarna

| Old report excerpt | New report excerpt |
| --- | --- |
| `Watch: Klarna Group plc merits follow-up because consensus target implies +85.4% versus the current price, with +85.4% Street upside to $24.83, but no structured SEC XBRL fact set was attached, and the UK registry currently supplies accounts metadata rather than parsed filing facts, so filing-backed financial analysis remains limited.`<br><br>`The thesis is conditional: if $24.83 consensus target (+85.4% upside), EV/Sales of 2.4x, 2028-12-31 estimates of revenue $6,243,493,511/EPS 1.24 hold and consensus target implies +85.4% versus the current price, the setup could become actionable.` | **Facts:** Current Price: `$13.92` `[market-data-vendor]`; Last Accounts Made Up To: `2024-12-31` `[registry]`; UK accounts metadata is available from Companies House `[registry]`.<br><br>**Inference:** EV/Sales compresses from `2.4x` current to `1.3x` forward, making the valuation view dependent on forecast delivery.<br><br>**Withheld:** `Scenario analysis withheld because key assumptions are unverified`.<br><br>**Judgment:** `watch`, low conviction. |

**Commentary:** The old output let consensus-target upside carry too much of the thesis. The new output still allows Klarna to remain a follow-up candidate, but it separates registry and market-data facts from the valuation inference and withholds the scenario range when key operating assumptions are not verified.

## Anthropic

| Old report excerpt | New report excerpt |
| --- | --- |
| `Primary diligence required - Primary diligence required: Anthropic merits deeper work because Exa Deep Research surfaced estimated revenue of $14B (annualized run-rate, Feb 2026), with estimated revenue around $14B (annualized run-rate, Feb 2026), but the current read relies mainly on synthesized public-web research rather than management materials, primary company disclosures, or audited private-company reporting.`<br><br>`The company may warrant future attention, but the present evidence base is not yet investment-grade.` | **Facts:** Estimated Revenue: `$14B (annualized run-rate, Feb 2026)` `[synthesized-web]`; Total Funding: `~$67B across 17+ rounds` `[synthesized-web]`; Last Valuation: `$380B post-money (Series G, Feb 2026)` `[synthesized-web]`.<br><br>**Diligence gate:** `Primary diligence required. 1 critical check is unresolved: Gross Margin Verified.`<br><br>**Missing:** Gross margin, retention / NDR, governance, and unit economics.<br><br>**Judgment:** low conviction, `Private diligence`, no underwriteable thesis until primary diligence closes the missing checks. |

**Commentary:** The old excerpt was already cautious, but it repeated the label and still read like a memo summary. The new shape makes the evidence class explicit and turns the private-company output into a diligence gate: revenue and funding are treated as synthesized web evidence, while missing gross margin and unit economics block underwriting.
