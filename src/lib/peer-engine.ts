import type {
  FmpPeerProfile,
  PeerComparisonItem,
  PeerRelevanceScore,
  WaterfallResult,
} from "@/lib/types";

export const PEER_PASS_THRESHOLD = 50;
export const MIN_RELEVANT_PEERS = 3;

type PeerArchetype =
  | "bnpl-fintech"
  | "payments-fintech"
  | "mega-cap-platform"
  | "ai-semiconductor"
  | "enterprise-software"
  | "consumer-staples"
  | "foodservice"
  | "uk-retail"
  | "industrial"
  | "unknown";

type PeerProfile = FmpPeerProfile & {
  readonly description?: string | null;
};

type SubjectProfile = {
  readonly companyName: string;
  readonly archetype: PeerArchetype;
  readonly isB2B: boolean;
  readonly isRegulated: boolean;
  readonly isHighCapex: boolean;
  readonly grossMargin: number | null;
  readonly marketCap: number | null;
};

const BNPL_SYMBOLS = new Set(["KLAR", "AFRM", "SQ", "PYPL", "ADYEN", "ADYEY", "SEZL"]);
const KNOWN_ARCHETYPES: Record<string, PeerArchetype> = {
  AAPL: "mega-cap-platform",
  MSFT: "mega-cap-platform",
  GOOGL: "mega-cap-platform",
  GOOG: "mega-cap-platform",
  AMZN: "mega-cap-platform",
  META: "mega-cap-platform",
  ORCL: "enterprise-software",
  CRM: "enterprise-software",
  ADBE: "enterprise-software",
  NOW: "enterprise-software",
  SNOW: "enterprise-software",
  NVDA: "ai-semiconductor",
  AMD: "ai-semiconductor",
  AVGO: "ai-semiconductor",
  TSM: "ai-semiconductor",
  INTC: "ai-semiconductor",
  QCOM: "ai-semiconductor",
  KLAR: "bnpl-fintech",
  AFRM: "bnpl-fintech",
  SEZL: "bnpl-fintech",
  SQ: "payments-fintech",
  PYPL: "payments-fintech",
  ADYEN: "payments-fintech",
  ADYEY: "payments-fintech",
  GPN: "payments-fintech",
  FIS: "payments-fintech",
  AKAM: "enterprise-software",
  DOCU: "enterprise-software",
  ENTG: "industrial",
  FFIV: "enterprise-software",
  GEN: "enterprise-software",
  DEO: "consumer-staples",
  DGE: "consumer-staples",
  CPG: "foodservice",
  CMPGF: "foodservice",
  GRG: "uk-retail",
  RYCEY: "industrial",
  RR: "industrial",
};

const CURATED_PEERS: Record<string, readonly PeerProfile[]> = {
  KLAR: [
    { symbol: "AFRM", companyName: "Affirm Holdings, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "SQ", companyName: "Block, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "PYPL", companyName: "PayPal Holdings, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "ADYEN", companyName: "Adyen N.V.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "SEZL", companyName: "Sezzle Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
  ],
  AAPL: [
    { symbol: "MSFT", companyName: "Microsoft Corporation", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "GOOGL", companyName: "Alphabet Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "META", companyName: "Meta Platforms, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "AMZN", companyName: "Amazon.com, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
  ],
  MSFT: [
    { symbol: "AAPL", companyName: "Apple Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "GOOGL", companyName: "Alphabet Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "ORCL", companyName: "Oracle Corporation", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "CRM", companyName: "Salesforce, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
  ],
  NVDA: [
    { symbol: "AMD", companyName: "Advanced Micro Devices, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "AVGO", companyName: "Broadcom Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "TSM", companyName: "Taiwan Semiconductor Manufacturing Company Limited", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "QCOM", companyName: "QUALCOMM Incorporated", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
  ],
  SNOW: [
    { symbol: "CRM", companyName: "Salesforce, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "DDOG", companyName: "Datadog, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
    { symbol: "MDB", companyName: "MongoDB, Inc.", currentPrice: null, marketCap: null, peRatio: null, revenueGrowth: null, evToEbitda: null },
  ],
};

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.[A-Z]+$/, "");
}

function textFor(companyName: string, description?: string | null): string {
  return `${companyName} ${description ?? ""}`.toLowerCase();
}

function inferArchetype(symbol: string, companyName: string, description?: string | null): PeerArchetype {
  const normalizedSymbol = normalizeSymbol(symbol);
  const text = textFor(companyName, description);

  if (KNOWN_ARCHETYPES[normalizedSymbol] !== undefined) {
    return KNOWN_ARCHETYPES[normalizedSymbol];
  }

  if (/\bbuy now\b|\bbnpl\b|\binstallment\b|\bconsumer credit\b/.test(text)) {
    return "bnpl-fintech";
  }

  if (/\bpayments?\b|\bmerchant\b|\bacquiring\b|\bcheckout\b|\bwallet\b/.test(text)) {
    return "payments-fintech";
  }

  if (/\bsemiconductor\b|\bgpu\b|\bchip\b|\baccelerator\b|\bfoundry\b/.test(text)) {
    return "ai-semiconductor";
  }

  if (/\bsoftware\b|\bcloud\b|\bsaas\b|\bdata platform\b|\bcybersecurity\b/.test(text)) {
    return "enterprise-software";
  }

  if (/\bconsumer electronics\b|\bplatform\b|\badvertising\b|\becommerce\b/.test(text)) {
    return "mega-cap-platform";
  }

  if (/\bspirits\b|\bbeverage\b|\bconsumer goods\b/.test(text)) {
    return "consumer-staples";
  }

  if (/\bcatering\b|\bfoodservice\b|\bcontract food\b/.test(text)) {
    return "foodservice";
  }

  if (/\bbakery\b|\bretail\b|\bstores\b/.test(text)) {
    return "uk-retail";
  }

  if (/\bengine\b|\bdefen[cs]e\b|\bindustrial\b|\bmanufacturing\b|\baerospace\b/.test(text)) {
    return "industrial";
  }

  return "unknown";
}

function symbolFromResult(result: WaterfallResult): string {
  return (
    result.finnhub?.data.symbol ??
    result.fmp?.data.symbol ??
    result.secEdgar?.data.companyInfo?.tickers[0] ??
    ""
  );
}

export function buildPeerSubject(result: WaterfallResult): SubjectProfile {
  const symbol = normalizeSymbol(symbolFromResult(result));
  const companyName =
    result.secEdgar?.data.companyInfo?.name ??
    result.finnhub?.data.companyName ??
    result.fmp?.data.companyName ??
    result.query;
  const archetype = inferArchetype(symbol, companyName, result.exaDeep?.data.overview ?? null);
  const grossMargin = null;
  const marketCap =
    result.finnhub?.data.basicFinancials?.metric.marketCapitalization !== undefined &&
    result.finnhub?.data.basicFinancials?.metric.marketCapitalization !== null
      ? result.finnhub.data.basicFinancials.metric.marketCapitalization * 1_000_000
      : result.fmp?.data.enterpriseValues[0]?.marketCapitalization ?? null;

  return {
    companyName,
    archetype,
    grossMargin,
    isB2B: !["bnpl-fintech", "uk-retail", "consumer-staples"].includes(archetype),
    isRegulated: ["bnpl-fintech", "payments-fintech", "consumer-staples", "industrial"].includes(archetype),
    isHighCapex: ["industrial", "ai-semiconductor"].includes(archetype),
    marketCap,
  };
}

function customerType(archetype: PeerArchetype): "consumer" | "business" | "mixed" {
  if (["bnpl-fintech", "uk-retail", "consumer-staples"].includes(archetype)) {
    return "consumer";
  }

  if (["payments-fintech", "mega-cap-platform"].includes(archetype)) {
    return "mixed";
  }

  return "business";
}

function monetization(archetype: PeerArchetype): "transaction" | "subscription" | "hardware" | "retail" | "services" | "mixed" {
  if (["bnpl-fintech", "payments-fintech"].includes(archetype)) {
    return "transaction";
  }

  if (archetype === "enterprise-software") {
    return "subscription";
  }

  if (archetype === "ai-semiconductor") {
    return "hardware";
  }

  if (["uk-retail", "consumer-staples"].includes(archetype)) {
    return "retail";
  }

  if (archetype === "foodservice") {
    return "services";
  }

  return "mixed";
}

function hasRegulatorySimilarity(subject: SubjectProfile, candidateArchetype: PeerArchetype): boolean {
  if (!subject.isRegulated) {
    return !["bnpl-fintech", "payments-fintech", "industrial", "consumer-staples"].includes(candidateArchetype);
  }

  if (subject.archetype === "bnpl-fintech") {
    return ["bnpl-fintech", "payments-fintech"].includes(candidateArchetype);
  }

  return subject.archetype === candidateArchetype;
}

function isCompatibleArchetype(subject: PeerArchetype, candidate: PeerArchetype): boolean {
  if (subject === candidate) {
    return true;
  }

  if (subject === "bnpl-fintech") {
    return candidate === "payments-fintech";
  }

  if (subject === "mega-cap-platform") {
    return ["enterprise-software", "mega-cap-platform"].includes(candidate);
  }

  if (subject === "enterprise-software") {
    return ["enterprise-software", "mega-cap-platform"].includes(candidate);
  }

  return false;
}

function disqualifyingReasons(subject: SubjectProfile, candidate: PeerProfile, candidateArchetype: PeerArchetype): readonly string[] {
  const reasons: string[] = [];
  const symbol = normalizeSymbol(candidate.symbol);

  if (subject.archetype === "bnpl-fintech" && !BNPL_SYMBOLS.has(symbol)) {
    reasons.push("Not a BNPL/payments fintech peer.");
  }

  if (subject.archetype === "bnpl-fintech" && ["enterprise-software", "industrial"].includes(candidateArchetype)) {
    reasons.push("Business model does not match consumer-fintech/BNPL underwriting.");
  }

  if (!isCompatibleArchetype(subject.archetype, candidateArchetype)) {
    reasons.push("Business model archetype is not comparable.");
  }

  if (subject.isHighCapex !== ["industrial", "ai-semiconductor"].includes(candidateArchetype)) {
    reasons.push("Capital intensity profile differs materially.");
  }

  if (
    subject.marketCap !== null &&
    candidate.marketCap !== null &&
    (candidate.marketCap > subject.marketCap * 20 || candidate.marketCap < subject.marketCap * 0.05)
  ) {
    reasons.push("Market-cap scale is outside the relevance band.");
  }

  return reasons;
}

export function scorePeerRelevance(
  subject: SubjectProfile,
  candidate: PeerProfile,
): PeerRelevanceScore {
  const candidateArchetype = inferArchetype(candidate.symbol, candidate.companyName, candidate.description);
  const reasons = disqualifyingReasons(subject, candidate, candidateArchetype);
  const businessModelMatch = isCompatibleArchetype(subject.archetype, candidateArchetype) ? 30 : 0;
  const monetizationModelMatch =
    monetization(subject.archetype) === monetization(candidateArchetype)
      ? 25
      : subject.archetype === "bnpl-fintech" && candidateArchetype === "payments-fintech"
        ? 18
        : 0;
  const marginProfileCompatible =
    subject.grossMargin === null ? 10 : subject.grossMargin > 60 && candidateArchetype === "industrial" ? 0 : 20;
  const capitalIntensityMatch =
    subject.isHighCapex === ["industrial", "ai-semiconductor"].includes(candidateArchetype) ? 15 : 0;
  const customerTypeMatch =
    customerType(subject.archetype) === customerType(candidateArchetype) ||
    customerType(candidateArchetype) === "mixed"
      ? 10
      : 0;
  const regulatorySimilarity = hasRegulatorySimilarity(subject, candidateArchetype) ? 10 : 0;
  const totalScore =
    businessModelMatch +
    monetizationModelMatch +
    marginProfileCompatible +
    capitalIntensityMatch +
    customerTypeMatch +
    regulatorySimilarity;
  const passes = totalScore >= PEER_PASS_THRESHOLD && reasons.length === 0;

  return {
    symbol: candidate.symbol,
    companyName: candidate.companyName,
    totalScore,
    passes,
    breakdown: {
      businessModelMatch,
      monetizationModelMatch,
      marginProfileCompatible,
      capitalIntensityMatch,
      customerTypeMatch,
      regulatorySimilarity,
    },
    disqualifyingReasons: reasons,
  };
}

function mergeCuratedPeers(subjectSymbol: string, peers: readonly PeerProfile[]): readonly PeerProfile[] {
  const curated = CURATED_PEERS[subjectSymbol] ?? [];
  const bySymbol = new Map<string, PeerProfile>();

  for (const peer of [...peers, ...curated]) {
    const symbol = normalizeSymbol(peer.symbol);

    if (symbol !== subjectSymbol && !bySymbol.has(symbol)) {
      bySymbol.set(symbol, peer);
    }
  }

  return [...bySymbol.values()];
}

export function scorePeerSet(result: WaterfallResult): readonly PeerRelevanceScore[] {
  const subject = buildPeerSubject(result);
  const subjectSymbol = normalizeSymbol(symbolFromResult(result));
  const peers = mergeCuratedPeers(subjectSymbol, result.fmp?.data.peers ?? []);

  return peers.map((peer) => scorePeerRelevance(subject, peer));
}

export function buildRelevantPeerItems(result: WaterfallResult): readonly PeerComparisonItem[] {
  const subject = buildPeerSubject(result);
  const subjectSymbol = normalizeSymbol(symbolFromResult(result));
  const peers = mergeCuratedPeers(subjectSymbol, result.fmp?.data.peers ?? []);
  const scoresBySymbol = new Map(
    peers.map((peer) => [normalizeSymbol(peer.symbol), scorePeerRelevance(subject, peer)]),
  );

  return peers
    .filter((peer) => scoresBySymbol.get(normalizeSymbol(peer.symbol))?.passes === true)
    .map((peer) => ({
      symbol: peer.symbol,
      companyName: peer.companyName,
      currentPrice: peer.currentPrice,
      marketCap: peer.marketCap,
      peRatio: peer.peRatio,
      evToEbitda: peer.evToEbitda,
      revenueGrowth: peer.revenueGrowth,
      source: "fmp" as const,
      evidenceClass: "market-data-vendor" as const,
    }));
}
