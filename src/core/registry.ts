import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { InstallMetadata } from "./install";

export interface RegistryProjectRecord {
  root_path: string;
  harness_version: string;
  templates_version: string;
  registered_at: string;
  updated_at: string;
}

export interface ProjectRegistry {
  version: 1;
  projects: RegistryProjectRecord[];
}

export interface RegistryWriteResult {
  action: "created" | "updated" | "unchanged" | "skipped";
  registryPath: string;
  warning?: string;
}

const REGISTRY_DIR_NAME = ".codex-harness";
const REGISTRY_FILE_NAME = "registry.json";

function normalizeRootPath(targetPath: string): string {
  let resolved: string;

  try {
    resolved = fs.realpathSync.native(targetPath);
  } catch {
    resolved = path.resolve(targetPath);
  }

  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function parseRegistry(raw: string, sourceLabel: string): ProjectRegistry {
  const parsed = JSON.parse(raw) as Partial<ProjectRegistry>;

  if (parsed.version !== 1 || !Array.isArray(parsed.projects)) {
    throw new Error(`Invalid project registry in ${sourceLabel}.`);
  }

  for (const entry of parsed.projects) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.root_path !== "string" ||
      typeof entry.harness_version !== "string" ||
      typeof entry.templates_version !== "string" ||
      typeof entry.registered_at !== "string" ||
      typeof entry.updated_at !== "string"
    ) {
      throw new Error(`Invalid project registry in ${sourceLabel}.`);
    }
  }

  return {
    version: 1,
    projects: parsed.projects as RegistryProjectRecord[]
  };
}

function buildRegistryPath(): string {
  return path.join(os.homedir(), REGISTRY_DIR_NAME, REGISTRY_FILE_NAME);
}

function buildRegistryJson(registry: ProjectRegistry): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

export function getProjectRegistryPath(): string {
  return buildRegistryPath();
}

export function loadProjectRegistry(): ProjectRegistry | undefined {
  const registryPath = buildRegistryPath();

  if (!fs.existsSync(registryPath)) {
    return undefined;
  }

  if (!fs.statSync(registryPath).isFile()) {
    throw new Error(`Project registry is not a file: ${registryPath}`);
  }

  return parseRegistry(fs.readFileSync(registryPath, "utf8"), registryPath);
}

export function upsertRegistryProject(targetRoot: string, metadata: InstallMetadata): RegistryWriteResult {
  const registryPath = buildRegistryPath();
  const normalizedTargetRoot = normalizeRootPath(targetRoot);
  let registry: ProjectRegistry = {
    version: 1,
    projects: []
  };

  try {
    const existingRegistry = loadProjectRegistry();

    if (existingRegistry) {
      registry = existingRegistry;
    }
  } catch (registryError) {
    const message = registryError instanceof Error ? registryError.message : String(registryError);
    return {
      action: "skipped",
      registryPath,
      warning: `Registry update skipped: ${message}`
    };
  }

  const now = new Date().toISOString();
  const deduplicatedEntries = new Map<string, RegistryProjectRecord>();

  for (const entry of registry.projects) {
    deduplicatedEntries.set(normalizeRootPath(entry.root_path), entry);
  }

  const existingEntry = deduplicatedEntries.get(normalizedTargetRoot);
  const nextEntry: RegistryProjectRecord = existingEntry
    ? {
        ...existingEntry,
        root_path: targetRoot,
        harness_version: metadata.harness_version,
        templates_version: metadata.templates_version,
        updated_at: now
      }
    : {
        root_path: targetRoot,
        harness_version: metadata.harness_version,
        templates_version: metadata.templates_version,
        registered_at: now,
        updated_at: now
      };

  const action =
    existingEntry === undefined ? "created" : buildRegistryJson({
      version: 1,
      projects: [existingEntry]
    }) === buildRegistryJson({
      version: 1,
      projects: [nextEntry]
    })
      ? "unchanged"
      : "updated";

  deduplicatedEntries.set(normalizedTargetRoot, nextEntry);

  const nextRegistry: ProjectRegistry = {
    version: 1,
    projects: Array.from(deduplicatedEntries.values()).sort((left, right) =>
      left.root_path.localeCompare(right.root_path)
    )
  };

  if (action === "unchanged") {
    return {
      action,
      registryPath
    };
  }

  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, buildRegistryJson(nextRegistry), "utf8");

  return {
    action,
    registryPath
  };
}
