import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

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
  DatabaseSync?: new (database: string | URL, options?: { readOnly?: boolean }) => DatabaseLike;
}

export function openSqliteDatabaseReadOnly(databasePath: string): DatabaseLike {
  if (!fs.existsSync(databasePath)) throw new Error(`SQLite database not found: ${databasePath}`);
  const probe = probeNodeSqlite();
  if (!probe.available) throw new Error(`${probe.message}\nSQLite-backed memory commands require a Node runtime with node:sqlite.`);
  const sqlite = loadNodeSqlite();
  if (typeof sqlite.DatabaseSync !== "function") throw new Error("node:sqlite loaded, but DatabaseSync is not available.");
  const sourcePaths = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
  const fingerprint = (sourcePath: string): string => {
    if (!fs.existsSync(sourcePath)) return "missing";
    const stat = fs.statSync(sourcePath, { bigint: true });
    return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
  };
  const before = sourcePaths.map(fingerprint);
  const walPath = `${databasePath}-wal`;
  if (fs.existsSync(walPath) && fs.statSync(walPath).size > 32) {
    throw new Error(`SQLITE_READ_ACTIVE_WAL_UNAVAILABLE:${databasePath}`);
  }
  const immutableUrl = pathToFileURL(databasePath);
  immutableUrl.searchParams.set("mode", "ro");
  immutableUrl.searchParams.set("immutable", "1");
  const immutable = new sqlite.DatabaseSync(immutableUrl, { readOnly: true });
  return {
    exec: (sql) => immutable.exec(sql),
    prepare: (sql) => immutable.prepare(sql),
    close: () => {
      immutable.close();
      const after = sourcePaths.map(fingerprint);
      if (before.some((value, index) => value !== after[index])) {
        throw new Error(`SQLITE_READ_SNAPSHOT_CHANGED:${databasePath}`);
      }
    }
  };
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
