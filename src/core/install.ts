import * as fs from "node:fs";
import * as path from "node:path";
import { upsertRegistryProject } from "./registry";
import { getGovernanceSeedFilePlans } from "./governance-scaffold";
import { getMemorySeedFilePlans } from "./memory-scaffold";
import {
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  AGENTS_PATH,
  CONFIG_PATH,
  DEFAULT_WORKTREE_ROOT,
  GOVERNANCE_DIR,
  GOVERNANCE_METRICS_DIR,
  GOVERNANCE_PROPOSALS_DIR,
  GOVERNANCE_REVIEWS_DIR,
  HARNESS_DIR,
  INSTALL_JSON_PATH,
  MANAGED_AGENTS_BLOCK_PATH,
  MANAGED_CONFIG_PATH,
  MANAGED_TEMPLATES_DIR,
  MEMORY_DECISIONS_DIR,
  MEMORY_DEBT_DIR,
  MEMORY_DIR,
  MEMORY_SUMMARIES_DIR,
  TASKS_DIR,
  TEMPLATES_DIR,
  getManagedAgentsBlock
} from "./paths";
import { detectGitRepository } from "./git";

export interface LastUpgradeMetadata {
  from_version: string;
  to_version: string;
  applied_at: string;
  changed_paths: string[];
  backup_paths: string[];
}

export interface InstallMetadata {
  harness_version: string;
  templates_version: string;
  installed_at: string;
  source: string;
  last_upgrade?: LastUpgradeMetadata;
}

export interface InstallResult {
  ok: boolean;
  dryRun: boolean;
  targetRoot: string;
  metadata: InstallMetadata;
  agentsAction: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  backups: string[];
  conflicts: string[];
  warnings: string[];
  registryAction: string;
}

export interface ManagedBaselineContents {
  agentsBlock: string;
  configToml: string;
}

interface FilePlan {
  relativePath: string;
  absolutePath: string;
  action: "create" | "update" | "unchanged";
  content?: string;
  backupPath?: string;
}

interface DirectoryPlan {
  relativePath: string;
  absolutePath: string;
  action: "create" | "unchanged";
}

interface AgentsPlan {
  relativePath: string;
  absolutePath: string;
  action: "create" | "update" | "unchanged";
  content?: string;
  backupPath?: string;
  description: string;
}

const BACKUP_SUFFIX = ".codex-harness.bak";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLastUpgradeMetadata(value: unknown): value is LastUpgradeMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<LastUpgradeMetadata>;
  return (
    typeof record.from_version === "string" &&
    typeof record.to_version === "string" &&
    typeof record.applied_at === "string" &&
    isStringArray(record.changed_paths) &&
    isStringArray(record.backup_paths)
  );
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trimEnd();
}

export function contentEquals(left: string, right: string): boolean {
  return normalizeContent(left) === normalizeContent(right);
}

export function getProductRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

export function getPackageVersion(): string {
  const packageJsonPath = path.join(getProductRoot(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    version?: string;
  };

  if (!packageJson.version) {
    throw new Error("package.json version is missing.");
  }

  return packageJson.version;
}

function toRelativePath(targetRoot: string, absolutePath: string): string {
  return path.relative(targetRoot, absolutePath) || ".";
}

export function getBackupPath(filePath: string): string {
  const initialPath = `${filePath}${BACKUP_SUFFIX}`;

  if (!fs.existsSync(initialPath)) {
    return initialPath;
  }

  let counter = 1;

  while (true) {
    const candidate = `${initialPath}.${counter}`;

    if (!fs.existsSync(candidate)) {
      return candidate;
    }

    counter += 1;
  }
}

export function readInstallMetadata(installJsonPath: string): InstallMetadata | undefined {
  if (!fs.existsSync(installJsonPath) || !fs.statSync(installJsonPath).isFile()) {
    return undefined;
  }

  const raw = fs.readFileSync(installJsonPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<InstallMetadata>;

  if (
    typeof parsed.harness_version !== "string" ||
    typeof parsed.templates_version !== "string" ||
    typeof parsed.installed_at !== "string" ||
    typeof parsed.source !== "string"
  ) {
    throw new Error("Existing .harness/install.json is missing required metadata fields.");
  }

  if (parsed.last_upgrade !== undefined && !isLastUpgradeMetadata(parsed.last_upgrade)) {
    throw new Error("Existing .harness/install.json has invalid last_upgrade metadata.");
  }

  return {
    harness_version: parsed.harness_version,
    templates_version: parsed.templates_version,
    installed_at: parsed.installed_at,
    source: parsed.source,
    ...(parsed.last_upgrade ? { last_upgrade: parsed.last_upgrade } : {})
  };
}

export function readInstallMetadataFromTarget(targetRoot: string): InstallMetadata | undefined {
  return readInstallMetadata(path.join(targetRoot, INSTALL_JSON_PATH));
}

function buildConfigToml(version: string): string {
  return [
    "[harness]",
    `version = "${version}"`,
    `templates_version = "${version}"`,
    "",
    "[project]",
    'name = ""',
    "",
    "[checks]",
    "commands = []",
    "",
    "[worktree]",
    `root = "${DEFAULT_WORKTREE_ROOT}"`,
    ""
  ].join("\n");
}

function buildInstallJson(metadata: InstallMetadata): string {
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

export function getManagedBaselineContents(version: string = getPackageVersion()): ManagedBaselineContents {
  return {
    agentsBlock: `${getManagedAgentsBlock()}\n`,
    configToml: buildConfigToml(version)
  };
}

export function readManagedBaselineFile(targetRoot: string, relativePath: string): string | undefined {
  const absolutePath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return undefined;
  }

  return fs.readFileSync(absolutePath, "utf8");
}

export function readInstalledManagedBaselines(targetRoot: string): Partial<ManagedBaselineContents> {
  return {
    agentsBlock: readManagedBaselineFile(targetRoot, MANAGED_AGENTS_BLOCK_PATH),
    configToml: readManagedBaselineFile(targetRoot, MANAGED_CONFIG_PATH)
  };
}

function ensureDirectoryPlan(targetRoot: string, relativePath: string, conflicts: string[]): DirectoryPlan {
  const absolutePath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      relativePath,
      absolutePath,
      action: "create"
    };
  }

  if (!fs.statSync(absolutePath).isDirectory()) {
    conflicts.push(`${relativePath} exists but is not a directory.`);
  }

  return {
    relativePath,
    absolutePath,
    action: "unchanged"
  };
}

function planManagedFile(
  targetRoot: string,
  relativePath: string,
  desiredContent: string,
  conflicts: string[]
): FilePlan {
  const absolutePath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      relativePath,
      absolutePath,
      action: "create",
      content: desiredContent
    };
  }

  if (!fs.statSync(absolutePath).isFile()) {
    conflicts.push(`${relativePath} exists but is not a file.`);
    return {
      relativePath,
      absolutePath,
      action: "unchanged"
    };
  }

  const currentContent = fs.readFileSync(absolutePath, "utf8");

  if (contentEquals(currentContent, desiredContent)) {
    return {
      relativePath,
      absolutePath,
      action: "unchanged"
    };
  }

  conflicts.push(`${relativePath} differs from the managed install content.`);

  return {
    relativePath,
    absolutePath,
    action: "unchanged"
  };
}

function planSeedFile(targetRoot: string, relativePath: string, desiredContent: string, conflicts: string[]): FilePlan {
  const absolutePath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      relativePath,
      absolutePath,
      action: "create",
      content: desiredContent
    };
  }

  if (!fs.statSync(absolutePath).isFile()) {
    conflicts.push(`${relativePath} exists but is not a file.`);
  }

  return {
    relativePath,
    absolutePath,
    action: "unchanged"
  };
}

export function extractManagedAgentsBlock(existingContent: string): string | undefined {
  const hasStart = existingContent.includes(AGENTS_BLOCK_START);
  const hasEnd = existingContent.includes(AGENTS_BLOCK_END);

  if (hasStart !== hasEnd) {
    throw new Error("AGENTS.md contains only one codex-harness marker. Resolve it manually.");
  }

  if (!hasStart || !hasEnd) {
    return undefined;
  }

  const startIndex = existingContent.indexOf(AGENTS_BLOCK_START);
  const endIndex = existingContent.indexOf(AGENTS_BLOCK_END);

  if (endIndex < startIndex) {
    throw new Error("AGENTS.md codex-harness markers are out of order.");
  }

  return existingContent.slice(startIndex, endIndex + AGENTS_BLOCK_END.length);
}

export function renderAgentsFileContent(existingContent: string, desiredBlock: string): {
  content: string;
  description: string;
} {
  const currentBlock = extractManagedAgentsBlock(existingContent);

  if (currentBlock !== undefined) {
    const startIndex = existingContent.indexOf(AGENTS_BLOCK_START);
    const endIndex = existingContent.indexOf(AGENTS_BLOCK_END);
    const before = existingContent.slice(0, startIndex);
    const after = existingContent.slice(endIndex + AGENTS_BLOCK_END.length);
    const combined = `${before}${normalizeContent(desiredBlock)}${after}`.replace(/\n{3,}/g, "\n\n");

    return {
      content: combined.endsWith("\n") ? combined : `${combined}\n`,
      description: "update managed block"
    };
  }

  const trimmed = existingContent.trimEnd();
  const separator = trimmed.length > 0 ? "\n\n" : "";

  return {
    content: `${trimmed}${separator}${normalizeContent(desiredBlock)}\n`,
    description: "append managed block"
  };
}

function planAgentsFile(targetRoot: string, conflicts: string[], desiredBlock: string): AgentsPlan {
  const absolutePath = path.join(targetRoot, AGENTS_PATH);

  if (!fs.existsSync(absolutePath)) {
    return {
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "create",
      content: normalizeContent(desiredBlock) + "\n",
      description: "create managed file"
    };
  }

  if (!fs.statSync(absolutePath).isFile()) {
    conflicts.push("AGENTS.md exists but is not a file.");
    return {
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "unchanged",
      description: "conflict"
    };
  }

  const currentContent = fs.readFileSync(absolutePath, "utf8");
  const next = renderAgentsFileContent(currentContent, desiredBlock);

  if (contentEquals(next.content, currentContent)) {
    return {
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "unchanged",
      description: "already up to date"
    };
  }

  return {
    relativePath: AGENTS_PATH,
    absolutePath,
    action: "update",
    content: next.content,
    backupPath: getBackupPath(absolutePath),
    description: next.description
  };
}

function applyDirectoryPlan(plan: DirectoryPlan): void {
  if (plan.action === "create") {
    fs.mkdirSync(plan.absolutePath, { recursive: true });
  }
}

function applyFilePlan(plan: FilePlan): void {
  if (plan.action === "update" && plan.backupPath) {
    fs.copyFileSync(plan.absolutePath, plan.backupPath);
  }

  if (plan.action === "create" || plan.action === "update") {
    if (plan.content === undefined) {
      throw new Error(`Missing content for ${plan.relativePath}.`);
    }

    fs.mkdirSync(path.dirname(plan.absolutePath), { recursive: true });
    fs.writeFileSync(plan.absolutePath, plan.content, "utf8");
  }
}

function applyAgentsPlan(plan: AgentsPlan): void {
  if (plan.action === "unchanged") {
    return;
  }

  if (plan.content === undefined) {
    throw new Error("Missing AGENTS.md content.");
  }

  if (plan.action === "update" && plan.backupPath) {
    fs.copyFileSync(plan.absolutePath, plan.backupPath);
  }

  fs.writeFileSync(plan.absolutePath, plan.content, "utf8");
}

export function detectInstalledLayer(targetRoot: string): boolean {
  const configPath = path.join(targetRoot, CONFIG_PATH);
  const installJsonPath = path.join(targetRoot, INSTALL_JSON_PATH);

  return fs.existsSync(configPath) && fs.existsSync(installJsonPath);
}

function buildInstallMetadata(version: string, existingMetadata?: InstallMetadata): InstallMetadata {
  return {
    harness_version: version,
    templates_version: version,
    installed_at: existingMetadata?.installed_at ?? new Date().toISOString(),
    source: existingMetadata?.source ?? "codex-harness",
    ...(existingMetadata?.last_upgrade ? { last_upgrade: existingMetadata.last_upgrade } : {})
  };
}

export function installHarness(cwd: string, dryRun: boolean): InstallResult {
  const gitStatus = detectGitRepository(cwd);

  if (!gitStatus.available) {
    throw new Error(`git is unavailable: ${gitStatus.error ?? "unknown error"}`);
  }

  if (!gitStatus.insideWorkTree || !gitStatus.rootPath) {
    throw new Error("Install must run inside a git repository.");
  }

  const targetRoot = gitStatus.rootPath;
  const version = getPackageVersion();
  const existingMetadata = readInstallMetadataFromTarget(targetRoot);
  const metadata = buildInstallMetadata(version, existingMetadata);
  const managedContent = getManagedBaselineContents(version);

  const conflicts: string[] = [];
  const warnings: string[] = [];
  const directories = [
    ensureDirectoryPlan(targetRoot, HARNESS_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, TASKS_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, TEMPLATES_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, MANAGED_TEMPLATES_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, MEMORY_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, MEMORY_DECISIONS_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, MEMORY_DEBT_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, MEMORY_SUMMARIES_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, GOVERNANCE_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, GOVERNANCE_REVIEWS_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, GOVERNANCE_PROPOSALS_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, GOVERNANCE_METRICS_DIR, conflicts)
  ];
  const configFile = planManagedFile(targetRoot, CONFIG_PATH, managedContent.configToml, conflicts);
  const installFile = planManagedFile(targetRoot, INSTALL_JSON_PATH, buildInstallJson(metadata), conflicts);
  const managedAgentsBaseline = planManagedFile(
    targetRoot,
    MANAGED_AGENTS_BLOCK_PATH,
    managedContent.agentsBlock,
    conflicts
  );
  const managedConfigBaseline = planManagedFile(
    targetRoot,
    MANAGED_CONFIG_PATH,
    managedContent.configToml,
    conflicts
  );
  const memorySeedFiles = getMemorySeedFilePlans(targetRoot).map((seedFile) =>
    planSeedFile(targetRoot, seedFile.relativePath, seedFile.content, conflicts)
  );
  const governanceSeedFiles = getGovernanceSeedFilePlans(targetRoot).map((seedFile) =>
    planSeedFile(targetRoot, seedFile.relativePath, seedFile.content, conflicts)
  );
  const agentsFile = planAgentsFile(targetRoot, conflicts, managedContent.agentsBlock);

  if (conflicts.length > 0) {
    return {
      ok: false,
      dryRun,
      targetRoot,
      metadata,
      agentsAction: agentsFile.description,
      created: [],
      updated: [],
      unchanged: [],
      backups: [],
      conflicts,
      warnings,
      registryAction: "not-run"
    };
  }

  let registryAction = "dry-run";

  if (!dryRun) {
    for (const directory of directories) {
      applyDirectoryPlan(directory);
    }

    for (const filePlan of [configFile, installFile, managedAgentsBaseline, managedConfigBaseline]) {
      applyFilePlan(filePlan);
    }

    for (const seedFile of memorySeedFiles) {
      applyFilePlan(seedFile);
    }

    for (const seedFile of governanceSeedFiles) {
      applyFilePlan(seedFile);
    }

    applyAgentsPlan(agentsFile);

    const registryResult = upsertRegistryProject(targetRoot, metadata);
    registryAction = registryResult.action;

    if (registryResult.warning) {
      warnings.push(registryResult.warning);
    }
  }

  const managedFiles = [configFile, installFile, managedAgentsBaseline, managedConfigBaseline];
  const created = [
    ...directories.filter((plan) => plan.action === "create").map((plan) => plan.relativePath),
    ...[...managedFiles, ...memorySeedFiles, ...governanceSeedFiles, agentsFile]
      .filter((plan) => plan.action === "create")
      .map((plan) => plan.relativePath)
  ];
  const updated = [agentsFile]
    .filter((plan) => plan.action === "update")
    .map((plan) => plan.relativePath);
  const unchanged = [
    ...directories.filter((plan) => plan.action === "unchanged").map((plan) => plan.relativePath),
    ...[...managedFiles, ...memorySeedFiles, ...governanceSeedFiles, agentsFile]
      .filter((plan) => plan.action === "unchanged")
      .map((plan) => plan.relativePath)
  ];
  const backups = [agentsFile]
    .filter((plan) => plan.backupPath)
    .map((plan) => toRelativePath(targetRoot, plan.backupPath as string));

  return {
    ok: true,
    dryRun,
    targetRoot,
    metadata,
    agentsAction: agentsFile.description,
    created,
    updated,
    unchanged,
    backups,
    conflicts: [],
    warnings,
    registryAction
  };
}
