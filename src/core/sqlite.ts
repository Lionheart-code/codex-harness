import * as fs from "node:fs";
import * as path from "node:path";

export interface StatementLike {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface DatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  close(): void;
}

interface SqliteModuleLike {
  DatabaseSync?: new (database: string) => DatabaseLike;
}

const SQLITE_SPECIFIER = "node:sqlite";

export interface SqliteProbeResult {
  available: boolean;
  message: string;
}

function loadNodeSqlite(): SqliteModuleLike {
  return require(SQLITE_SPECIFIER) as SqliteModuleLike;
}

export function probeNodeSqlite(): SqliteProbeResult {
  try {
    const sqlite = loadNodeSqlite();

    if (typeof sqlite.DatabaseSync !== "function") {
      return {
        available: false,
        message: "node:sqlite loaded, but DatabaseSync is not available."
      };
    }

    return {
      available: true,
      message: "node:sqlite DatabaseSync is available."
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      message: `node:sqlite is unavailable or unsupported in this Node runtime: ${message}`
    };
  }
}

export function openSqliteDatabase(databasePath: string): DatabaseLike {
  const probe = probeNodeSqlite();

  if (!probe.available) {
    throw new Error(`${probe.message}\nSQLite-backed memory commands require a Node runtime with node:sqlite.`);
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = loadNodeSqlite();

  if (typeof sqlite.DatabaseSync !== "function") {
    throw new Error("node:sqlite loaded, but DatabaseSync is not available.");
  }

  return new sqlite.DatabaseSync(databasePath);
}

export function escapeSqliteLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
