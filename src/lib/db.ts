import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

type MonitoredCompanyRow = {
  readonly id: string;
  readonly companyName: string;
  readonly companyId: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type AnalysisCacheRow = {
  readonly id: string;
  readonly companyId: string;
  readonly report: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
};

type MonitoredCompanyFindManyArgs = {
  readonly orderBy?: {
    readonly createdAt?: "asc" | "desc";
  };
};

type MonitoredCompanyFindFirstArgs = {
  readonly where: {
    readonly companyId: string;
  };
};

type AnalysisCacheFindUniqueArgs = {
  readonly where: {
    readonly companyId: string;
  };
};

type AnalysisCacheUpsertArgs = {
  readonly where: {
    readonly companyId: string;
  };
  readonly create: {
    readonly companyId: string;
    readonly report: string;
    readonly expiresAt: Date;
  };
  readonly update: {
    readonly report: string;
    readonly expiresAt: Date;
  };
};

type MonitoredCompanyCreateArgs = {
  readonly data: {
    readonly companyName: string;
    readonly companyId: string;
  };
};

type MonitoredCompanyUpdateArgs = {
  readonly where: {
    readonly id: string;
  };
  readonly data: {
    readonly companyName: string;
    readonly companyId: string;
  };
};

type MonitoredCompanyDeleteArgs = {
  readonly where: {
    readonly id: string;
  };
};

type StorageMode = "sqlite" | "memory";

const SQLITE_BINARY = process.platform === "win32" ? "sqlite3.exe" : "sqlite3";
const DATABASE_URL = normalizeDatabaseUrl(
  process.env.DATABASE_URL ?? "file:./prisma/dev.db",
);
const DATABASE_PATH = resolveDatabasePath(DATABASE_URL);
const SHOULD_AVOID_LOCAL_SQLITE =
  process.env.VERCEL === "1" && DATABASE_PATH !== null;
const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS MonitoredCompany (
    id TEXT PRIMARY KEY,
    companyName TEXT NOT NULL,
    companyId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS AnalysisCache (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL UNIQUE,
    report TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  );
`;

let storageMode: StorageMode | null = null;
let didLogMemoryFallback = false;

const memoryStore = {
  monitoredCompanies: new Map<string, MonitoredCompanyRow>(),
  analysisCache: new Map<string, AnalysisCacheRow>(),
};

function normalizeDatabaseUrl(url: string): string {
  return url.trim().replace(/^['"]|['"]$/g, "");
}

function resolveDatabasePath(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith("file:")) {
    return null;
  }

  const relativePath = databaseUrl.slice("file:".length).replace(/^\.[\\/]/, "");

  return path.resolve(process.cwd(), relativePath);
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlDate(value: Date): string {
  return sqlString(value.toISOString());
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const typedError = error as Error & {
      readonly code?: string;
      readonly errno?: number;
      readonly syscall?: string;
      readonly path?: string;
      readonly spawnargs?: readonly string[];
    };

    return {
      name: typedError.name,
      message: typedError.message,
      code: typedError.code ?? null,
      errno: typedError.errno ?? null,
      syscall: typedError.syscall ?? null,
      path: typedError.path ?? null,
      spawnargs: typedError.spawnargs ?? null,
    };
  }

  if (typeof error === "object" && error !== null) {
    return { ...error as Record<string, unknown> };
  }

  return { error: String(error) };
}

function logMemoryFallback(reason: string, error?: unknown): void {
  if (didLogMemoryFallback) {
    return;
  }

  didLogMemoryFallback = true;

  console.warn("[db] falling back to in-memory storage", {
    reason,
    databaseUrl: DATABASE_URL,
    runtime: process.env.VERCEL === "1" ? "vercel" : "node",
    error: error === undefined ? null : serializeError(error),
  });
}

function activateMemoryStorage(reason: string, error?: unknown): void {
  storageMode = "memory";
  logMemoryFallback(reason, error);
}

function execSqlite(args: readonly string[], sql?: string): string {
  return execFileSync(SQLITE_BINARY, [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    ...(sql !== undefined ? { input: sql } : {}),
  });
}

function runSqliteStatement(sql: string): void {
  if (DATABASE_PATH === null) {
    throw new Error("SQLite database path is unavailable.");
  }

  execSqlite([DATABASE_PATH], sql);
}

function querySqliteRows<T>(sql: string): readonly T[] {
  if (DATABASE_PATH === null) {
    throw new Error("SQLite database path is unavailable.");
  }

  const output = execSqlite(["-json", DATABASE_PATH], sql).trim();

  if (output.length === 0) {
    return [];
  }

  return JSON.parse(output) as readonly T[];
}

function ensureStorageMode(): void {
  if (storageMode !== null) {
    return;
  }

  if (SHOULD_AVOID_LOCAL_SQLITE) {
    activateMemoryStorage(
      "Local SQLite storage is not durable in the Vercel serverless runtime.",
    );
    return;
  }

  if (DATABASE_PATH === null) {
    activateMemoryStorage(
      "DATABASE_URL is not a file-based SQLite path, so the local CLI storage backend is unavailable.",
    );
    return;
  }

  try {
    mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
    runSqliteStatement(SQLITE_SCHEMA);
    storageMode = "sqlite";
  } catch (error) {
    activateMemoryStorage("SQLite initialization failed.", error);
  }
}

function withStorageFallback<T>(
  operation: string,
  sqliteOperation: () => T,
  memoryOperation: () => T,
): T {
  ensureStorageMode();

  if (storageMode === "memory") {
    return memoryOperation();
  }

  try {
    return sqliteOperation();
  } catch (error) {
    activateMemoryStorage(`SQLite operation failed during ${operation}.`, error);

    return memoryOperation();
  }
}

function toMonitoredCompanyRow(row: {
  readonly id: string;
  readonly companyName: string;
  readonly companyId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}): MonitoredCompanyRow {
  return {
    id: row.id,
    companyName: row.companyName,
    companyId: row.companyId,
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function toAnalysisCacheRow(row: {
  readonly id: string;
  readonly companyId: string;
  readonly report: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}): AnalysisCacheRow {
  return {
    id: row.id,
    companyId: row.companyId,
    report: row.report,
    createdAt: new Date(row.createdAt),
    expiresAt: new Date(row.expiresAt),
  };
}

function createNotFoundError(message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };

  error.code = "P2025";

  return error;
}

function getMemoryMonitoredCompanies(): readonly MonitoredCompanyRow[] {
  return [...memoryStore.monitoredCompanies.values()];
}

function sortMonitoredCompanies(
  rows: readonly MonitoredCompanyRow[],
  direction: "asc" | "desc",
): readonly MonitoredCompanyRow[] {
  return [...rows].sort((left, right) => {
    const delta = left.createdAt.getTime() - right.createdAt.getTime();

    return direction === "asc" ? delta : -delta;
  });
}

const analysisCache = {
  async findUnique(args: AnalysisCacheFindUniqueArgs): Promise<AnalysisCacheRow | null> {
    return withStorageFallback(
      "analysisCache.findUnique",
      () => {
        const rows = querySqliteRows<{
          readonly id: string;
          readonly companyId: string;
          readonly report: string;
          readonly createdAt: string;
          readonly expiresAt: string;
        }>(
          `
            SELECT id, companyId, report, createdAt, expiresAt
            FROM AnalysisCache
            WHERE companyId = ${sqlString(args.where.companyId)}
            LIMIT 1;
          `,
        );

        const row = rows[0];

        return row === undefined ? null : toAnalysisCacheRow(row);
      },
      () => memoryStore.analysisCache.get(args.where.companyId) ?? null,
    );
  },

  async upsert(args: AnalysisCacheUpsertArgs): Promise<void> {
    return withStorageFallback(
      "analysisCache.upsert",
      () => {
        const now = new Date().toISOString();

        runSqliteStatement(`
          INSERT INTO AnalysisCache (id, companyId, report, createdAt, expiresAt)
          VALUES (
            ${sqlString(randomUUID())},
            ${sqlString(args.create.companyId)},
            ${sqlString(args.create.report)},
            ${sqlString(now)},
            ${sqlDate(args.create.expiresAt)}
          )
          ON CONFLICT(companyId) DO UPDATE SET
            report = ${sqlString(args.update.report)},
            expiresAt = ${sqlDate(args.update.expiresAt)};
        `);
      },
      () => {
        const existing = memoryStore.analysisCache.get(args.where.companyId);
        const createdAt = existing?.createdAt ?? new Date();

        memoryStore.analysisCache.set(args.where.companyId, {
          id: existing?.id ?? randomUUID(),
          companyId: args.where.companyId,
          report: existing === undefined ? args.create.report : args.update.report,
          createdAt,
          expiresAt:
            existing === undefined ? args.create.expiresAt : args.update.expiresAt,
        });
      },
    );
  },
};

const monitoredCompany = {
  async findMany(args?: MonitoredCompanyFindManyArgs): Promise<readonly MonitoredCompanyRow[]> {
    return withStorageFallback(
      "monitoredCompany.findMany",
      () => {
        const direction = args?.orderBy?.createdAt === "asc" ? "ASC" : "DESC";
        const rows = querySqliteRows<{
          readonly id: string;
          readonly companyName: string;
          readonly companyId: string;
          readonly status: string;
          readonly createdAt: string;
          readonly updatedAt: string;
        }>(
          `
            SELECT id, companyName, companyId, status, createdAt, updatedAt
            FROM MonitoredCompany
            ORDER BY createdAt ${direction};
          `,
        );

        return rows.map((row) => toMonitoredCompanyRow(row));
      },
      () =>
        sortMonitoredCompanies(
          getMemoryMonitoredCompanies(),
          args?.orderBy?.createdAt === "asc" ? "asc" : "desc",
        ),
    );
  },

  async findFirst(args: MonitoredCompanyFindFirstArgs): Promise<MonitoredCompanyRow | null> {
    return withStorageFallback(
      "monitoredCompany.findFirst",
      () => {
        const rows = querySqliteRows<{
          readonly id: string;
          readonly companyName: string;
          readonly companyId: string;
          readonly status: string;
          readonly createdAt: string;
          readonly updatedAt: string;
        }>(
          `
            SELECT id, companyName, companyId, status, createdAt, updatedAt
            FROM MonitoredCompany
            WHERE companyId = ${sqlString(args.where.companyId)}
            ORDER BY createdAt DESC
            LIMIT 1;
          `,
        );

        const row = rows[0];

        return row === undefined ? null : toMonitoredCompanyRow(row);
      },
      () =>
        sortMonitoredCompanies(
          getMemoryMonitoredCompanies().filter(
            (row) => row.companyId === args.where.companyId,
          ),
          "desc",
        )[0] ?? null,
    );
  },

  async create(args: MonitoredCompanyCreateArgs): Promise<void> {
    return withStorageFallback(
      "monitoredCompany.create",
      () => {
        const now = new Date().toISOString();

        runSqliteStatement(`
          INSERT INTO MonitoredCompany (
            id,
            companyName,
            companyId,
            status,
            createdAt,
            updatedAt
          )
          VALUES (
            ${sqlString(randomUUID())},
            ${sqlString(args.data.companyName)},
            ${sqlString(args.data.companyId)},
            'idle',
            ${sqlString(now)},
            ${sqlString(now)}
          );
        `);
      },
      () => {
        const now = new Date();
        const id = randomUUID();

        memoryStore.monitoredCompanies.set(id, {
          id,
          companyName: args.data.companyName,
          companyId: args.data.companyId,
          status: "idle",
          createdAt: now,
          updatedAt: now,
        });
      },
    );
  },

  async update(args: MonitoredCompanyUpdateArgs): Promise<void> {
    return withStorageFallback(
      "monitoredCompany.update",
      () => {
        const now = new Date().toISOString();

        runSqliteStatement(`
          UPDATE MonitoredCompany
          SET
            companyName = ${sqlString(args.data.companyName)},
            companyId = ${sqlString(args.data.companyId)},
            updatedAt = ${sqlString(now)}
          WHERE id = ${sqlString(args.where.id)};
        `);
      },
      () => {
        const existing = memoryStore.monitoredCompanies.get(args.where.id);

        if (existing === undefined) {
          throw createNotFoundError("MonitoredCompany not found");
        }

        memoryStore.monitoredCompanies.set(args.where.id, {
          ...existing,
          companyName: args.data.companyName,
          companyId: args.data.companyId,
          updatedAt: new Date(),
        });
      },
    );
  },

  async delete(args: MonitoredCompanyDeleteArgs): Promise<void> {
    return withStorageFallback(
      "monitoredCompany.delete",
      () => {
        const rows = querySqliteRows<{ readonly id: string }>(
          `
            DELETE FROM MonitoredCompany
            WHERE id = ${sqlString(args.where.id)}
            RETURNING id;
          `,
        );

        if (rows.length === 0) {
          throw createNotFoundError("MonitoredCompany not found");
        }
      },
      () => {
        const didDelete = memoryStore.monitoredCompanies.delete(args.where.id);

        if (!didDelete) {
          throw createNotFoundError("MonitoredCompany not found");
        }
      },
    );
  },
};

export const db = {
  analysisCache,
  monitoredCompany,
};
