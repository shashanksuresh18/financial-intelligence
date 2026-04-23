import { readFile } from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";
import type {
  AnalysisReport,
  CoverageGap,
  DataSource,
  DisagreementNote,
  EarningsHighlight,
  EvidenceSignal,
  InvestmentMemo,
  NewsHighlight,
} from "@/lib/types";

const DEFAULT_NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
const ANALYST_CORPUS_PATH = path.join(
  process.cwd(),
  "data",
  "analyst-note-corpus.json",
);
const MAX_CACHED_REPORTS = 24;
const MAX_RETRIEVED_CHUNKS = 6;

type AnalystCorpusEntry = {
  readonly id?: string;
  readonly company?: string;
  readonly title: string;
  readonly content: string;
  readonly source?: string;
  readonly publishedAt?: string;
  readonly tags?: readonly string[];
};

type RetrievalChunk = {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly company: string | null;
  readonly source: string;
  readonly kind: "cached-report" | "analyst-note";
  readonly publishedAt: string | null;
};

export type RetrievedContextChunk = {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly source: string;
  readonly kind: "cached-report" | "analyst-note";
  readonly company: string | null;
  readonly score: number;
};

type NebiusEmbeddingResponse = {
  readonly data?: readonly {
    readonly embedding?: readonly number[];
    readonly index?: number;
  }[];
};

type RetrievalInput = {
  readonly company: string;
  readonly memo: InvestmentMemo;
  readonly evidenceSignals: readonly EvidenceSignal[];
  readonly coverageGaps: readonly CoverageGap[];
  readonly disagreementNotes: readonly DisagreementNote[];
  readonly earningsHighlights: readonly EarningsHighlight[];
  readonly newsHighlights: readonly NewsHighlight[];
  readonly sources: readonly DataSource[];
};

const embeddingCache = new Map<string, readonly number[]>();
let analystCorpusCache:
  | {
      readonly raw: string;
      readonly chunks: readonly RetrievalChunk[];
    }
  | null = null;

function isNebiusRetrievalEnabled(): boolean {
  return process.env.USE_NEBIUS_MEMO?.trim().toLowerCase() === "true";
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function buildChunkId(prefix: string, index: number): string {
  return `${prefix}:${index}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAnalystCorpusEntry(
  value: unknown,
  index: number,
): AnalystCorpusEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = typeof value.title === "string" ? normalizeText(value.title) : "";
  const content = typeof value.content === "string" ? normalizeText(value.content) : "";

  if (title.length === 0 || content.length === 0) {
    return null;
  }

  return {
    id:
      typeof value.id === "string" && value.id.trim().length > 0
        ? value.id.trim()
        : buildChunkId("analyst", index),
    company:
      typeof value.company === "string" && value.company.trim().length > 0
        ? normalizeText(value.company)
        : undefined,
    title,
    content,
    source:
      typeof value.source === "string" && value.source.trim().length > 0
        ? normalizeText(value.source)
        : undefined,
    publishedAt:
      typeof value.publishedAt === "string" && value.publishedAt.trim().length > 0
        ? value.publishedAt.trim()
        : undefined,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

async function loadAnalystCorpusChunks(): Promise<readonly RetrievalChunk[]> {
  try {
    const raw = await readFile(ANALYST_CORPUS_PATH, "utf8");

    if (analystCorpusCache?.raw === raw) {
      return analystCorpusCache.chunks;
    }

    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [];
    const chunks = entries
      .map((entry, index) => normalizeAnalystCorpusEntry(entry, index))
      .filter((entry): entry is AnalystCorpusEntry => entry !== null)
      .map<RetrievalChunk>((entry, index) => ({
        id: entry.id ?? buildChunkId("analyst", index),
        title: entry.title,
        content: entry.content,
        company: entry.company ?? null,
        source: entry.source ?? "Analyst Corpus",
        kind: "analyst-note",
        publishedAt: entry.publishedAt ?? null,
      }));

    analystCorpusCache = { raw, chunks };
    return chunks;
  } catch {
    return [];
  }
}

function buildCachedReportChunks(report: AnalysisReport, index: number): readonly RetrievalChunk[] {
  const summaryChunk = normalizeText(
    [
      report.summary,
      report.investmentMemo.thesis,
      report.investmentMemo.antiThesis,
      report.investmentMemo.valuationCase,
    ]
      .filter((value) => value.trim().length > 0)
      .join(" "),
  );
  const riskChunk = normalizeText(
    [
      ...report.investmentMemo.whyNow,
      report.investmentMemo.keyDisqualifier,
      ...report.investmentMemo.whatImprovesConfidence,
      ...report.investmentMemo.whatReducesConfidence,
      ...report.investmentMemo.keyRisks.map((risk) => `${risk.title}: ${risk.detail}`),
    ]
      .filter((value) => value.trim().length > 0)
      .join(" "),
  );

  const chunks: RetrievalChunk[] = [
    {
      id: buildChunkId(`cache-${index}`, 0),
      title: `${report.company} | Memo Summary`,
      content: summaryChunk,
      company: report.company,
      source: "Analysis Cache",
      kind: "cached-report",
      publishedAt: report.updatedAt,
    },
    {
      id: buildChunkId(`cache-${index}`, 1),
      title: `${report.company} | Risks & Monitoring`,
      content: riskChunk,
      company: report.company,
      source: "Analysis Cache",
      kind: "cached-report",
      publishedAt: report.updatedAt,
    },
  ];

  return chunks.filter((chunk) => chunk.content.length > 0);
}

async function loadCachedReportChunks(): Promise<readonly RetrievalChunk[]> {
  const rows = await db.analysisCache.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_CACHED_REPORTS,
  });

  return rows.flatMap((row, index) => {
    try {
      const report = JSON.parse(row.report) as AnalysisReport;
      return buildCachedReportChunks(report, index);
    } catch {
      return [];
    }
  });
}

async function getEmbeddingVectors(
  texts: readonly string[],
): Promise<readonly (readonly number[] | null)[]> {
  if (!isNebiusRetrievalEnabled()) {
    return texts.map(() => null);
  }

  const apiKey = process.env.NEBIUS_API_KEY?.trim();
  const model = process.env.NEBIUS_EMBED_MODEL?.trim();

  if (!apiKey || !model) {
    return texts.map(() => null);
  }

  const baseUrl = (process.env.NEBIUS_BASE_URL?.trim() || DEFAULT_NEBIUS_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const cacheKeys = texts.map((text) => `${model}:${text}`);
  const uncachedTexts = texts.filter((text, index) => !embeddingCache.has(cacheKeys[index] ?? ""));

  if (uncachedTexts.length > 0) {
    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: uncachedTexts,
          encoding_format: "float",
        }),
      });

      if (!response.ok) {
        const body = (await response.text()).slice(0, 800);
        console.error("[nebius-retrieval] embeddings request failed", {
          status: response.status,
          body,
          model,
        });
        return texts.map(() => null);
      }

      const payload = (await response.json()) as NebiusEmbeddingResponse;
      const data = [...(payload.data ?? [])].sort(
        (left, right) => (left.index ?? 0) - (right.index ?? 0),
      );

      uncachedTexts.forEach((text, index) => {
        const embedding = data[index]?.embedding;

        if (Array.isArray(embedding) && embedding.length > 0) {
          embeddingCache.set(`${model}:${text}`, embedding);
        }
      });
    } catch (error: unknown) {
      console.error("[nebius-retrieval] embeddings error", {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      return texts.map(() => null);
    }
  }

  return cacheKeys.map((key) => embeddingCache.get(key) ?? null);
}

function dotProduct(left: readonly number[], right: readonly number[]): number {
  let total = 0;
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    total += left[index]! * right[index]!;
  }

  return total;
}

function magnitude(vector: readonly number[]): number {
  return Math.sqrt(dotProduct(vector, vector));
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const denominator = magnitude(left) * magnitude(right);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct(left, right) / denominator;
}

function buildRetrievalQuery(input: RetrievalInput): string {
  return normalizeText(
    [
      input.company,
      input.memo.verdict,
      input.memo.thesis,
      input.memo.antiThesis,
      ...input.memo.whyNow,
      ...input.evidenceSignals.slice(0, 4).map((signal) => `${signal.title}: ${signal.detail}`),
      ...input.coverageGaps.slice(0, 3).map((gap) => `${gap.title}: ${gap.detail}`),
      ...input.disagreementNotes
        .slice(0, 2)
        .map((note) => `${note.title}: ${note.detail}`),
      ...input.earningsHighlights
        .slice(0, 2)
        .map((item) => `${item.period} earnings surprise ${item.surprisePercent ?? "n/a"}`),
      ...input.newsHighlights
        .slice(0, 2)
        .map((item) => `${item.sentimentLabel} news: ${item.headline}`),
      `Sources: ${input.sources.join(", ")}`,
    ]
      .filter((value) => value.trim().length > 0)
      .join(" "),
  );
}

function applyKeywordBoost(
  query: string,
  chunk: RetrievalChunk,
  score: number,
): number {
  const normalizedQuery = query.toLowerCase();
  const normalizedChunk = `${chunk.title} ${chunk.content}`.toLowerCase();

  if (chunk.company !== null && chunk.company.toLowerCase() === normalizedQuery) {
    return score + 0.2;
  }

  if (normalizedChunk.includes(normalizedQuery)) {
    return score + 0.08;
  }

  return score;
}

export async function retrieveNebiusMemoContext(
  input: RetrievalInput,
): Promise<readonly RetrievedContextChunk[]> {
  if (!isNebiusRetrievalEnabled()) {
    return [];
  }

  const analystChunks = await loadAnalystCorpusChunks();
  const cachedChunks = await loadCachedReportChunks();
  const corpus = [...analystChunks, ...cachedChunks];

  if (corpus.length === 0) {
    return [];
  }

  const queryText = buildRetrievalQuery(input);
  const allTexts = [queryText, ...corpus.map((chunk) => chunk.content)];
  const vectors = await getEmbeddingVectors(allTexts);
  const queryVector = vectors[0];

  if (queryVector === null) {
    return [];
  }

  return corpus
    .map((chunk, index) => {
      const vector = vectors[index + 1];

      if (vector === null) {
        return null;
      }

      return {
        id: chunk.id,
        title: chunk.title,
        content: chunk.content,
        source: chunk.source,
        kind: chunk.kind,
        company: chunk.company,
        score: applyKeywordBoost(
          input.company,
          chunk,
          cosineSimilarity(queryVector, vector),
        ),
      } satisfies RetrievedContextChunk;
    })
    .filter((chunk): chunk is RetrievedContextChunk => chunk !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_RETRIEVED_CHUNKS);
}
