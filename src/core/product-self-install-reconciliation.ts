import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalJson, sha256Hex } from "./evidence-types";
import { detectInstalledLayer, getManagedBaselineContents, getSchemaSnapshotFilePlans } from "./install";
import { parseInstallerOwnershipManifest } from "./installer-ownership";
import { readInstallerOwnershipCatalog } from "./legacy-installer-ownership-catalog";
import { AGENTS_BLOCK_END, AGENTS_BLOCK_START } from "./paths";
import { detectProductRepositoryIdentity } from "./product-repository-identity";
import { getProjectRegistryPath, loadProjectRegistry, removeRegistryProject } from "./registry";
import { runGitCommand } from "./git";
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
  ownership_manifest_id: `sha256:${string}`;
  ownership_catalog_id: `sha256:${string}`;
  product_source_hash: `sha256:${string}`;
  unrelated_agents_hash: `sha256:${string}` | null;
  preserved_hashes: Record<string, `sha256:${string}` | null>;
  items: ReconciliationItem[];
  completed_steps: string[];
  created_at: string;
  updated_at: string;
  error: string | null;
}

const INSTALLER_CONTROL_PATHS = [
  ".harness/install.json",
  ".harness/installer-ownership.v1.json"
] as const;
const PRESERVED = [
  ".harness/memory",
  ".harness/tasks",
  ".harness/runs",
  ".harness/evidence",
  ".harness/artifacts",
  ".harness/governance",
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

function hashProductSource(root: string): `sha256:${string}` {
  const tracked = runGitCommand(root, ["ls-files", "-z"]);
  if (tracked.status !== 0) throw new Error("reconciliation_product_source_inventory_unavailable");
  const entries = tracked.stdout.split("\0").filter(Boolean)
    .filter((relativePath) => relativePath !== "AGENTS.md")
    .sort()
    .map((relativePath) => {
      const absolutePath = path.join(root, relativePath);
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        throw new Error(`reconciliation_product_source_missing:${relativePath}`);
      }
      return [relativePath, sha256Hex(fs.readFileSync(absolutePath))];
    });
  return `sha256:${sha256Hex(canonicalJson(entries))}`;
}

function installedControlAuthority(root: string): {
  manifestId: `sha256:${string}`;
  catalogId: `sha256:${string}`;
  removablePaths: string[];
  managedAgentsBlockHash: `sha256:${string}`;
} {
  const installPath = path.join(root, ".harness", "install.json");
  const manifestPath = path.join(root, ".harness", "installer-ownership.v1.json");
  if (!fs.existsSync(installPath) || !fs.existsSync(manifestPath)) {
    throw new Error("reconciliation_installer_authority_missing");
  }
  const install = JSON.parse(fs.readFileSync(installPath, "utf8")) as {
    harness_version?: unknown;
    ownership_manifest?: unknown;
  };
  const manifest = parseInstallerOwnershipManifest(fs.readFileSync(manifestPath, "utf8"));
  let manifestRoot: string;
  try {
    manifestRoot = fs.realpathSync.native(manifest.product_root);
  } catch {
    throw new Error("reconciliation_installer_authority_mismatch");
  }
  if (manifestRoot !== root
    || install.ownership_manifest !== manifest.manifest_id
    || typeof install.harness_version !== "string") {
    throw new Error("reconciliation_installer_authority_mismatch");
  }
  const expectedManaged = getManagedBaselineContents(install.harness_version);
  const expectedHashes = new Map([
    [".harness/config.toml", `sha256:${sha256Hex(expectedManaged.configToml)}`],
    [".harness/templates/managed/agents-block.md", `sha256:${sha256Hex(expectedManaged.agentsBlock)}`],
    [".harness/templates/managed/config.toml", `sha256:${sha256Hex(expectedManaged.configToml)}`]
  ]);
  for (const schema of getSchemaSnapshotFilePlans(root)) {
    expectedHashes.set(schema.relativePath.replace(/\\/gu, "/"), `sha256:${sha256Hex(schema.content)}`);
  }
  for (const entry of manifest.entries) {
    const expected = expectedHashes.get(entry.path.replace(/\\/gu, "/"));
    if (entry.owner !== "installer" || entry.disposition !== "quarantine"
      || !expected || expected !== entry.content_hash) {
      throw new Error(`reconciliation_installer_manifest_entry_unproven:${entry.path}`);
    }
  }
  const catalog = readInstallerOwnershipCatalog(path.join(root, "assets", "installer-ownership-catalog.v1.json"));
  const catalogMatches = catalog.manifest_entries.filter((candidate) =>
    manifest.entries.every((manifestEntry) => candidate.inventory.some((catalogEntry) =>
      canonicalJson(catalogEntry) === canonicalJson(manifestEntry))));
  if (catalogMatches.length !== 1) {
    throw new Error(`reconciliation_catalog_authority_cardinality_invalid:${catalogMatches.length}`);
  }
  const catalogEntry = catalogMatches[0];
  const runsRoot = path.join(root, ".harness", "runs");
  const authorityBindings = fs.existsSync(runsRoot)
    ? fs.readdirSync(runsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
        const runPath = path.join(runsRoot, entry.name, "run.json");
        if (!fs.existsSync(runPath)) return [];
        try {
          const run = JSON.parse(fs.readFileSync(runPath, "utf8")) as {
            approvals?: Array<{ status?: unknown; reviewed_plan_artifact_id?: unknown }>;
          };
          return run.approvals?.some((approval) => approval.status === "approved"
            && approval.reviewed_plan_artifact_id === catalogEntry.provenance.review_authority_ref)
            ? [entry.name] : [];
        } catch { throw new Error(`reconciliation_review_authority_run_invalid:${entry.name}`); }
      })
    : [];
  const sourceTree = runGitCommand(root, ["rev-parse", `${catalogEntry.provenance.source_id}^{tree}`]);
  const sourceFile = runGitCommand(root, [
    "show", `${catalogEntry.provenance.source_id}:${catalogEntry.provenance.manifest_path}`
  ]);
  const sourceIsAncestor = runGitCommand(root, ["merge-base", "--is-ancestor", catalogEntry.provenance.source_id, "HEAD"]);
  const liveCatalog = fs.readFileSync(path.join(root, "assets", "installer-ownership-catalog.v1.json"));
  const headCatalog = runGitCommand(root, ["show", "HEAD:assets/installer-ownership-catalog.v1.json"]);
  if (sourceTree.status !== 0 || sourceFile.status !== 0 || sourceIsAncestor.status !== 0
    || headCatalog.status !== 0 || !liveCatalog.equals(Buffer.from(headCatalog.stdout, "utf8"))
    || authorityBindings.length < 1
    || `sha256:${sha256Hex(sourceTree.stdout.trim())}` !== catalogEntry.provenance.source_content_hash
    || `sha256:${sha256Hex(sourceFile.stdout)}` !== catalogEntry.provenance.manifest_content_hash
    || !/^sha256:[a-f0-9]{64}$/u.test(catalogEntry.provenance.review_authority_ref)) {
    throw new Error("reconciliation_catalog_provenance_invalid");
  }
  const removableCandidates = [...new Set([
    ...INSTALLER_CONTROL_PATHS.filter((relativePath) => fs.existsSync(path.join(root, relativePath))),
    ...manifest.entries.map((entry) => entry.path.replace(/\\/gu, "/"))
  ])].sort();
  const removablePaths = removableCandidates;
  for (const [relativePath, expectedHash] of expectedHashes) {
    const absolutePath = path.join(root, relativePath);
    if (fs.existsSync(absolutePath) && hashPath(absolutePath) !== expectedHash) {
      throw new Error(`reconciliation_managed_content_drift:${relativePath}`);
    }
  }
  return {
    manifestId: manifest.manifest_id,
    catalogId: catalog.catalog_id,
    removablePaths,
    managedAgentsBlockHash: `sha256:${sha256Hex(expectedManaged.agentsBlock)}`
  };
}

function unrelatedAgentsHash(root: string): `sha256:${string}` | null {
  const agentsPath = path.join(root, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) return null;
  return `sha256:${sha256Hex(stripManagedAgentsBlock(fs.readFileSync(agentsPath, "utf8")))}`;
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
  const authority = installedControlAuthority(root);
  const agentsPath = path.join(root, "AGENTS.md");
  const managedAgentsBlock = fs.existsSync(agentsPath)
    ? extractManagedAgentsBlock(fs.readFileSync(agentsPath, "utf8")) : null;
  if (managedAgentsBlock !== null
    && `sha256:${sha256Hex(managedAgentsBlock)}` !== authority.managedAgentsBlockHash) {
    throw new Error("reconciliation_managed_agents_block_unproven");
  }
  const normalizedRemovable = new Set(authority.removablePaths);
  const unknownHarnessPaths: string[] = [];
  const walkHarness = (absoluteDirectory: string): void => {
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const absolute = path.join(absoluteDirectory, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/gu, "/");
      if (PRESERVED.some((preserved) => relative === preserved || relative.startsWith(`${preserved}/`))) continue;
      if (entry.isDirectory()) walkHarness(absolute);
      else if (entry.isFile() && !normalizedRemovable.has(relative)) unknownHarnessPaths.push(relative);
      else if (!entry.isFile() && !entry.isDirectory()) unknownHarnessPaths.push(relative);
    }
  };
  walkHarness(path.join(root, ".harness"));
  unknownHarnessPaths.sort();
  const backupPaths = fs.readdirSync(root)
    .filter((entry) => entry.startsWith("AGENTS.md.codex-harness.bak"))
    .sort();
  const items: ReconciliationItem[] = [
    ...authority.removablePaths.map((relativePath) => ({
      path: relativePath,
      disposition: "quarantine_then_remove" as const,
      content_hash: hashPath(path.join(root, relativePath))
    })),
    ...PRESERVED.map((relativePath) => ({
      path: relativePath,
      disposition: "preserve_as_runtime" as const,
      content_hash: hashPath(path.join(root, relativePath))
    })),
    ...backupPaths.map((relativePath) => ({
      path: relativePath,
      disposition: "preserve_as_runtime" as const,
      content_hash: hashPath(path.join(root, relativePath))
    })),
    ...unknownHarnessPaths.map((relativePath) => ({
      path: relativePath,
      disposition: "ambiguous_stop" as const,
      content_hash: hashPath(path.join(root, relativePath))
    })),
    {
      path: "AGENTS.md#managed-block",
      disposition: managedAgentsBlock !== null
        ? "quarantine_then_remove" as const
        : "preserve_as_runtime" as const,
      content_hash: managedAgentsBlock === null ? null : authority.managedAgentsBlockHash
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
    ownership_manifest_id: authority.manifestId,
    ownership_catalog_id: authority.catalogId,
    product_source_hash: hashProductSource(root),
    unrelated_agents_hash: unrelatedAgentsHash(root),
    preserved_hashes: Object.fromEntries([...PRESERVED, ...backupPaths].map((relativePath) => [
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
  const block = extractManagedAgentsBlock(contents);
  if (block === null) return contents;
  const start = contents.indexOf(AGENTS_BLOCK_START);
  return `${contents.slice(0, start)}${contents.slice(start + block.length)}`.replace(/\n{3,}/gu, "\n\n");
}

function extractManagedAgentsBlock(contents: string): string | null {
  const start = contents.indexOf(AGENTS_BLOCK_START);
  const end = contents.indexOf(AGENTS_BLOCK_END);
  if (start < 0 && end < 0) return null;
  if (start < 0 || end < start || contents.indexOf(AGENTS_BLOCK_START, start + 1) >= 0
    || contents.indexOf(AGENTS_BLOCK_END, end + 1) >= 0) {
    throw new Error("managed_agents_block_ambiguous");
  }
  let endExclusive = end + AGENTS_BLOCK_END.length;
  if (contents.slice(endExclusive, endExclusive + 2) === "\r\n") endExclusive += 2;
  else if (contents[endExclusive] === "\n") endExclusive += 1;
  return contents.slice(start, endExclusive);
}

function quarantineRootFor(journal: SelfInstallReconciliationV1): string {
  return path.join(
    journal.product_root,
    ".harness",
    "self-install-reconciliation",
    "quarantine",
    journal.journal_id.slice(7)
  );
}

function assertReconciliationPreflight(journal: SelfInstallReconciliationV1): void {
  const root = journal.product_root;
  const identity = detectProductRepositoryIdentity(root);
  if (!identity.is_product_repository || identity.root_path !== root) {
    throw new Error("reconciliation_product_identity_drift");
  }
  if (journal.inventory_hash !== `sha256:${sha256Hex(canonicalJson(journal.items))}`) {
    throw new Error("reconciliation_inventory_identity_mismatch");
  }
  if (journal.state === "prepared") {
    const authority = installedControlAuthority(root);
    if (authority.manifestId !== journal.ownership_manifest_id
      || authority.catalogId !== journal.ownership_catalog_id) {
      throw new Error("reconciliation_ownership_authority_drift");
    }
  }
  if (hashProductSource(root) !== journal.product_source_hash) {
    throw new Error("reconciliation_product_source_drift");
  }
  if (`sha256:${sha256Hex(canonicalJson(openVerifiedTaskStateStore(root).enumerate()))}` !== journal.task_state_hash) {
    throw new Error("reconciliation_task_state_drift");
  }
  if (journal.completed_steps.includes("removed:registry")) {
    const matches = loadProjectRegistry()?.projects
      .filter((entry) => path.resolve(entry.root_path) === root) ?? [];
    if (matches.length !== 0) throw new Error("reconciliation_registry_drift");
  } else if (hashPath(getProjectRegistryPath()) !== journal.registry_hash
    || (fs.existsSync(getProjectRegistryPath())
      ? fs.readFileSync(getProjectRegistryPath(), "utf8")
      : null) !== journal.registry_snapshot) {
    throw new Error("reconciliation_registry_drift");
  }
  for (const item of journal.items) {
    if (item.disposition === "ambiguous_stop") {
      throw new Error(`reconciliation_ambiguous_inventory:${item.path}`);
    }
    if (item.path === "AGENTS.md#managed-block") {
      const agentsPath = path.join(root, "AGENTS.md");
      const block = fs.existsSync(agentsPath) ? extractManagedAgentsBlock(fs.readFileSync(agentsPath, "utf8")) : null;
      const currentHash = block === null ? null : `sha256:${sha256Hex(block)}`;
      const completed = journal.completed_steps.includes("removed:AGENTS.md#managed-block");
      if (!completed && currentHash !== item.content_hash) {
        throw new Error("reconciliation_managed_agents_block_drift");
      }
      if (completed && currentHash !== null) {
        throw new Error("reconciliation_managed_agents_block_reappeared");
      }
      continue;
    }
    if (item.path === getProjectRegistryPath()) continue;
    if (item.path === ".harness/self-install-reconciliation") continue;
    const currentHash = hashPath(path.join(root, item.path));
    const completed = journal.completed_steps.includes(`removed:${item.path}`);
    if (completed && currentHash === null
      && hashPath(path.join(quarantineRootFor(journal), item.path)) === item.content_hash) {
      continue;
    }
    if (currentHash !== item.content_hash) {
      throw new Error(`reconciliation_inventory_drift:${item.path}`);
    }
  }
  if (unrelatedAgentsHash(root) !== journal.unrelated_agents_hash) {
    throw new Error("reconciliation_unrelated_agents_drift");
  }
}

export function applySelfInstallReconciliation(
  journal: SelfInstallReconciliationV1
): SelfInstallReconciliationV1 {
  if (journal.state === "completed_receipt") return journal;
  if (journal.state !== "prepared" && journal.state !== "partial_failure") {
    throw new Error(`reconciliation_invalid_state:${journal.state}`);
  }
  const root = journal.product_root;
  assertReconciliationPreflight(journal);
  const preservedBefore = new Map(Object.entries(journal.preserved_hashes));
  let next: SelfInstallReconciliationV1 = {
    ...journal,
    state: "applying",
    updated_at: new Date().toISOString(),
    error: null
  };
  writeJournal(root, next);
  try {
    const quarantineRoot = quarantineRootFor(journal);
    const removablePaths = journal.items
      .filter((item) => item.disposition === "quarantine_then_remove"
        && !item.path.includes("#"))
      .map((item) => item.path);
    for (const relativePath of removablePaths) {
      const source = path.join(root, relativePath);
      const destination = path.join(quarantineRoot, relativePath);
      if (!fs.existsSync(source)) {
        if (next.completed_steps.includes(`removed:${relativePath}`)
          && hashPath(destination) === journal.items.find((item) => item.path === relativePath)?.content_hash) {
          continue;
        }
        throw new Error(`reconciliation_removal_source_missing:${relativePath}`);
      }
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
    for (const relativePath of removablePaths) {
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
    if (detectInstalledLayer(root)) throw new Error("reconciliation_terminal_installed_classification_present");
    if (hashProductSource(root) !== journal.product_source_hash) {
      throw new Error("reconciliation_terminal_product_source_changed");
    }
    if (unrelatedAgentsHash(root) !== journal.unrelated_agents_hash) {
      throw new Error("reconciliation_terminal_unrelated_agents_changed");
    }
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
    const removablePaths = journal.items
      .filter((item) => item.disposition === "quarantine_then_remove"
        && !item.path.includes("#"))
      .map((item) => item.path);
    for (const relativePath of [...removablePaths].reverse()) {
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
