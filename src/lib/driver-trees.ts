import type {
  CompanyArchetype,
  DriverMetric,
  DriverMetricStatus,
  DriverTree,
  EvidenceAnchor,
  EvidenceClass,
  FinancialMetric,
  WaterfallResult,
} from "@/lib/types";

type DriverDefinition = {
  readonly name: string;
  readonly importance: DriverMetric["importance"];
  readonly metricLabels: readonly string[];
};

type ArchetypeDefinition = {
  readonly archetype: CompanyArchetype;
  readonly drivers: readonly DriverDefinition[];
};

// ---------------------------------------------------------------------------
// Per-archetype driver definitions
// ---------------------------------------------------------------------------

const CONSUMER_FINTECH_BNPL: ArchetypeDefinition = {
  archetype: "consumer-fintech-bnpl",
  drivers: [
    { name: "GMV", importance: "critical", metricLabels: ["GMV", "Gross Merchandise Volume"] },
    { name: "Take Rate", importance: "critical", metricLabels: ["Take Rate"] },
    { name: "Loss Rate", importance: "critical", metricLabels: ["Loss Rate", "Net Credit Loss Rate", "Credit Loss Rate"] },
    { name: "Active Users", importance: "important", metricLabels: ["Active Users", "Monthly Active Users"] },
    { name: "Funding Cost", importance: "important", metricLabels: ["Funding Cost", "Cost of Funding"] },
    { name: "Contribution Margin", importance: "important", metricLabels: ["Contribution Margin"] },
    { name: "Opex Ratio", importance: "supplementary", metricLabels: ["Opex Ratio", "Operating Expense Ratio"] },
  ],
};

const SOFTWARE_SAAS: ArchetypeDefinition = {
  archetype: "software-saas",
  drivers: [
    { name: "ARR", importance: "critical", metricLabels: ["ARR", "Annual Recurring Revenue"] },
    { name: "Gross Margin", importance: "critical", metricLabels: ["Gross Margin"] },
    { name: "Net Dollar Retention", importance: "important", metricLabels: ["NDR", "Net Dollar Retention", "Net Revenue Retention"] },
    { name: "CAC Payback", importance: "important", metricLabels: ["CAC Payback", "CAC Payback Period"] },
    { name: "Burn / Runway", importance: "supplementary", metricLabels: ["Burn Rate", "Runway", "Cash Runway"] },
  ],
};

const AI_INFRASTRUCTURE: ArchetypeDefinition = {
  archetype: "ai-infrastructure",
  drivers: [
    { name: "Revenue / ARR", importance: "critical", metricLabels: ["Revenue", "ARR", "Annual Recurring Revenue", "Estimated Revenue"] },
    { name: "Gross Margin", importance: "critical", metricLabels: ["Gross Margin"] },
    { name: "Inference Cost Trajectory", importance: "important", metricLabels: ["Inference Cost", "Cost per Token", "Cost of Revenue"] },
    { name: "Net Dollar Retention", importance: "important", metricLabels: ["NDR", "Net Dollar Retention", "Net Revenue Retention"] },
    { name: "Customer Concentration", importance: "important", metricLabels: ["Customer Concentration", "Top Customer Revenue Share"] },
    { name: "Revenue Growth", importance: "supplementary", metricLabels: ["Revenue Growth"] },
  ],
};

const MEGA_CAP_PLATFORM: ArchetypeDefinition = {
  archetype: "mega-cap-platform",
  drivers: [
    { name: "Segment Revenue Mix", importance: "critical", metricLabels: ["Segment Revenue", "Services Revenue", "Product Revenue"] },
    { name: "CapEx Intensity", importance: "critical", metricLabels: ["CapEx / Revenue", "Capital Expenditure"] },
    { name: "Services Margin", importance: "important", metricLabels: ["Services Margin", "Gross Margin"] },
    { name: "Buyback Yield", importance: "important", metricLabels: ["Buyback Yield", "Share Repurchase"] },
    { name: "FCF Margin", importance: "supplementary", metricLabels: ["Free Cash Flow Margin", "FCF Margin"] },
    { name: "Revenue Growth", importance: "supplementary", metricLabels: ["Revenue Growth"] },
  ],
};

const UK_RETAIL_LFL: ArchetypeDefinition = {
  archetype: "uk-retail-lfl",
  drivers: [
    { name: "LFL Sales Growth", importance: "critical", metricLabels: ["LFL Sales Growth", "Like-for-Like Sales", "Comparable Sales Growth", "Revenue Growth"] },
    { name: "EBITDA Margin", importance: "critical", metricLabels: ["EBITDA Margin", "Operating Margin"] },
    { name: "Store Count", importance: "important", metricLabels: ["Store Count", "Number of Stores", "Outlets"] },
    { name: "Lease Liability", importance: "supplementary", metricLabels: ["Lease Liability", "Operating Lease Liability"] },
  ],
};

const INDUSTRIAL_B2B: ArchetypeDefinition = {
  archetype: "industrial-b2b",
  drivers: [
    { name: "EBITDA Margin", importance: "critical", metricLabels: ["EBITDA Margin", "Operating Margin"] },
    { name: "ROCE", importance: "critical", metricLabels: ["ROCE", "Return on Capital Employed", "ROE", "ROA"] },
    { name: "Order Book", importance: "important", metricLabels: ["Order Book", "Backlog", "Order Backlog"] },
    { name: "CapEx / Revenue", importance: "important", metricLabels: ["CapEx / Revenue", "Capital Expenditure"] },
    { name: "Revenue Growth", importance: "supplementary", metricLabels: ["Revenue Growth"] },
  ],
};

const PRIVATE_EARLY_STAGE: ArchetypeDefinition = {
  archetype: "private-early-stage",
  drivers: [
    { name: "Revenue", importance: "critical", metricLabels: ["Revenue", "Estimated Revenue"] },
    { name: "Gross Margin", importance: "important", metricLabels: ["Gross Margin"] },
    { name: "Runway", importance: "important", metricLabels: ["Runway", "Cash Runway", "Total Funding"] },
    { name: "Investor Quality", importance: "supplementary", metricLabels: ["Key Investors"] },
  ],
};

const PRIVATE_GROWTH: ArchetypeDefinition = {
  archetype: "private-growth",
  drivers: [
    { name: "Revenue", importance: "critical", metricLabels: ["Revenue", "Estimated Revenue"] },
    { name: "Gross Margin", importance: "critical", metricLabels: ["Gross Margin"] },
    { name: "Retention / NDR", importance: "important", metricLabels: ["NDR", "Net Dollar Retention", "Retention Rate"] },
    { name: "Burn Multiple", importance: "supplementary", metricLabels: ["Burn Multiple", "Burn Rate"] },
  ],
};

const TURNAROUND: ArchetypeDefinition = {
  archetype: "turnaround",
  drivers: [
    { name: "Margin Trajectory", importance: "critical", metricLabels: ["Operating Margin", "EBITDA Margin", "Net Margin"] },
    { name: "Debt / EBITDA", importance: "critical", metricLabels: ["Debt / EBITDA", "Net Debt / EBITDA", "Leverage Ratio"] },
    { name: "FCF Target", importance: "important", metricLabels: ["Free Cash Flow", "Free Cash Flow Margin", "FCF"] },
    { name: "Cost Program", importance: "supplementary", metricLabels: ["Cost Savings", "Restructuring"] },
  ],
};

const OTHER_GENERIC: ArchetypeDefinition = {
  archetype: "other",
  drivers: [
    { name: "Revenue", importance: "supplementary", metricLabels: ["Revenue", "Estimated Revenue"] },
    { name: "Gross Margin", importance: "supplementary", metricLabels: ["Gross Margin"] },
    { name: "EBITDA Margin", importance: "supplementary", metricLabels: ["EBITDA Margin", "Operating Margin"] },
  ],
};

const ARCHETYPE_DEFINITIONS: Record<CompanyArchetype, ArchetypeDefinition> = {
  "consumer-fintech-bnpl": CONSUMER_FINTECH_BNPL,
  "software-saas": SOFTWARE_SAAS,
  "ai-infrastructure": AI_INFRASTRUCTURE,
  "mega-cap-platform": MEGA_CAP_PLATFORM,
  "uk-retail-lfl": UK_RETAIL_LFL,
  "industrial-b2b": INDUSTRIAL_B2B,
  "private-early-stage": PRIVATE_EARLY_STAGE,
  "private-growth": PRIVATE_GROWTH,
  "turnaround": TURNAROUND,
  "other": OTHER_GENERIC,
};

// ---------------------------------------------------------------------------
// Known-company override map (seeded from demo-names + eval companies)
// ---------------------------------------------------------------------------

const KNOWN_COMPANY_OVERRIDES: Record<string, CompanyArchetype> = {
  klarna: "consumer-fintech-bnpl",
  affirm: "consumer-fintech-bnpl",
  afterpay: "consumer-fintech-bnpl",
  nvidia: "ai-infrastructure",
  anthropic: "ai-infrastructure",
  openai: "ai-infrastructure",
  apple: "mega-cap-platform",
  microsoft: "mega-cap-platform",
  alphabet: "mega-cap-platform",
  google: "mega-cap-platform",
  amazon: "mega-cap-platform",
  meta: "mega-cap-platform",
  greggs: "uk-retail-lfl",
  tesco: "uk-retail-lfl",
  "marks and spencer": "uk-retail-lfl",
  "marks & spencer": "uk-retail-lfl",
  sainsbury: "uk-retail-lfl",
  diageo: "uk-retail-lfl",
  tesla: "ai-infrastructure",
  stripe: "consumer-fintech-bnpl",
  spacex: "private-growth",
  "deutsche bank": "industrial-b2b",
};

// ---------------------------------------------------------------------------
// SEC SIC code → archetype mapping
// ---------------------------------------------------------------------------

function archetypeFromSicCode(sic: string): CompanyArchetype | null {
  const code = parseInt(sic, 10);
  if (Number.isNaN(code)) return null;

  // Retail trade
  if (code >= 5200 && code <= 5999) return "uk-retail-lfl";
  // Food stores
  if (code >= 5400 && code <= 5499) return "uk-retail-lfl";
  // Eating places
  if (code === 5812) return "uk-retail-lfl";

  // Computer programming / prepackaged software
  if (code === 7372 || code === 7371 || code === 7374) return "software-saas";

  // Semiconductors
  if (code === 3674) return "ai-infrastructure";
  // Electronic computers
  if (code === 3571) return "mega-cap-platform";
  // Communication equipment
  if (code === 3669 || code === 3663) return "ai-infrastructure";

  // Security brokers / finance services
  if (code >= 6100 && code <= 6199) return "consumer-fintech-bnpl";
  // Short-term credit institutions
  if (code === 6153 || code === 6159) return "consumer-fintech-bnpl";
  // National commercial banks / state banks
  if (code >= 6020 && code <= 6029) return "industrial-b2b";

  // Industrial machinery
  if (code >= 3500 && code <= 3599) return "industrial-b2b";
  // Heavy construction
  if (code >= 1500 && code <= 1799) return "industrial-b2b";
  // Primary metals
  if (code >= 3300 && code <= 3399) return "industrial-b2b";

  return null;
}

// ---------------------------------------------------------------------------
// BusinessModelTag → archetype mapping
// ---------------------------------------------------------------------------

function archetypeFromBusinessModelTag(tag: string | null | undefined): CompanyArchetype | null {
  if (tag === null || tag === undefined) return null;

  const map: Record<string, CompanyArchetype> = {
    "bnpl-fintech": "consumer-fintech-bnpl",
    "payments-fintech": "consumer-fintech-bnpl",
    "saas-subscription": "software-saas",
    "saas-consumption": "software-saas",
    "ai-infrastructure": "ai-infrastructure",
    "mega-cap-benchmark": "mega-cap-platform",
    "uk-retail-lfl": "uk-retail-lfl",
    "uk-staples": "uk-retail-lfl",
    "industrial-b2b": "industrial-b2b",
    "outsourcing-services": "industrial-b2b",
    "private-early": "private-early-stage",
    "private-growth": "private-growth",
    turnaround: "turnaround",
    marketplace: "software-saas",
  };

  return map[tag] ?? null;
}

// ---------------------------------------------------------------------------
// Keyword matching on exaDeep.overview
// ---------------------------------------------------------------------------

function archetypeFromKeywords(overview: string | null): CompanyArchetype | null {
  if (overview === null || overview.length === 0) return null;

  const text = overview.toLowerCase();

  if (
    (text.includes("buy now pay later") || text.includes("bnpl")) &&
    (text.includes("fintech") || text.includes("payments") || text.includes("consumer credit"))
  ) {
    return "consumer-fintech-bnpl";
  }

  if (
    (text.includes("saas") || text.includes("software-as-a-service")) &&
    (text.includes("recurring") || text.includes("subscription") || text.includes("arr"))
  ) {
    return "software-saas";
  }

  if (
    (text.includes("gpu") || text.includes("inference") || text.includes("ai infrastructure")) &&
    (text.includes("data center") || text.includes("training") || text.includes("machine learning"))
  ) {
    return "ai-infrastructure";
  }

  if (text.includes("retail") && (text.includes("store") || text.includes("shop") || text.includes("outlet"))) {
    return "uk-retail-lfl";
  }

  if (text.includes("turnaround") || text.includes("restructuring")) {
    return "turnaround";
  }

  return null;
}

// ---------------------------------------------------------------------------
// classifyArchetype — scoring cascade: override → SIC → tag → keywords
// ---------------------------------------------------------------------------

export function classifyArchetype(
  waterfallResult: WaterfallResult,
  metrics: readonly FinancialMetric[],
  businessModelTag?: string | null,
): CompanyArchetype {
  // 1. Known-company override
  const displayName = (
    waterfallResult.finnhub?.data.companyName ??
    waterfallResult.companiesHouse?.data.company?.company_name ??
    waterfallResult.exaDeep?.data.companyName ??
    waterfallResult.query ??
    ""
  ).toLowerCase().trim();

  for (const [key, archetype] of Object.entries(KNOWN_COMPANY_OVERRIDES)) {
    if (displayName.includes(key)) {
      return archetype;
    }
  }

  // 2. SEC SIC code
  const secSic = waterfallResult.secEdgar?.data.companyInfo?.sic ?? null;
  if (secSic !== null) {
    const fromSic = archetypeFromSicCode(secSic);
    if (fromSic !== null) return fromSic;
  }

  // 3. Companies House SIC codes
  const chSicCodes = waterfallResult.companiesHouse?.data.profile?.sic_codes ?? [];
  for (const code of chSicCodes) {
    const fromChSic = archetypeFromSicCode(code);
    if (fromChSic !== null) return fromChSic;
  }

  // 4. BusinessModelTag
  const fromTag = archetypeFromBusinessModelTag(businessModelTag);
  if (fromTag !== null) return fromTag;

  // 5. Keyword fallback on Exa overview
  const exaOverview = waterfallResult.exaDeep?.data.overview ?? null;
  const fromKeywords = archetypeFromKeywords(exaOverview);
  if (fromKeywords !== null) return fromKeywords;

  // 6. Private company heuristic
  const isPrivate =
    waterfallResult.finnhub === null &&
    waterfallResult.fmp === null &&
    waterfallResult.secEdgar === null &&
    (waterfallResult.exaDeep !== null || waterfallResult.claudeFallback !== null);

  if (isPrivate) {
    const estimatedRevenue = metrics.find((m) => m.label === "Estimated Revenue");
    const hasFunding = waterfallResult.exaDeep?.data.fundingTotal !== null;
    if (estimatedRevenue !== null && estimatedRevenue !== undefined && hasFunding) {
      return "private-growth";
    }
    return "private-early-stage";
  }

  return "other";
}

// ---------------------------------------------------------------------------
// buildDriverTree — populate driver statuses from metrics + anchors
// ---------------------------------------------------------------------------

function resolveDriverStatus(
  definition: DriverDefinition,
  metrics: readonly FinancialMetric[],
  anchors: readonly EvidenceAnchor[],
): DriverMetric {
  // Try to find the metric by scanning label matches
  for (const label of definition.metricLabels) {
    const metric = metrics.find(
      (m) => m.label.toLowerCase() === label.toLowerCase(),
    );

    if (metric === undefined || metric.value === null) {
      continue;
    }

    // Find matching anchor for evidence ID
    const anchor = anchors.find(
      (a) => a.label.toLowerCase() === label.toLowerCase(),
    );

    const evidenceClass: EvidenceClass | undefined =
      metric.evidenceClass ?? anchor?.evidenceClass;

    let status: DriverMetricStatus;
    if (
      evidenceClass === "primary-filing" ||
      evidenceClass === "market-data-vendor"
    ) {
      status = "verified";
    } else if (evidenceClass === "synthesized-web" || evidenceClass === "news-reporting") {
      status = "estimated";
    } else if (evidenceClass === "model-inference") {
      status = "inferred";
    } else {
      // Has a value but unknown provenance — treat as estimated
      status = "estimated";
    }

    return {
      name: definition.name,
      status,
      value: metric.value,
      evidenceId: anchor?.id ?? null,
      importance: definition.importance,
      note: null,
    };
  }

  // Also check anchors directly (some data lives in anchors but not metrics)
  for (const label of definition.metricLabels) {
    const anchor = anchors.find(
      (a) => a.label.toLowerCase().includes(label.toLowerCase()),
    );

    if (anchor !== undefined) {
      const evidenceClass = anchor.evidenceClass;
      let status: DriverMetricStatus;
      if (
        evidenceClass === "primary-filing" ||
        evidenceClass === "market-data-vendor"
      ) {
        status = "verified";
      } else if (evidenceClass === "synthesized-web") {
        status = "estimated";
      } else {
        status = "inferred";
      }

      return {
        name: definition.name,
        status,
        value: anchor.value,
        evidenceId: anchor.id,
        importance: definition.importance,
        note: null,
      };
    }
  }

  return {
    name: definition.name,
    status: "missing",
    value: null,
    evidenceId: null,
    importance: definition.importance,
    note: definition.importance === "critical"
      ? "Missing — required before conviction"
      : null,
  };
}

export function buildDriverTree(
  archetype: CompanyArchetype,
  metrics: readonly FinancialMetric[],
  anchors: readonly EvidenceAnchor[],
): DriverTree {
  const definition = ARCHETYPE_DEFINITIONS[archetype];
  const drivers = definition.drivers.map((driverDef) =>
    resolveDriverStatus(driverDef, metrics, anchors),
  );
  const criticalMissing = drivers
    .filter((d) => d.importance === "critical" && d.status === "missing")
    .map((d) => d.name);

  return {
    archetype,
    drivers,
    criticalMissing,
    blocksConviction: criticalMissing.length > 0,
  };
}

/** Human-readable archetype label for UI display. */
export function archetypeLabel(archetype: CompanyArchetype): string {
  const labels: Record<CompanyArchetype, string> = {
    "consumer-fintech-bnpl": "Consumer Fintech / BNPL",
    "software-saas": "Software / SaaS",
    "ai-infrastructure": "AI Infrastructure",
    "mega-cap-platform": "Mega-Cap Platform",
    "uk-retail-lfl": "UK Retail / Consumer Staples",
    "industrial-b2b": "Industrial B2B",
    "private-early-stage": "Private Early Stage",
    "private-growth": "Private Growth",
    turnaround: "Turnaround",
    other: "General",
  };
  return labels[archetype];
}
