import type {
  NewsHighlight,
  RecentDevelopment,
  RecentDevelopmentCategory,
  RecentDevelopmentImpact,
} from "@/lib/types";

const MAX_RECENT_DEVELOPMENTS = 3;
const HEADLINE_SIMILARITY_THRESHOLD = 0.55;
const MIN_RECENT_DEVELOPMENT_SCORE = 20;
const IGNORED_COMPANY_TOKENS = new Set([
  "inc",
  "corp",
  "corporation",
  "co",
  "company",
  "group",
  "holdings",
  "limited",
  "ltd",
  "plc",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "before",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "up",
  "with",
  "will",
]);

type ScoredDevelopment = RecentDevelopment & {
  readonly _eventKey: string | null;
  readonly _tokens: readonly string[];
};

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function tokenizeHeadline(value: string): readonly string[] {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function tokenizeCompany(value: string): readonly string[] {
  return tokenizeHeadline(value).filter((token) => !IGNORED_COMPANY_TOKENS.has(token));
}

function headlineSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : intersection / union;
}

function recencyScore(publishedAt: string): number {
  const parsed = new Date(publishedAt);

  if (Number.isNaN(parsed.getTime())) {
    return 8;
  }

  const ageDays = Math.max(0, (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(2, 18 - ageDays * 1.4);
}

function inferCategory(text: string): RecentDevelopmentCategory {
  if (/\bearnings\b|\bguidance\b|\bforecast\b|\bestimate\b|\beps\b|\brevenue\b|\bbeat\b|\bmiss\b/i.test(text)) {
    return "earnings";
  }

  if (/\bceo\b|\bcfo\b|\bchair(?:man|woman)?\b|\bsteps down\b|\bresigns?\b|\bsuccessor\b|\bsuccession\b|\bexecutive chairman\b/i.test(text)) {
    return "leadership";
  }

  if (/\bupgrade(?:d|s)?\b|\bdowngrade(?:d|s)?\b|\bprice target\b|\btarget price\b|\breiterate[sd]?\b|\bmaintains? buy\b|\banalyst\b|\bbank of america\b|\bgoldman\b|\bmorgan stanley\b/i.test(text)) {
    return "analyst";
  }

  if (/\bregulat(?:ion|ory)\b|\blawsuit\b|\bprobe\b|\binvestigation\b|\bantitrust\b|\btariff\b|\bdoj\b|\bsec\b|\bftc\b/i.test(text)) {
    return "regulatory";
  }

  if (/\bacquisition\b|\bmerger\b|\bspin[- ]?off\b|\bfunding\b|\bfinancing\b|\bdebt\b|\bbuyback\b|\bstake\b|\basset sale\b/i.test(text)) {
    return "transaction";
  }

  if (/\blaunch\b|\bproduct\b|\bplatform\b|\bmodel\b|\bchip\b|\bservice\b|\bpartnership\b|\bdeal\b|\broadmap\b|\bai\b|\bcustomer\b|\bmerchant\b|\bcheckout\b|\bsubscriptions?\b|\bvolume\b|\busers?\b/i.test(text)) {
    return "product";
  }

  return "market-context";
}

function inferImpact(
  item: NewsHighlight,
  category: RecentDevelopmentCategory,
  text: string,
): RecentDevelopmentImpact {
  if (category === "leadership") {
    if (/\bfraud\b|\bforced out\b|\bprobe\b|\binvestigation\b/i.test(text)) {
      return "negative";
    }

    return "mixed";
  }

  if (item.sentimentLabel === "positive") {
    return "positive";
  }

  if (item.sentimentLabel === "negative") {
    return "negative";
  }

  if (category === "market-context") {
    return "neutral";
  }

  return "mixed";
}

function categoryWeight(category: RecentDevelopmentCategory): number {
  switch (category) {
    case "earnings":
      return 30;
    case "leadership":
      return 28;
    case "regulatory":
      return 26;
    case "analyst":
      return 20;
    case "transaction":
      return 18;
    case "product":
      return 16;
    case "market-context":
      return 8;
    default:
      return 8;
  }
}

function keywordBoost(text: string): number {
  let boost = 0;

  if (/\bsteps down\b|\bsuccessor\b|\bsuccession\b/i.test(text)) {
    boost += 12;
  }

  if (/\bbeat\b|\bmiss\b|\bguidance\b|\bforecast\b/i.test(text)) {
    boost += 10;
  }

  if (/\bupgrade(?:d|s)?\b|\bdowngrade(?:d|s)?\b|\bprice target\b/i.test(text)) {
    boost += 8;
  }

  if (/\bfunding\b|\btender\b|\bvaluation\b|\bacquisition\b|\bmainnet\b|\blaunch\b|\bpartnership\b|\bfiling\b|\baccounts\b|\bsec filing\b/i.test(text)) {
    boost += 6;
  }

  if (/\bstock market today\b|\bchart of the day\b|\bmarket rebound\b/i.test(text)) {
    boost -= 10;
  }

  return boost;
}

function genericMacroPenalty(text: string): number {
  if (/\bshares of\b.*\bcompanies\b|\btreasury yields\b|\boil prices\b|\binflation\b|\bceasefire\b|\bmacro\b|\bsector\b|\bsurvey\b|\bstock market\b/i.test(text)) {
    return 18;
  }

  if (/\btrading higher\b|\btrading lower\b|\bmarket context\b|\bsentiment\b/i.test(text)) {
    return 10;
  }

  return 0;
}

function isLowSignalMarketContext(
  category: RecentDevelopmentCategory,
  text: string,
): boolean {
  if (category !== "market-context") {
    return false;
  }

  return genericMacroPenalty(text) >= 10;
}

function buildWhyItMatters(
  category: RecentDevelopmentCategory,
  impact: RecentDevelopmentImpact,
  text: string,
): string {
  if (category === "earnings") {
    if (impact === "positive") {
      return "This can lift near-term estimates and support the current valuation debate if the follow-through is credible.";
    }

    if (impact === "negative") {
      return "This can pressure near-term estimates and tighten downside framing around execution risk.";
    }

    return "This resets the next estimate cycle and matters because even a small guidance shift can move the stock quickly.";
  }

  if (category === "leadership") {
    return /\bceo\b|\bsteps down\b|\bsuccessor\b/i.test(text)
      ? "Leadership transition changes execution confidence, strategic continuity, and the multiple investors are willing to pay."
      : "Management change matters because it can alter execution confidence and investor trust in the next phase of the story.";
  }

  if (category === "analyst") {
    return "Street revisions matter because they shape near-term expectation-setting even before fundamentals fully change.";
  }

  if (category === "regulatory") {
    return "Regulatory developments matter because they can change downside risk, timing, and the discount rate investors apply.";
  }

  if (category === "transaction") {
    return "Capital allocation and transaction news matter because they can change strategic options and value-realization paths.";
  }

  if (category === "product") {
    return "Product and roadmap news matter because they test whether the current growth narrative has a real operating catalyst behind it.";
  }

  if (impact === "negative") {
    return "This affects sentiment, but it is less thesis-defining than a company-specific operating or capital event.";
  }

  return "This is useful context for sentiment, though it is less important than a direct company-specific catalyst.";
}

function inferPrivateImpact(text: string): RecentDevelopmentImpact {
  if (/\bloss\b|\bdecline\b|\bpressure\b|\bdelay\b|\bcut\b|\bmiss\b|\bprobe\b|\binvestigation\b/i.test(text)) {
    return "negative";
  }

  if (/\bup\b|\bgrowth\b|\breached\b|\blaunch\b|\bexpan(?:d|s|ded)\b|\bmainnet\b|\bvaluation\b/i.test(text)) {
    return "positive";
  }

  return "mixed";
}

function buildEventKey(
  category: RecentDevelopmentCategory,
  text: string,
): string | null {
  if (category === "leadership" && /\bcook\b|\bternus\b|\bceo\b|\bsteps down\b|\bsuccessor\b/i.test(text)) {
    return "leadership-transition";
  }

  if (category === "earnings" && /\bearnings\b|\bguidance\b|\bforecast\b|\bbeat\b|\bmiss\b/i.test(text)) {
    return "earnings-cycle";
  }

  if (category === "analyst" && /\bupgrade(?:d|s)?\b|\bdowngrade(?:d|s)?\b|\bprice target\b/i.test(text)) {
    return "street-rating-change";
  }

  return null;
}

function scoreDevelopment(item: NewsHighlight): ScoredDevelopment {
  const text = normalizeWhitespace(`${item.headline} ${item.summary}`);
  const category = inferCategory(text);
  const impact = inferImpact(item, category, text);
  const materialityScore = Math.max(
    1,
    Math.round(
      categoryWeight(category) +
        recencyScore(item.publishedAt) +
        Math.abs(item.sentimentScore) * 18 +
        keywordBoost(text) -
        genericMacroPenalty(text),
    ),
  );
  const tokens = tokenizeHeadline(item.headline);

  return {
    headline: item.headline,
    source: item.source,
    publishedAt: item.publishedAt,
    url: item.url,
    category,
    impact,
    whyItMatters: buildWhyItMatters(category, impact, text),
    materialityScore,
    _eventKey: buildEventKey(category, text),
    _tokens: tokens,
  };
}

export function buildRecentDevelopments(
  company: string,
  highlights: readonly NewsHighlight[],
): readonly RecentDevelopment[] {
  if (highlights.length === 0) {
    return [];
  }

  const companyTokens = tokenizeCompany(company);
  const scored = highlights
    .map(scoreDevelopment)
    .sort((left, right) => right.materialityScore - left.materialityScore);

  const selected: ScoredDevelopment[] = [];

  for (const candidate of scored) {
    const candidateText = normalizeWhitespace(
      `${candidate.headline} ${candidate.whyItMatters}`,
    );

    if (
      companyTokens.length > 0 &&
      !companyTokens.some((token) =>
        candidateText.toLowerCase().includes(token),
      )
    ) {
      continue;
    }

    if (isLowSignalMarketContext(candidate.category, candidateText)) {
      continue;
    }

    if (candidate.materialityScore < MIN_RECENT_DEVELOPMENT_SCORE) {
      continue;
    }

    const isDuplicate = selected.some(
      (existing) =>
        (existing._eventKey !== null &&
          candidate._eventKey !== null &&
          existing._eventKey === candidate._eventKey) ||
        headlineSimilarity(existing._tokens, candidate._tokens) >=
          HEADLINE_SIMILARITY_THRESHOLD,
    );

    if (isDuplicate) {
      continue;
    }

    selected.push(candidate);

    if (selected.length >= MAX_RECENT_DEVELOPMENTS) {
      break;
    }
  }

  return selected.map((item) => ({
    headline: item.headline,
    source: item.source,
    publishedAt: item.publishedAt,
    url: item.url,
    category: item.category,
    impact: item.impact,
    whyItMatters: item.whyItMatters,
    materialityScore: item.materialityScore,
  }));
}

export function buildPrivateResearchDevelopments(
  _company: string,
  recentNews: string | null | undefined,
  publishedAt: string,
): readonly RecentDevelopment[] {
  const normalized = normalizeWhitespace(recentNews ?? "");

  if (normalized.length === 0) {
    return [];
  }

  const clauses = normalized
    .split(/\s*;\s*/g)
    .map((clause) => normalizeWhitespace(clause))
    .filter((clause) => clause.length >= 24)
    .map((clause) => {
      const category = inferCategory(clause);
      const impact = inferPrivateImpact(clause);
      const materialityScore = Math.max(
        1,
        categoryWeight(category) +
          keywordBoost(clause) -
          genericMacroPenalty(clause),
      );

      return {
        clause,
        category,
        impact,
        materialityScore,
      };
    })
    .filter(
      (item) =>
        item.materialityScore >= 24 &&
        (item.category !== "market-context" ||
          /\bvaluation\b|\bfunding\b|\btender\b|\bacquisition\b|\blaunch\b|\bmainnet\b|\bcustomer\b|\bvolume\b|\bgrowth\b/i.test(item.clause)),
    )
    .sort((left, right) => right.materialityScore - left.materialityScore)
    .slice(0, MAX_RECENT_DEVELOPMENTS);

  return clauses
    .map((item, index) => {
      return {
        headline: item.clause,
        source: "Exa Deep",
        publishedAt,
        url: "",
        category: item.category,
        impact: item.impact,
        whyItMatters: buildWhyItMatters(item.category, item.impact, item.clause),
        materialityScore: Math.max(24, item.materialityScore - index),
      } satisfies RecentDevelopment;
    });
}
