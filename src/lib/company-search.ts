import type { SearchResult } from '@/lib/types';

export type SearchSource = 'finnhub' | 'companies-house' | 'gleif';

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
const STRONG_NAME_MATCH_SCORE = 70;

const LEGAL_SUFFIXES = new Set([
  'ag',
  'bv',
  'co',
  'company',
  'corporation',
  'corp',
  'gmbh',
  'holding',
  'holdings',
  'inc',
  'incorporated',
  'limited',
  'llc',
  'llp',
  'ltd',
  'plc',
  'sa',
  'sarl',
  'spa',
  'ug',
]);

const KNOWN_PRIVATE_COMPANIES = [
  'SpaceX',
  'Stripe',
  'Databricks',
  'Anthropic',
  'OpenAI',
  'Open AI',
  'xAI',
  'x AI',
  'Revolut',
  'Gopuff',
  'Getir',
  'Flink',
  'Brex',
  'Ramp',
  'Deel',
  'Notion',
  'Canva',
  'ByteDance',
] as const;

const KNOWN_UK_COMPANIES = [
  'Greggs',
  'Boohoo',
  'ASOS',
  'Marks and Spencer',
  'Tesco',
  'Sainsbury',
  'Shell',
  'BP',
  'AstraZeneca',
  'GSK',
  'HSBC Holdings',
  'Barclays',
  'Lloyds Banking Group',
  'NatWest',
  'Standard Chartered',
  'Prudential',
  'Darktrace',
  'Revolut',
  'Starling Bank',
  'Monzo',
  'Wise',
  'Rolls-Royce',
  'BAE Systems',
  'Unilever',
  'Reckitt Benckiser',
  'Diageo',
  'British American Tobacco',
  'Ocado',
  'JD Sports',
  'Next',
] as const;

const UK_COMPANY_SUFFIX_PATTERN = /\b(?:plc|limited|ltd)\b$/i;

const QUERY_STRIP_TERMS = new Set([
  'ag',
  'bank',
  'co',
  'company',
  'corporation',
  'corp',
  'group',
  'holding',
  'holdings',
  'inc',
  'incorporated',
  'limited',
  'llc',
  'llp',
  'ltd',
  'plc',
  'services',
  'solutions',
  'technology',
  'technologies',
  'the',
]);

function normalizeTokens(value: string): readonly string[] {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function normalizeText(value: string): string {
  return normalizeTokens(value).join(' ');
}

function stripTrailingLegalSuffixes(
  tokens: readonly string[]
): readonly string[] {
  const trimmed = [...tokens];

  while (
    trimmed.length > 1 &&
    LEGAL_SUFFIXES.has(trimmed[trimmed.length - 1] ?? '')
  ) {
    trimmed.pop();
  }

  return trimmed;
}

function canonicalKey(value: string): string {
  const stripped = stripTrailingLegalSuffixes(normalizeTokens(value));

  return stripped.join(' ');
}

function compactKey(value: string): string {
  return canonicalKey(value).replace(/\s+/g, '');
}

const KNOWN_PRIVATE_COMPANY_KEYS = new Set(
  KNOWN_PRIVATE_COMPANIES.map((company) => canonicalKey(company))
);
const KNOWN_PRIVATE_COMPANY_DISPLAY_NAMES = new Map(
  KNOWN_PRIVATE_COMPANIES.map(
    (company) => [canonicalKey(company), company] as const
  )
);
const KNOWN_UK_COMPANY_KEYS = new Set(
  KNOWN_UK_COMPANIES.map((company) => canonicalKey(company))
);

function tokenOverlap(
  left: readonly string[],
  right: readonly string[]
): number {
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

  if (source === 'finnhub') {
    return tokenCount <= 1 ? 26 : 14;
  }

  if (source === 'companies-house') {
    return tokenCount <= 1 ? 20 : 34;
  }

  return tokenCount <= 1 ? 18 : 32;
}

export function normalizeCompanyMatchKey(value: string): string {
  return canonicalKey(value);
}

export function scoreCompanyNameMatch(
  query: string,
  candidateName: string
): number {
  const queryVariants = buildCompanySearchVariants(query);
  const candidateKey = canonicalKey(candidateName);
  const candidateCompact = compactKey(candidateName);
  const candidateTokens = candidateKey
    .split(' ')
    .filter((token) => token.length > 0);
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const variant of queryVariants) {
    const variantKey = canonicalKey(variant);
    const variantCompact = compactKey(variant);
    const variantTokens = variantKey
      .split(' ')
      .filter((token) => token.length > 0);

    if (variantKey.length === 0) {
      continue;
    }

    let score = 0;

    if (candidateKey === variantKey) {
      score = 120;
    } else if (candidateKey.startsWith(`${variantKey} `)) {
      score = 95;
    } else if (
      variantTokens.length === 1 &&
      candidateTokens.includes(variantTokens[0] ?? '')
    ) {
      score = 78;
    } else if (
      variantTokens.length > 1 &&
      variantTokens.every((token) => candidateTokens.includes(token))
    ) {
      score = 72;
    } else if (variantKey.startsWith(`${candidateKey} `)) {
      score = 58;
    } else {
      const overlap = tokenOverlap(variantTokens, candidateTokens);

      if (overlap > 0) {
        score = 18 + overlap * 10;
      } else if (
        variantCompact.length >= 4 &&
        candidateCompact.includes(variantCompact)
      ) {
        // Penalize merged-token substring matches such as "SpaceX" -> "Metaspacex".
        score = -20;
      }
    }

    if (score > bestScore) {
      bestScore = score;
    }
  }

  return Number.isFinite(bestScore) ? bestScore : 0;
}

export function hasStrongCompanyNameMatch(
  query: string,
  candidateName: string
): boolean {
  return scoreCompanyNameMatch(query, candidateName) >= STRONG_NAME_MATCH_SCORE;
}

export function isKnownPrivateCompanyQuery(query: string): boolean {
  return KNOWN_PRIVATE_COMPANY_KEYS.has(canonicalKey(query));
}

export function getKnownPrivateCompanyCanonicalName(
  query: string
): string | null {
  return KNOWN_PRIVATE_COMPANY_DISPLAY_NAMES.get(canonicalKey(query)) ?? null;
}

export function isKnownUkCompanyQuery(query: string): boolean {
  return KNOWN_UK_COMPANY_KEYS.has(canonicalKey(query));
}

export function hasUkCompanyNameSuffix(value: string): boolean {
  return UK_COMPANY_SUFFIX_PATTERN.test(value.trim());
}

function scoreSearchResult(
  query: string,
  result: SearchResult,
  source: SearchSource
): number {
  const queryVariants = buildCompanySearchVariants(query);
  const nameScore = scoreCompanyNameMatch(query, result.name);
  const candidateTicker = result.ticker ? normalizeText(result.ticker) : '';
  let bestScore = 0;

  for (let index = 0; index < queryVariants.length; index += 1) {
    const variant = queryVariants[index];
    const variantName = normalizeText(variant);
    const sourceWeight = getSourceWeight(source, variant);
    const variantWeight = SEARCH_VARIANT_LIMIT - index;
    let score = sourceWeight + variantWeight + nameScore;

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

    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
}

function dedupeByBestScore(
  items: readonly ScoredSearchResult[]
): readonly ScoredSearchResult[] {
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

    const currentHasTicker =
      typeof current.ticker === 'string' && current.ticker.trim().length > 0;
    const itemHasTicker =
      typeof item.ticker === 'string' && item.ticker.trim().length > 0;

    if (itemHasTicker && !currentHasTicker) {
      byKey.set(key, item);
      continue;
    }

    if (!itemHasTicker && currentHasTicker) {
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
  const tokens = normalized.split(' ').filter((token) => token.length > 0);
  const variants: string[] = [];

  const addVariant = (value: string): void => {
    const candidate = value.trim().replace(/\s+/g, ' ');

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
    const strippedTerms = tokens.filter(
      (token) => !QUERY_STRIP_TERMS.has(token)
    );
    const strippedTrailing = stripTrailingLegalSuffixes(tokens);

    if (strippedTerms.length > 0) {
      addVariant(strippedTerms.join(' '));
    }

    if (strippedTrailing.length > 0) {
      addVariant(strippedTrailing.join(' '));
    }

    if (tokens[0] === 'the') {
      addVariant(tokens.slice(1).join(' '));
    }
  }

  return variants.slice(0, SEARCH_VARIANT_LIMIT);
}

export function rankAndDedupeSearchResults(
  query: string,
  groups: readonly SearchGroup[]
): readonly SearchResult[] {
  const scored = groups.flatMap((group) =>
    group.results.map((result) => ({
      ...result,
      source: group.source,
      score: scoreSearchResult(query, result, group.source),
    }))
  );

  const ranked = [...dedupeByBestScore(scored)].sort(
    (left: ScoredSearchResult, right: ScoredSearchResult) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.name.localeCompare(right.name);
    }
  );

  if (ranked.length === 0) {
    return [];
  }

  const bestScore = ranked[0]?.score ?? 0;
  const threshold = Math.max(MIN_SCORE, bestScore - 35);

  return ranked
    .filter((item: ScoredSearchResult) => item.score >= threshold)
    .slice(0, RESULT_LIMIT)
    .map(
      (item: ScoredSearchResult): SearchResult => ({
        id: item.id,
        name: item.name,
        displayName: item.displayName,
        subtitle: item.subtitle,
        source: item.source,
        ticker: item.ticker,
        companyNumber: item.companyNumber,
        jurisdiction: item.jurisdiction,
        description: item.description,
        canUseAnalyze: item.canUseAnalyze,
      })
    );
}
