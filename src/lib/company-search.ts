import type { SearchResult } from "@/lib/types";

export type SearchSource = "finnhub" | "companies-house" | "gleif";

type SearchGroup = {
  readonly source: SearchSource;
  readonly results: readonly SearchResult[];
};

type ScoredSearchResult = SearchResult & {
  readonly source: SearchSource;
  readonly score: number;
};

const SEARCH_VARIANT_LIMIT = 3;
const RESULT_LIMIT = 8;
const MIN_SCORE = 30;

const LEGAL_SUFFIXES = new Set([
  "ag",
  "bv",
  "co",
  "company",
  "corporation",
  "corp",
  "gmbh",
  "holding",
  "holdings",
  "inc",
  "incorporated",
  "limited",
  "llc",
  "llp",
  "ltd",
  "plc",
  "sa",
  "sarl",
  "spa",
  "ug",
]);

const QUERY_STRIP_TERMS = new Set([
  "ag",
  "bank",
  "co",
  "company",
  "corporation",
  "corp",
  "group",
  "holding",
  "holdings",
  "inc",
  "incorporated",
  "limited",
  "llc",
  "llp",
  "ltd",
  "plc",
  "services",
  "solutions",
  "technology",
  "technologies",
  "the",
]);

function normalizeTokens(value: string): readonly string[] {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function normalizeText(value: string): string {
  return normalizeTokens(value).join(" ");
}

function stripTrailingLegalSuffixes(tokens: readonly string[]): readonly string[] {
  const trimmed = [...tokens];

  while (
    trimmed.length > 1 &&
    LEGAL_SUFFIXES.has(trimmed[trimmed.length - 1] ?? "")
  ) {
    trimmed.pop();
  }

  return trimmed;
}

function canonicalKey(value: string): string {
  const stripped = stripTrailingLegalSuffixes(normalizeTokens(value));

  return stripped.join(" ");
}

function tokenOverlap(left: readonly string[], right: readonly string[]): number {
  const leftTokens = left.filter((token) => !QUERY_STRIP_TERMS.has(token));
  const rightTokens = right.filter((token) => !QUERY_STRIP_TERMS.has(token));

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const rightTokenSet = new Set(rightTokens);
  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokenSet.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function getSourceWeight(source: SearchSource, query: string): number {
  const tokenCount = normalizeTokens(query).length;

  if (source === "finnhub") {
    return tokenCount <= 1 ? 26 : 14;
  }

  if (source === "companies-house") {
    return tokenCount <= 1 ? 20 : 34;
  }

  return tokenCount <= 1 ? 18 : 32;
}

function scoreSearchResult(
  query: string,
  result: SearchResult,
  source: SearchSource,
): number {
  const queryVariants = buildCompanySearchVariants(query);
  const candidateName = normalizeText(result.name);
  const candidateTokens = normalizeTokens(result.name);
  const candidateTicker = result.ticker ? normalizeText(result.ticker) : "";
  let bestScore = 0;

  for (let index = 0; index < queryVariants.length; index += 1) {
    const variant = queryVariants[index];
    const variantTokens = normalizeTokens(variant);
    const variantName = normalizeText(variant);
    const sourceWeight = getSourceWeight(source, variant);
    const variantWeight = SEARCH_VARIANT_LIMIT - index;
    let score = sourceWeight + variantWeight;

    if (candidateName === variantName) {
      score += 100;
    } else if (candidateName.startsWith(variantName)) {
      score += 80;
    } else if (candidateName.includes(variantName)) {
      score += 60;
    } else if (variantName.includes(candidateName)) {
      score += 50;
    } else {
      const overlap = tokenOverlap(variantTokens, candidateTokens);

      if (overlap > 0) {
        score += 15 + overlap * 8;
      }
    }

    if (candidateTicker.length > 0) {
      if (candidateTicker === variantName) {
        score += 25;
      } else if (
        candidateTicker.includes(variantName) ||
        variantName.includes(candidateTicker)
      ) {
        score += 10;
      }
    }

    if (candidateName.length > variantName.length + 20) {
      score -= 5;
    }

    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
}

function dedupeByBestScore(items: readonly ScoredSearchResult[]): readonly ScoredSearchResult[] {
  const byId = new Map<string, ScoredSearchResult>();

  for (const item of items) {
    const current = byId.get(item.id);

    if (current === undefined || item.score > current.score) {
      byId.set(item.id, item);
    }
  }

  const byKey = new Map<string, ScoredSearchResult>();

  for (const item of byId.values()) {
    const key = canonicalKey(item.name);
    const current = byKey.get(key);

    if (current === undefined) {
      byKey.set(key, item);
      continue;
    }

    if (
      item.score > current.score ||
      (item.score === current.score && item.name.length < current.name.length)
    ) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values()];
}

export function buildCompanySearchVariants(query: string): readonly string[] {
  const normalized = normalizeText(query);
  const tokens = normalized.split(" ").filter((token) => token.length > 0);
  const variants: string[] = [];

  const addVariant = (value: string): void => {
    const candidate = value.trim().replace(/\s+/g, " ");

    if (candidate.length === 0) {
      return;
    }

    if (!variants.includes(candidate)) {
      variants.push(candidate);
    }
  };

  addVariant(query.trim());
  addVariant(normalized);

  if (tokens.length > 1) {
    const strippedTerms = tokens.filter((token) => !QUERY_STRIP_TERMS.has(token));
    const strippedTrailing = stripTrailingLegalSuffixes(tokens);

    if (strippedTerms.length > 0) {
      addVariant(strippedTerms.join(" "));
    }

    if (strippedTrailing.length > 0) {
      addVariant(strippedTrailing.join(" "));
    }

    if (tokens[0] === "the") {
      addVariant(tokens.slice(1).join(" "));
    }
  }

  return variants.slice(0, SEARCH_VARIANT_LIMIT);
}

export function rankAndDedupeSearchResults(
  query: string,
  groups: readonly SearchGroup[],
): readonly SearchResult[] {
  const scored = groups.flatMap((group) =>
    group.results.map((result) => ({
      ...result,
      source: group.source,
      score: scoreSearchResult(query, result, group.source),
    })),
  );

  const ranked = [...dedupeByBestScore(scored)].sort(
    (left: ScoredSearchResult, right: ScoredSearchResult) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.name.localeCompare(right.name);
    },
  );

  if (ranked.length === 0) {
    return [];
  }

  const bestScore = ranked[0]?.score ?? 0;
  const threshold = Math.max(MIN_SCORE, bestScore - 35);

  return ranked
    .filter((item: ScoredSearchResult) => item.score >= threshold)
    .slice(0, RESULT_LIMIT)
    .map((item: ScoredSearchResult): SearchResult => ({
      id: item.id,
      name: item.name,
      ticker: item.ticker,
      jurisdiction: item.jurisdiction,
      description: item.description,
    }));
}
