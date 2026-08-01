import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalJson, sha256Hex } from "./evidence-types";
import { AGENTS_BLOCK_END, AGENTS_BLOCK_START } from "./paths";
import { detectProductRepositoryIdentity } from "./product-repository-identity";
import { getProjectRegistryPath, loadProjectRegistry, removeRegistryProject } from "./registry";
import { openVerifiedTaskStateStore } from "./tasks";

export type ReconciliationState =
  | "prepared"
  | "applying"
  | "partial_failure"
  | "rollback_required"
  | "rolled_back"
  | "completed_receipt";

export interface ReconciliationItem {
  path: string;
  disposition: "quarantine_then_remove" | "preserve_as_runtime" | "remove" | "ambiguous_stop";
  content_hash: `sha256:${string}` | null;
}

export interface SelfInstallReconciliationV1 {
  schema_version: 1;
  record_kind: "self_install_reconciliation";
  journal_id: `sha256:${string}`;
  product_root: string;
  state: ReconciliationState;
  inventory_hash: `sha256:${string}`;
  task_state_hash: `sha256:${string}`;
  registry_hash: `sha256:${string}` | null;
  registry_snapshot: string | null;
  preserved_hashes: Record<string, `sha256:${string}` | null>;
  items: ReconciliationItem[];
  completed_steps: string[];
  created_at: string;
  updated_at: string;
  error: string | null;
}

const REMOVABLE = [
  ".harness/install.json",
  ".harness/installer-ownership.v1.json",
  ".harness/config.toml",
  ".harness/templates/managed"
] as const;
const PRESERVED = [
  ".harness/memory",
  ".harness/tasks",
  ".harness/runs",
  ".harness/self-install-reconciliation"
] as const;

function hashPath(targetPath: string): `sha256:${string}` | null {
  if (!fs.existsSync(targetPath)) return null;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return `sha256:${sha256Hex(fs.readFileSync(targetPath))}`;
  const values: Array<[string, string]> = [];
  const walk = (root: string): void => {
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(root, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) values.push([path.relative(targetPath, absolute).replace(/\\/g, "/"), sha256Hex(fs.readFileSync(absolute))]);
    }
  };
  walk(targetPath);
  return `sha256:${sha256Hex(canonicalJson(values))}`;
}

function journalPath(root: string, journalId: string): string {
  return path.join(root, ".harness", "self-install-reconciliation", `${journalId.slice("sha256:".length)}.json`);
}

function writeJournal(root: string, journal: SelfInstallReconciliationV1): void {
  const target = journalPath(root, journal.journal_id);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(journal, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  fs.renameSync(temporary, target);
}

export function prepareSelfInstallReconciliation(rootPath: string, dryRun = false): SelfInstallReconciliationV1 {
  const identity = detectProductRepositoryIdentity(rootPath);
  if (!identity.is_product_repository) throw new Error("reconciliation_requires_product_repository");
  const root = identity.root_path;
  const store = openVerifiedTaskStateStore(root);
  const taskStateHash = `sha256:${sha256Hex(canonicalJson(store.enumerate()))}` as const;
  const registry = loadProjectRegistry();
  const matchingRegistry = registry?.projects.filter((entry) => path.resolve(entry.root_path) === root) ?? [];
  if (matchingRegistry.length > 1) throw new Error("product_registry_ownership_ambiguous");
  const items: ReconciliationItem[] = [
    ...REMOVABLE.map((relativePath) => ({
      path: relativePath,
      disposition: "quarantine_then_remove" as const,
      content_hash: hashPath(path.join(root, relativePath))
    })),
    ...PRESERVED.map((relativePath) => ({
      path: relativePath,
      disposition: "preserve_as_runtime" as const,
      content_hash: hashPath(path.join(root, relativePath))
    })),
    {
      path: "AGENTS.md#managed-block",
      disposition: fs.existsSync(path.join(root, "AGENTS.md"))
        ? "quarantine_then_remove" as const
        : "preserve_as_runtime" as const,
      content_hash: hashPath(path.join(root, "AGENTS.md"))
    },
    {
      path: getProjectRegistryPath(),
      disposition: matchingRegistry.length === 1 ? "remove" as const : "preserve_as_runtime" as const,
      content_hash: hashPath(getProjectRegistryPath())
    }
  ];
  const inventoryHash = `sha256:${sha256Hex(canonicalJson(items))}` as const;
  const createdAt = new Date().toISOString();
  const identityBody = { product_root: root, inventory_hash: inventoryHash, task_state_hash: taskStateHash };
  const journal: SelfInstallReconciliationV1 = {
    schema_version: 1,
    record_kind: "self_install_reconciliation",
    journal_id: `sha256:${sha256Hex(canonicalJson(identityBody))}`,
    product_root: root,
    state: "prepared",
    inventory_hash: inventoryHash,
    task_state_hash: taskStateHash,
    registry_hash: hashPath(getProjectRegistryPath()),
    registry_snapshot: fs.existsSync(getProjectRegistryPath())
      ? fs.readFileSync(getProjectRegistryPath(), "utf8")
      : null,
    preserved_hashes: Object.fromEntries(PRESERVED.map((relativePath) => [
      relativePath,
      hashPath(path.join(root, relativePath))
    ])),
    items,
    completed_steps: [],
    created_at: createdAt,
    updated_at: createdAt,
    error: null
  };
  if (!dryRun) writeJournal(root, journal);
  return journal;
}

function stripManagedAgentsBlock(contents: string): string {
  const start = contents.indexOf(AGENTS_BLOCK_START);
  const end = contents.indexOf(AGENTS_BLOCK_END);
  if (start < 0 && end < 0) return contents;
  if (start < 0 || end < start || contents.indexOf(AGENTS_BLOCK_START, start + 1) >= 0
    || contents.indexOf(AGENTS_BLOCK_END, end + 1) >= 0) {
    throw new Error("managed_agents_block_ambiguous");
  }
  return `${contents.slice(0, start)}${contents.slice(end + AGENTS_BLOCK_END.length)}`.replace(/\n{3,}/gu, "\n\n");
}

export function applySelfInstallReconciliation(
  journal: SelfInstallReconciliationV1
): SelfInstallReconciliationV1 {
  if (journal.state === "completed_receipt") return journal;
  if (journal.state !== "prepared" && journal.state !== "partial_failure") {
    throw new Error(`reconciliation_invalid_state:${journal.state}`);
  }
  const root = journal.product_root;
  const preservedBefore = new Map(PRESERVED.map((relativePath) => [relativePath, hashPath(path.join(root, relativePath))]));
  let next: SelfInstallReconciliationV1 = {
    ...journal,
    state: "applying",
    updated_at: new Date().toISOString(),
    error: null
  };
  writeJournal(root, next);
  try {
    const quarantineRoot = path.join(root, ".harness", "self-install-reconciliation", "quarantine", journal.journal_id.slice(7));
    for (const relativePath of REMOVABLE) {
      const source = path.join(root, relativePath);
      if (!fs.existsSync(source)) continue;
      const destination = path.join(quarantineRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
      if (hashPath(source) !== hashPath(destination)) throw new Error(`quarantine_readback_failed:${relativePath}`);
      fs.rmSync(source, { recursive: true, force: false });
      next.completed_steps.push(`removed:${relativePath}`);
      writeJournal(root, next);
    }
    const agentsPath = path.join(root, "AGENTS.md");
    if (fs.existsSync(agentsPath)) {
      const before = fs.readFileSync(agentsPath, "utf8");
      const after = stripManagedAgentsBlock(before);
      if (after !== before) {
        fs.writeFileSync(path.join(quarantineRoot, "AGENTS.md"), before, "utf8");
        fs.writeFileSync(agentsPath, after, "utf8");
        next.completed_steps.push("removed:AGENTS.md#managed-block");
      }
    }
    const registryPath = getProjectRegistryPath();
    if (fs.existsSync(registryPath)) {
      fs.mkdirSync(quarantineRoot, { recursive: true });
      fs.writeFileSync(path.join(quarantineRoot, "project-registry.json"), fs.readFileSync(registryPath));
    }
    removeRegistryProject(root);
    next.completed_steps.push("removed:registry");
    for (const [relativePath, expectedHash] of preservedBefore) {
      if (hashPath(path.join(root, relativePath)) !== expectedHash && relativePath !== ".harness/self-install-reconciliation") {
        throw new Error(`preserved_runtime_changed:${relativePath}`);
      }
    }
    if (`sha256:${sha256Hex(canonicalJson(openVerifiedTaskStateStore(root).enumerate()))}` !== journal.task_state_hash) {
      throw new Error("reconciliation_task_state_readback_failed");
    }
    for (const relativePath of REMOVABLE) {
      if (fs.existsSync(path.join(root, relativePath))) {
        throw new Error(`reconciliation_terminal_installed_path_present:${relativePath}`);
      }
    }
    const currentAgents = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf8") : "";
    if (currentAgents.includes(AGENTS_BLOCK_START) || currentAgents.includes(AGENTS_BLOCK_END)) {
      throw new Error("reconciliation_terminal_managed_agents_block_present");
    }
    const registryMatches = loadProjectRegistry()?.projects
      .filter((entry) => path.resolve(entry.root_path) === root) ?? [];
    if (registryMatches.length !== 0) throw new Error("reconciliation_terminal_registry_entry_present");
    next = { ...next, state: "completed_receipt", updated_at: new Date().toISOString(), error: null };
    writeJournal(root, next);
    return next;
  } catch (error) {
    next = {
      ...next,
      state: "partial_failure",
      updated_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
    writeJournal(root, next);
    throw error;
  }
}

export function readSelfInstallReconciliation(root: string, journalId: string): SelfInstallReconciliationV1 {
  return JSON.parse(fs.readFileSync(journalPath(root, journalId), "utf8")) as SelfInstallReconciliationV1;
}

export function rollbackSelfInstallReconciliation(
  journal: SelfInstallReconciliationV1
): SelfInstallReconciliationV1 {
  if (journal.state === "rolled_back") return journal;
  if (!["partial_failure", "rollback_required", "completed_receipt"].includes(journal.state)) {
    throw new Error(`reconciliation_rollback_invalid_state:${journal.state}`);
  }
  const root = journal.product_root;
  const quarantineRoot = path.join(
    root,
    ".harness",
    "self-install-reconciliation",
    "quarantine",
    journal.journal_id.slice(7)
  );
  let next: SelfInstallReconciliationV1 = {
    ...journal,
    state: "rollback_required",
    updated_at: new Date().toISOString()
  };
  writeJournal(root, next);
  try {
    for (const relativePath of [...REMOVABLE].reverse()) {
      const quarantined = path.join(quarantineRoot, relativePath);
      const destination = path.join(root, relativePath);
      if (!fs.existsSync(quarantined)) continue;
      if (fs.existsSync(destination)) {
        if (hashPath(destination) !== hashPath(quarantined)) {
          throw new Error(`reconciliation_rollback_drift:${relativePath}`);
        }
        continue;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(quarantined, destination, { recursive: true, errorOnExist: true });
      if (hashPath(destination) !== hashPath(quarantined)) {
        throw new Error(`reconciliation_rollback_readback_failed:${relativePath}`);
      }
    }
    const agentsBackup = path.join(quarantineRoot, "AGENTS.md");
    if (fs.existsSync(agentsBackup)) {
      const agentsPath = path.join(root, "AGENTS.md");
      const current = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf8") : "";
      if (current.includes(AGENTS_BLOCK_START) || current.includes(AGENTS_BLOCK_END)) {
        throw new Error("reconciliation_rollback_agents_drift");
      }
      fs.writeFileSync(agentsPath, fs.readFileSync(agentsBackup));
    }
    const registryPath = getProjectRegistryPath();
    if (journal.registry_snapshot !== null) {
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(registryPath, journal.registry_snapshot, "utf8");
      if (hashPath(registryPath) !== journal.registry_hash) {
        throw new Error("reconciliation_rollback_registry_readback_failed");
      }
    }
    for (const [relativePath, expectedHash] of Object.entries(journal.preserved_hashes)) {
      if (relativePath === ".harness/self-install-reconciliation") continue;
      if (hashPath(path.join(root, relativePath)) !== expectedHash) {
        throw new Error(`reconciliation_rollback_preserved_drift:${relativePath}`);
      }
    }
    next = {
      ...next,
      state: "rolled_back",
      updated_at: new Date().toISOString(),
      error: null,
      completed_steps: [...next.completed_steps, "rollback:completed"]
    };
    writeJournal(root, next);
    return next;
  } catch (error) {
    next = {
      ...next,
      state: "rollback_required",
      updated_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
    writeJournal(root, next);
    throw error;
  }
}
