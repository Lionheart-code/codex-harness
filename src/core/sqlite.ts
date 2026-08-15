import * as fs from "node:fs";
import * as os from "node:os";
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
  DatabaseSync?: new (database: string, options?: { readOnly?: boolean }) => DatabaseLike;
}

export function openSqliteDatabaseReadOnly(databasePath: string): DatabaseLike {
  if (!fs.existsSync(databasePath)) throw new Error(`SQLite database not found: ${databasePath}`);
  const probe = probeNodeSqlite();
  if (!probe.available) throw new Error(`${probe.message}\nSQLite-backed memory commands require a Node runtime with node:sqlite.`);
  const sqlite = loadNodeSqlite();
  if (typeof sqlite.DatabaseSync !== "function") throw new Error("node:sqlite loaded, but DatabaseSync is not available.");
  // SQLite may need to create or update WAL/SHM sidecars even for a logical read.
  // Never give a report/packet command that capability in the authoritative DB
  // directory. Materialize a consistency-checked private snapshot instead.
  const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-harness-sqlite-read-"));
  const snapshotPath = path.join(snapshotRoot, path.basename(databasePath));
  const sourcePaths = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
  const fingerprint = (sourcePath: string): string => {
    if (!fs.existsSync(sourcePath)) return "missing";
    const stat = fs.statSync(sourcePath, { bigint: true });
    return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
  };
  const before = sourcePaths.map(fingerprint);
  try {
    for (const sourcePath of sourcePaths) {
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, path.join(snapshotRoot, path.basename(sourcePath)));
      }
    }
    const after = sourcePaths.map(fingerprint);
    if (before.some((value, index) => value !== after[index])) {
      throw new Error(`SQLITE_READ_SNAPSHOT_CHANGED:${databasePath}`);
    }
    const snapshot = new sqlite.DatabaseSync(snapshotPath, { readOnly: true });
    return {
      exec: (sql) => snapshot.exec(sql),
      prepare: (sql) => snapshot.prepare(sql),
      close: () => {
        try { snapshot.close(); }
        finally { fs.rmSync(snapshotRoot, { recursive: true, force: true }); }
      }
    };
  } catch (error) {
    fs.rmSync(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
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
