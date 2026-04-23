import type {
  NewsHighlight,
  NewsSentimentLabel,
  NewsSentimentSummary,
} from "@/lib/types";

type NewsHighlightInput = Pick<
  NewsHighlight,
  "headline" | "source" | "publishedAt" | "summary" | "url"
> &
  Partial<
    Pick<
      NewsHighlight,
      "sentimentLabel" | "sentimentScore" | "sentimentRationale"
    >
  >;

type PhraseRule = {
  readonly pattern: RegExp;
  readonly score: number;
  readonly driver: string;
};

const MAX_ABSOLUTE_SCORE = 3.5;
const POSITIVE_THRESHOLD = 0.18;
const NEGATIVE_THRESHOLD = -0.18;

const POSITIVE_RULES: readonly PhraseRule[] = [
  { pattern: /\bbeat(?:s|ing|en)? estimates?\b/i, score: 1.4, driver: "beat estimates" },
  { pattern: /\braises? (?:guidance|forecast|outlook|target)s?\b/i, score: 1.2, driver: "raised guidance" },
  { pattern: /\bupgrade(?:d|s)?\b/i, score: 1.0, driver: "analyst upgrade" },
  { pattern: /\breiterate[sd]? buy\b|\bmaintains? buy\b/i, score: 0.9, driver: "buy support" },
  { pattern: /\bprofitabil(?:ity|y)\b|\bprofitable\b/i, score: 0.7, driver: "profitability" },
  { pattern: /\bstrong demand\b|\bstrong results?\b|\brecord\b/i, score: 0.7, driver: "strong operating language" },
  { pattern: /\bgrowth\b|\bexpand(?:s|ed|ing)?\b|\brebound\b/i, score: 0.5, driver: "growth signal" },
  { pattern: /\bpartnership\b|\bdeal\b|\bcontract\b|\bwin(?:s|ning)?\b/i, score: 0.5, driver: "commercial win" },
  { pattern: /\bapproval\b|\bcleared\b|\bauthoriz(?:ed|ation)\b/i, score: 0.6, driver: "approval catalyst" },
];

const NEGATIVE_RULES: readonly PhraseRule[] = [
  { pattern: /\bmiss(?:es|ed|ing)? estimates?\b/i, score: -1.4, driver: "missed estimates" },
  { pattern: /\bcuts? (?:guidance|forecast|outlook|target)s?\b/i, score: -1.3, driver: "guidance cut" },
  { pattern: /\bdowngrade(?:d|s)?\b/i, score: -1.0, driver: "analyst downgrade" },
  { pattern: /\blawsuit\b|\bsues?\b|\bprobe\b|\binvestigation\b|\bantitrust\b|\bregulatory\b/i, score: -1.0, driver: "legal or regulatory risk" },
  { pattern: /\brecall\b|\bdefect\b|\bsafety issue\b/i, score: -1.0, driver: "product risk" },
  { pattern: /\bslump\b|\bdecline(?:s|d)?\b|\bdrop(?:s|ped)?\b|\bfall(?:s|en)?\b/i, score: -0.7, driver: "negative operating language" },
  { pattern: /\bwarning\b|\bwarns?\b|\bheadwind\b|\bpressure\b|\bsofter\b|\bweak\b/i, score: -0.7, driver: "pressure signal" },
  { pattern: /\bsteps down\b|\bresigns?\b|\bdeparture\b|\bsuccession\b/i, score: -0.45, driver: "leadership transition" },
  { pattern: /\btariff\b|\bshortage\b|\bdisruption\b|\bdelays?\b/i, score: -0.6, driver: "external pressure" },
  { pattern: /\bbankruptcy\b|\bdefault\b|\bfraud\b/i, score: -1.4, driver: "distress signal" },
];

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreToLabel(score: number): NewsSentimentLabel {
  if (score >= POSITIVE_THRESHOLD) {
    return "positive";
  }

  if (score <= NEGATIVE_THRESHOLD) {
    return "negative";
  }

  return "neutral";
}

function collectMatches(text: string): {
  readonly rawScore: number;
  readonly drivers: readonly string[];
} {
  const drivers: string[] = [];
  let rawScore = 0;

  for (const rule of [...POSITIVE_RULES, ...NEGATIVE_RULES]) {
    if (!rule.pattern.test(text)) {
      continue;
    }

    rawScore += rule.score;

    if (!drivers.includes(rule.driver)) {
      drivers.push(rule.driver);
    }
  }

  return { rawScore, drivers };
}

function recencyWeight(publishedAt: string): number {
  const parsed = new Date(publishedAt);

  if (Number.isNaN(parsed.getTime())) {
    return 1;
  }

  const ageMs = Date.now() - parsed.getTime();
  const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));

  return 1 / (1 + ageDays / 14);
}

function buildArticleRationale(
  label: NewsSentimentLabel,
  drivers: readonly string[],
): string {
  if (drivers.length === 0) {
    return "No strong finance-specific directional language was detected in the headline set.";
  }

  const driverText = drivers.slice(0, 2).join(", ");

  if (label === "positive") {
    return `Positive finance-news tone driven by ${driverText}.`;
  }

  if (label === "negative") {
    return `Negative finance-news tone driven by ${driverText}.`;
  }

  return `Mixed or balanced finance-news tone with signals such as ${driverText}.`;
}

function buildSummaryRationale(
  label: NewsSentimentLabel,
  positiveCount: number,
  negativeCount: number,
  neutralCount: number,
): string {
  if (positiveCount === 0 && negativeCount === 0) {
    return `Recent coverage is mostly neutral (${neutralCount} neutral headline${neutralCount === 1 ? "" : "s"}).`;
  }

  if (label === "positive") {
    return `Recent finance-news tone skews constructive (${positiveCount} positive / ${negativeCount} negative / ${neutralCount} neutral).`;
  }

  if (label === "negative") {
    return `Recent finance-news tone skews cautious (${positiveCount} positive / ${negativeCount} negative / ${neutralCount} neutral).`;
  }

  return `Recent finance-news tone is mixed (${positiveCount} positive / ${negativeCount} negative / ${neutralCount} neutral).`;
}

export function enrichNewsHighlight(highlight: NewsHighlightInput): NewsHighlight {
  if (
    highlight.sentimentLabel !== undefined &&
    highlight.sentimentScore !== undefined &&
    highlight.sentimentRationale !== undefined
  ) {
    return highlight as NewsHighlight;
  }

  const text = normalizeWhitespace(`${highlight.headline} ${highlight.summary}`);
  const { rawScore, drivers } = collectMatches(text);
  const sentimentScore = clamp(
    rawScore / MAX_ABSOLUTE_SCORE,
    -1,
    1,
  );
  const sentimentLabel = scoreToLabel(sentimentScore);

  return {
    ...highlight,
    sentimentLabel,
    sentimentScore,
    sentimentRationale: buildArticleRationale(sentimentLabel, drivers),
  };
}

export function summarizeNewsSentiment(
  highlights: readonly NewsHighlight[],
): NewsSentimentSummary | null {
  if (highlights.length === 0) {
    return null;
  }

  const enrichedHighlights = highlights.map(enrichNewsHighlight);
  const weightedTotal = enrichedHighlights.reduce(
    (total, item) => total + item.sentimentScore * recencyWeight(item.publishedAt),
    0,
  );
  const weightSum = enrichedHighlights.reduce(
    (total, item) => total + recencyWeight(item.publishedAt),
    0,
  );
  const score = weightSum === 0 ? 0 : clamp(weightedTotal / weightSum, -1, 1);
  const positiveCount = enrichedHighlights.filter(
    (item) => item.sentimentLabel === "positive",
  ).length;
  const negativeCount = enrichedHighlights.filter(
    (item) => item.sentimentLabel === "negative",
  ).length;
  const neutralCount = enrichedHighlights.length - positiveCount - negativeCount;
  const label = scoreToLabel(score);

  return {
    score,
    label,
    articleCount: enrichedHighlights.length,
    positiveCount,
    negativeCount,
    neutralCount,
    rationale: buildSummaryRationale(
      label,
      positiveCount,
      negativeCount,
      neutralCount,
    ),
  };
}
