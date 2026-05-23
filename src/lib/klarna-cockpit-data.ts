import { readFileSync } from "node:fs";
import path from "node:path";

export type EvidenceSource = {
  readonly id: string;
  readonly label: string;
  readonly fullName: string;
  readonly publisher: string;
  readonly date: string;
  readonly freshness: number;
  readonly confidence: number;
  readonly url?: string;
};

export type EvidenceItem = {
  readonly id: string;
  readonly sourceId: string;
  readonly quote: string;
};

export type EvidenceRef = {
  readonly id: string;
};

export type MetricTile = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly evidence: EvidenceRef;
  readonly drilldownId: string;
};

export type ClaimBullet = {
  readonly text: string;
  readonly evidence: EvidenceRef;
};

export type ThesisCell = {
  readonly id: string;
  readonly title: string;
  readonly eyebrow?: string;
  readonly bullets: readonly ClaimBullet[];
  readonly drilldownId: string;
};

export type ScenarioCard = {
  readonly title: string;
  readonly stance: string;
  readonly text: string;
  readonly range?: string;
  readonly evidence: EvidenceRef;
  readonly drilldownId: string;
};

export type MissingDataItem = {
  readonly label: string;
  readonly tone: "amber" | "red";
  readonly evidence: EvidenceRef;
};

export type CatalystItem = {
  readonly label: string;
  readonly evidence: EvidenceRef;
};

export type DrilldownSection = {
  readonly id: string;
  readonly title: string;
  readonly content: string;
};

export type KlarnaLivePrice = {
  readonly asOfDate: string;
  readonly displayPrice: string;
};

export type LivePriceStatus = "fallback" | "live";

export type KlarnaCockpitData = {
  readonly title: string;
  readonly verdict: string;
  readonly asOfDate: string;
  readonly lastCoreSourceDate: string;
  readonly livePrice: string;
  readonly livePriceStatus: LivePriceStatus;
  readonly scores: readonly {
    readonly label: string;
    readonly value: string;
    readonly detail: string;
  }[];
  readonly coreDebate: {
    readonly text: string;
    readonly evidence: EvidenceRef;
    readonly drilldownId: string;
  };
  readonly executiveSummary: DrilldownSection;
  readonly metrics: readonly MetricTile[];
  readonly thesisCells: readonly ThesisCell[];
  readonly scenarios: readonly ScenarioCard[];
  readonly scenarioDisclaimer?: string;
  readonly missingData: readonly MissingDataItem[];
  readonly catalyst: {
    readonly headline: string;
    readonly date: string;
    readonly watchItems: readonly CatalystItem[];
    readonly evidence: EvidenceRef;
  };
  readonly sources: readonly EvidenceSource[];
  readonly evidence: readonly EvidenceItem[];
  readonly drilldowns: readonly DrilldownSection[];
  readonly rawMarkdown: string;
};

type ClaudeJsonOutput = {
  readonly result?: unknown;
};

const SOURCE_URLS = {
  q4Earnings:
    "https://s205.q4cdn.com/644747736/files/doc_earnings/2025/q4/earnings-result/Q4-25-Klarna-Group-plc-Earnings-Release.pdf",
  q4Press:
    "https://s205.q4cdn.com/644747736/files/doc_earnings/2025/q4/earnings-result/Q4-25-Klarna-Group-plc-Press-Release.pdf",
  q4Presentation:
    "https://s205.q4cdn.com/644747736/files/doc_earnings/2025/q4/presentation/presentation-Q4-2025.pdf",
  q1Event:
    "https://investors.klarna.com/News--Events/news/news-details/2026/Klarna-to-Publish-Q1-2026-Earnings-on-May-14-2026/default.aspx",
  q4Webcast: "https://klarna.events.inderes.com/q4-report-2025?seek=681",
} as const;

const SOURCES: readonly EvidenceSource[] = [
  {
    id: "S1",
    label: "Q4 2025 earnings release",
    fullName: "Klarna Group plc Q4 2025 earnings release",
    publisher: "Klarna Group plc",
    date: "2026-02-19",
    freshness: 75,
    confidence: 90,
    url: SOURCE_URLS.q4Earnings,
  },
  {
    id: "S2",
    label: "Q4 2025 press release",
    fullName: "Klarna Group plc Q4 2025 press release",
    publisher: "Klarna Group plc",
    date: "2026-02-19",
    freshness: 75,
    confidence: 88,
    url: SOURCE_URLS.q4Press,
  },
  {
    id: "S3",
    label: "Investor presentation Q4 2025",
    fullName: "Klarna Group plc Q4 2025 investor presentation",
    publisher: "Klarna Group plc",
    date: "2026-02-19",
    freshness: 75,
    confidence: 86,
    url: SOURCE_URLS.q4Presentation,
  },
  {
    id: "S4",
    label: "Saved plugin audit",
    fullName: "Saved Klarna Claude equity-research plugin output",
    publisher: "Local prototype / Claude plugin run",
    date: "2026-05-07",
    freshness: 100,
    confidence: 78,
  },
  {
    id: "S5",
    label: "Q1 2026 earnings notice",
    fullName: "Klarna to publish Q1 2026 earnings on May 14, 2026",
    publisher: "Klarna Group plc",
    date: "2026-05-14",
    freshness: 95,
    confidence: 90,
    url: SOURCE_URLS.q1Event,
  },
  {
    id: "S6",
    label: "Live FMP price feed",
    fullName: "Live FMP price feed (static fallback in this prototype)",
    publisher: "Financial Modeling Prep / local static fallback",
    date: "2026-05-07",
    freshness: 100,
    confidence: 60,
  },
];

const EVIDENCE_DEFINITIONS: readonly {
  readonly id: string;
  readonly sourceId: string;
  readonly needle: string;
  readonly fallback: string;
}[] = [
  {
    id: "verdict",
    sourceId: "S1",
    needle: "The miss was in Transaction Margin Dollars",
    fallback:
      "The miss was in Transaction Margin Dollars (TMD): $372m vs. guidance of $390-400m.",
  },
  {
    id: "core-debate",
    sourceId: "S1",
    needle: "Is the TMD miss a temporary growth tax",
    fallback:
      "Is the TMD miss a temporary growth tax, or evidence that Fair Financing is structurally credit-cost-heavy at scale?",
  },
  {
    id: "gmv",
    sourceId: "S1",
    needle: "GMV of **$38.7b**",
    fallback: "Klarna delivered Q4 2025 GMV of $38.7b (+32% YoY).",
  },
  {
    id: "revenue",
    sourceId: "S1",
    needle: "Q4 2025 revenue of **$1,082m**",
    fallback: "Klarna delivered Q4 2025 revenue of $1,082m (+38% YoY).",
  },
  {
    id: "adjusted-profit",
    sourceId: "S1",
    needle: "adjusted operating profit of **$47m**",
    fallback:
      "The adjusted operating profit of $47m marks the fourth consecutive quarter of adjusted profitability.",
  },
  {
    id: "ifrs-loss",
    sourceId: "S1",
    needle: "FY2025 IFRS net loss",
    fallback: "FY2025 IFRS net loss: $(273)m, vs. profit of $21m in 2024.",
  },
  {
    id: "consumers",
    sourceId: "S3",
    needle: "Banking consumers at 15.8m",
    fallback:
      "Banking consumers at 15.8m (+101% YoY) with ARPU of $107 vs. $30 average.",
  },
  {
    id: "merchants",
    sourceId: "S1",
    needle: "118m consumer base",
    fallback:
      "Klarna's geographic diversification and 118m consumer base provide structural optionality.",
  },
  {
    id: "market-like-growth",
    sourceId: "S1",
    needle: "Revenue beat guidance",
    fallback:
      "Revenue beat guidance. First $1B quarter is symbolically important for a post-IPO growth narrative.",
  },
  {
    id: "market-like-gmv",
    sourceId: "S1",
    needle: "GMV growth reaccelerating",
    fallback: "GMV growth reaccelerating: 6% -> 21% -> 25% -> 32%.",
  },
  {
    id: "market-like-ai",
    sourceId: "S3",
    needle: "revenue per employee at $1.24m",
    fallback: "AI-driven operating model: revenue per employee at $1.24m.",
  },
  {
    id: "market-like-provisions",
    sourceId: "S1",
    needle: "Provision rates improving sequentially",
    fallback:
      "Provision rates improving sequentially (0.72% -> 0.65%) while Fair Financing volume grew 165% YoY.",
  },
  {
    id: "market-dislike-tmd",
    sourceId: "S1",
    needle: "TMD missed guidance",
    fallback: "TMD missed guidance for the second or third consecutive quarter.",
  },
  {
    id: "market-dislike-loss",
    sourceId: "S1",
    needle: "Operating loss of $(230)m",
    fallback:
      "Operating loss of $(230)m for full year 2025 vs. $(121)m in 2024.",
  },
  {
    id: "market-dislike-take-rate",
    sourceId: "S1",
    needle: "Revenue take rate (2.80%)",
    fallback:
      "Revenue take rate (2.80%) is high partly due to $73m one-time gain on sale.",
  },
  {
    id: "market-dislike-cash-flow",
    sourceId: "S1",
    needle: "Cash flow from operations",
    fallback: "Cash flow from operations: ($(1,032)m) in FY2025 vs. +$587m in FY2024.",
  },
  {
    id: "priced-in-unverified",
    sourceId: "S4",
    needle: "Unverifiable without current market data",
    fallback:
      "Unverifiable without current market data: price-to-revenue multiple, peer comps spread, upside/downside to consensus.",
  },
  {
    id: "pressure-tm",
    sourceId: "S1",
    needle: "Transaction margin as a percentage of revenue was 34.4%",
    fallback:
      "Transaction margin as a percentage of revenue was 34.4% in Q4 2025 vs. 40.6% in Q4 2024.",
  },
  {
    id: "pressure-ipo",
    sourceId: "S4",
    needle: "Latency",
    fallback:
      "This report is produced May 7, 2026 - approximately 11 weeks after earnings.",
  },
  {
    id: "scenario-bull",
    sourceId: "S1",
    needle: "Fair Financing provisions are genuinely front-loaded",
    fallback:
      "Fair Financing provisions are genuinely front-loaded and deferred revenue compounds faster than originations grow.",
  },
  {
    id: "scenario-base",
    sourceId: "S1",
    needle: "TMD recovers modestly",
    fallback: "TMD recovers modestly in H2 2026 as early Fair Financing cohorts season.",
  },
  {
    id: "scenario-bear",
    sourceId: "S1",
    needle: "Fair Financing loss rates deteriorate",
    fallback:
      "Fair Financing loss rates deteriorate in a weaker consumer environment.",
  },
  {
    id: "scenario-kill",
    sourceId: "S1",
    needle: "Regulatory action in the U.S. or EU",
    fallback:
      "Regulatory action forces Klarna to hold more regulatory capital against Fair Financing receivables.",
  },
  {
    id: "missing-webcast",
    sourceId: "S4",
    needle: "Management webcast and Q&A",
    fallback: "Management webcast and Q&A could not be fetched in this session.",
  },
  {
    id: "missing-xlsx",
    sourceId: "S4",
    needle: "Q4 Historical Financial Statements XLSX",
    fallback: "Q4 Historical Financial Statements XLSX could not be read.",
  },
  {
    id: "missing-consensus",
    sourceId: "S4",
    needle: "External broker consensus estimates",
    fallback: "External broker consensus estimates were not present in any source file.",
  },
  {
    id: "missing-market",
    sourceId: "S4",
    needle: "Share price / market cap / trading multiples",
    fallback: "Share price, market cap, and trading multiples were not in the source documents.",
  },
  {
    id: "catalyst",
    sourceId: "S5",
    needle: "Q1 2026 TMD vs. guidance",
    fallback: "Q1 2026 TMD vs. guidance ($300-340m) is the first test.",
  },
  {
    id: "static-price",
    sourceId: "S6",
    needle: "No share price, market cap, or trading multiples",
    fallback:
      "Live FMP price is unavailable; using $14.29 as of 2026-05-07.",
  },
];

function readMarkdownFromDisk(): string {
  const jsonPath = path.join(
    process.cwd(),
    "klarna_inputs",
    "klarna_plugin_full_output.json",
  );
  const markdownPath = path.join(
    process.cwd(),
    "klarna_inputs",
    "klarna_plugin_full_output.md",
  );

  try {
    const rawJson = readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(rawJson) as ClaudeJsonOutput;

    if (typeof parsed.result === "string" && parsed.result.trim().length > 0) {
      return parsed.result;
    }
  } catch {
    // Fall through to the markdown file. The UI surfaces missing data rather
    // than failing the route if the raw Claude JSON is malformed.
  }

  return readFileSync(markdownPath, "utf8");
}

function normalizeText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\\\*/g, "*")
    .replace(/\s+/g, " ")
    .trim();
}

function findLine(markdown: string, needle: string, fallback: string): string {
  const lowerNeedle = needle.toLowerCase();
  const line =
    markdown
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find((value) => value.toLowerCase().includes(lowerNeedle)) ?? null;

  return normalizeText(line ?? fallback);
}

function getSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    line.trim().toLowerCase().startsWith(`## ${heading.toLowerCase()}`),
  );

  if (startIndex === -1) {
    return "Section unavailable in the saved plugin output.";
  }

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && /^## \d+\./.test(line.trim()),
  );

  return lines
    .slice(startIndex, endIndex === -1 ? undefined : endIndex)
    .join("\n")
    .trim();
}

function getSubsection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    line.trim().toLowerCase().startsWith(`### ${heading.toLowerCase()}`),
  );

  if (startIndex === -1) {
    return "Subsection unavailable in the saved plugin output.";
  }

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && /^### /.test(line.trim()),
  );

  return lines
    .slice(startIndex, endIndex === -1 ? undefined : endIndex)
    .join("\n")
    .trim();
}

function buildEvidence(
  markdown: string,
  livePrice: KlarnaLivePrice | null,
): readonly EvidenceItem[] {
  return EVIDENCE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    sourceId: definition.sourceId,
    quote:
      definition.id === "static-price" && livePrice !== null
        ? `Live FMP quote returned ${livePrice.displayPrice} for KLAR.`
        : findLine(markdown, definition.needle, definition.fallback),
  }));
}

function buildSources(livePrice: KlarnaLivePrice | null): readonly EvidenceSource[] {
  if (livePrice === null) {
    return SOURCES;
  }

  return SOURCES.map((source) =>
    source.id === "S6"
      ? {
          ...source,
          fullName: "Live FMP quote endpoint for KLAR",
          publisher: "Financial Modeling Prep",
          date: livePrice.asOfDate,
          confidence: 90,
        }
      : source,
  );
}

export function getKlarnaCockpitData(
  livePrice: KlarnaLivePrice | null = null,
): KlarnaCockpitData {
  const markdown = readMarkdownFromDisk();
  const livePriceStatus: LivePriceStatus =
    livePrice === null ? "fallback" : "live";

  return {
    title: "Klarna V2 Investment Cockpit",
    verdict: "Watch - growth is real, profit conversion is not yet trusted",
    asOfDate: "2026-05-07",
    lastCoreSourceDate: "2026-02-19",
    livePrice: livePrice?.displayPrice ?? "$14.29 as of 2026-05-07",
    livePriceStatus,
    scores: [
      {
        label: "Conviction",
        value: "60/100",
        detail: "Watch. Strong evidence of growth, incomplete proof of durable margin conversion.",
      },
      {
        label: "Data Confidence",
        value: "72/100",
        detail: "Good Q4 primary pack, but webcast, XLSX series, 20-F review, and consensus are missing.",
      },
      {
        label: "Source Freshness",
        value: "82/100",
        detail: "Core earnings pack is recent enough for a cockpit, but Q1 is the next proof point.",
      },
    ],
    coreDebate: {
      text:
        "The real debate is whether Klarna's TMD miss is temporary margin timing from fast Fair Financing growth, or evidence that the company is becoming a lower-quality credit-sensitive fintech.",
      evidence: { id: "core-debate" },
      drilldownId: "credit-forensics",
    },
    executiveSummary: {
      id: "executive-summary",
      title: "Executive Summary / Final Call",
      content: getSection(markdown, "1. Executive Summary / Final Call"),
    },
    metrics: [
      {
        label: "Q4 GMV",
        value: "$38.7b",
        detail: "+32% YoY; FY2025 GMV was $127.9b in the public-source pack.",
        evidence: { id: "gmv" },
        drilldownId: "revenue-tmd",
      },
      {
        label: "Q4 Revenue",
        value: "$1.082b",
        detail: "+38% YoY; first billion-dollar quarter.",
        evidence: { id: "revenue" },
        drilldownId: "revenue-tmd",
      },
      {
        label: "Adj Op Profit",
        value: "$47m",
        detail: "Q4 adjusted profit. Keep FY2025 IFRS net loss $(273)m visible.",
        evidence: { id: "adjusted-profit" },
        drilldownId: "income-bridge",
      },
      {
        label: "Consumers",
        value: "118m",
        detail: "Banking consumers: 15.8m; monetization is higher but less mature.",
        evidence: { id: "consumers" },
        drilldownId: "credit-forensics",
      },
      {
        label: "Merchants",
        value: "966k",
        detail: "Large merchant network supports distribution, but not yet a valuation answer.",
        evidence: { id: "merchants" },
        drilldownId: "peer-framing",
      },
    ],
    thesisCells: [
      {
        id: "market-likes",
        title: "Market Likes",
        bullets: [
          {
            text: "Revenue beat guidance; first $1b quarter supports the growth narrative.",
            evidence: { id: "market-like-growth" },
          },
          {
            text: "GMV growth reaccelerated through 2025 rather than fading.",
            evidence: { id: "market-like-gmv" },
          },
          {
            text: "Revenue per employee suggests a credible AI-led operating leverage story.",
            evidence: { id: "market-like-ai" },
          },
          {
            text: "Provision rate improved sequentially even as Fair Financing grew rapidly.",
            evidence: { id: "market-like-provisions" },
          },
        ],
        drilldownId: "revenue-tmd",
      },
      {
        id: "market-dislikes",
        title: "Market Dislikes",
        bullets: [
          {
            text: "TMD missed guidance, damaging credibility on the key unit-economics line.",
            evidence: { id: "market-dislike-tmd" },
          },
          {
            text: "FY2025 operating loss widened despite doubled revenue since 2022.",
            evidence: { id: "market-dislike-loss" },
          },
          {
            text: "Revenue take rate includes a one-time gain-on-sale boost.",
            evidence: { id: "market-dislike-take-rate" },
          },
          {
            text: "Cash flow from operations was negative as the business looked more bank-like.",
            evidence: { id: "market-dislike-cash-flow" },
          },
        ],
        drilldownId: "credit-forensics",
      },
      {
        id: "priced-in",
        title: "What Is Priced In",
        eyebrow: "Inference, not fact",
        bullets: [
          {
            text: "The market already accepts that Klarna can grow; growth alone is not enough.",
            evidence: { id: "revenue" },
          },
          {
            text: "The question is whether TMD, provisions, and funding costs can recover together.",
            evidence: { id: "priced-in-unverified" },
          },
          {
            text: "Without live multiples and consensus, priced-in work remains directional.",
            evidence: { id: "priced-in-unverified" },
          },
        ],
        drilldownId: "peer-framing",
      },
      {
        id: "pressure",
        title: "Why Under Pressure",
        bullets: [
          {
            text: "Q4 transaction margin compressed to 34.4% of revenue from 40.6%.",
            evidence: { id: "pressure-tm" },
          },
          {
            text: "The public market is still comparing results against a fresh IPO narrative.",
            evidence: { id: "static-price" },
          },
          {
            text: "The Q4 report is already 11 weeks old, so Q1 will quickly reset the story.",
            evidence: { id: "pressure-ipo" },
          },
        ],
        drilldownId: "income-bridge",
      },
    ],
    scenarios: [
      {
        title: "Bull",
        stance: "Fair Financing seasons cleanly",
        text:
          "Deferred revenue starts catching up, banking ARPU scales, and adjusted margin expands.",
        evidence: { id: "scenario-bull" },
        drilldownId: "bull",
      },
      {
        title: "Base",
        stance: "Growth good, trust still capped",
        text:
          "Revenue grows 25-30%, but IFRS loss and TMD visibility keep the call at Watch.",
        evidence: { id: "scenario-base" },
        drilldownId: "base",
      },
      {
        title: "Bear",
        stance: "Credit mix keeps weighing",
        text:
          "Fair Financing loss rates deteriorate and the market treats Klarna as a specialty lender.",
        evidence: { id: "scenario-bear" },
        drilldownId: "bear",
      },
      {
        title: "Kill",
        stance: "Model breaks",
        text:
          "Regulatory or funding pressure forces more capital against receivables and weakens demand.",
        evidence: { id: "scenario-kill" },
        drilldownId: "kill",
      },
    ],
    scenarioDisclaimer: "Analyst-style range: not own DCF",
    missingData: [
      {
        label: "Cohort loss curves",
        tone: "red",
        evidence: { id: "missing-webcast" },
      },
      {
        label: "Segment economics",
        tone: "red",
        evidence: { id: "missing-xlsx" },
      },
      {
        label: "Funding-cost bridge",
        tone: "amber",
        evidence: { id: "missing-consensus" },
      },
      {
        label: "Take-rate durability",
        tone: "amber",
        evidence: { id: "missing-market" },
      },
    ],
    catalyst: {
      headline: "Q1 2026 earnings",
      date: "May 14, 2026",
      evidence: { id: "catalyst" },
      watchItems: [
        {
          label: "TMD vs. $300-340m guidance",
          evidence: { id: "catalyst" },
        },
        {
          label: "Fair Financing growth vs. provision rate",
          evidence: { id: "market-like-provisions" },
        },
        {
          label: "IFRS loss vs. adjusted profit optics",
          evidence: { id: "ifrs-loss" },
        },
        {
          label: "Receivable offload quality vs. core margin",
          evidence: { id: "market-dislike-take-rate" },
        },
      ],
    },
    sources: buildSources(livePrice),
    evidence: buildEvidence(markdown, livePrice),
    drilldowns: [
      {
        id: "executive-summary",
        title: "Executive Summary / Final Call",
        content: getSection(markdown, "1. Executive Summary / Final Call"),
      },
      {
        id: "credit-forensics",
        title: "Credit & Unit Economics Evidence",
        content: getSection(markdown, "6. Credit Losses, Fair Financing, and Unit Economics"),
      },
      {
        id: "revenue-tmd",
        title: "Growth Evidence: What Changed + Financial Snapshot",
        content: `${getSection(markdown, "2. What Changed This Quarter")}\n\n${getSection(
          markdown,
          "5. Key Financial Snapshot",
        )}`,
      },
      {
        id: "vintage-chargeoff",
        title: "Vintage charge-off analysis",
        content: getSection(markdown, "6. Credit Losses, Fair Financing, and Unit Economics"),
      },
      {
        id: "peer-framing",
        title: "Valuation Context & Peer Framing",
        content: getSection(markdown, "9. Peer / Competitor Framing"),
      },
      {
        id: "risks",
        title: "Risks",
        content: getSection(markdown, "11. Risks"),
      },
      {
        id: "income-bridge",
        title: "Margin Pressure & Income Bridge",
        content: getSection(markdown, "5. Key Financial Snapshot"),
      },
      {
        id: "bull",
        title: "Bull case",
        content: getSubsection(markdown, "Bull Case"),
      },
      {
        id: "base",
        title: "Base case",
        content: getSubsection(markdown, "Base Case"),
      },
      {
        id: "bear",
        title: "Bear case",
        content: getSubsection(markdown, "Bear Case"),
      },
      {
        id: "kill",
        title: "Kill case",
        content: getSubsection(markdown, "Kill Case"),
      },
    ],
    rawMarkdown: markdown,
  };
}
