import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
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

const SQLITE_BINARY = process.platform === "win32" ? "sqlite3.exe" : "sqlite3";
const DATABASE_URL = normalizeDatabaseUrl(
  process.env.DATABASE_URL ?? "file:./prisma/dev.db",
);
const DATABASE_PATH = resolveDatabasePath(DATABASE_URL);

let isInitialized = false;

function normalizeDatabaseUrl(url: string): string {
  return url.trim().replace(/^['"]|['"]$/g, "");
}

function resolveDatabasePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL: ${databaseUrl}`);
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

function execSql(args: readonly string[], sql?: string): string {
  return execFileSync(SQLITE_BINARY, [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    ...(sql !== undefined ? { input: sql } : {}),
  });
}

function runStatement(sql: string): void {
  execSql([DATABASE_PATH], sql);
}

function queryRows<T>(sql: string): readonly T[] {
  const output = execSql(["-json", DATABASE_PATH], sql).trim();

  if (output.length === 0) {
    return [];
  }

  return JSON.parse(output) as readonly T[];
}

function ensureSchema(): void {
  if (isInitialized) {
    return;
  }

  mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

  runStatement(`
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
  `);

  isInitialized = true;
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

const analysisCache = {
  async findUnique(args: AnalysisCacheFindUniqueArgs): Promise<AnalysisCacheRow | null> {
    ensureSchema();

    const rows = queryRows<{
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

  async upsert(args: AnalysisCacheUpsertArgs): Promise<void> {
    ensureSchema();

    const now = new Date().toISOString();

    runStatement(`
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
};

const monitoredCompany = {
  async findMany(args?: MonitoredCompanyFindManyArgs): Promise<readonly MonitoredCompanyRow[]> {
    ensureSchema();

    const direction = args?.orderBy?.createdAt === "asc" ? "ASC" : "DESC";
    const rows = queryRows<{
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

  async findFirst(args: MonitoredCompanyFindFirstArgs): Promise<MonitoredCompanyRow | null> {
    ensureSchema();

    const rows = queryRows<{
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

  async create(args: MonitoredCompanyCreateArgs): Promise<void> {
    ensureSchema();

    const now = new Date().toISOString();

    runStatement(`
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

  async update(args: MonitoredCompanyUpdateArgs): Promise<void> {
    ensureSchema();

    const now = new Date().toISOString();

    runStatement(`
      UPDATE MonitoredCompany
      SET
        companyName = ${sqlString(args.data.companyName)},
        companyId = ${sqlString(args.data.companyId)},
        updatedAt = ${sqlString(now)}
      WHERE id = ${sqlString(args.where.id)};
    `);
  },

  async delete(args: MonitoredCompanyDeleteArgs): Promise<void> {
    ensureSchema();

    const rows = queryRows<{ readonly id: string }>(
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
};

export const db = {
  analysisCache,
  monitoredCompany,
};
