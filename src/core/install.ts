import * as fs from "node:fs";
import * as path from "node:path";
import { detectGitRepository } from "./git";
import {
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  AGENTS_PATH,
  CONFIG_PATH,
  DEFAULT_WORKTREE_ROOT,
  HARNESS_DIR,
  INSTALL_JSON_PATH,
  TASKS_DIR,
  TEMPLATES_DIR,
  getManagedAgentsBlock
} from "./paths";

export interface InstallMetadata {
  harness_version: string;
  templates_version: string;
  installed_at: string;
  source: string;
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

function getProductRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

function getPackageVersion(): string {
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

function getBackupPath(filePath: string): string {
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

function readInstallMetadata(installJsonPath: string): InstallMetadata | undefined {
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

  return {
    harness_version: parsed.harness_version,
    templates_version: parsed.templates_version,
    installed_at: parsed.installed_at,
    source: parsed.source
  };
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

  if (currentContent === desiredContent) {
    return {
      relativePath,
      absolutePath,
      action: "unchanged"
    };
  }

  conflicts.push(`${relativePath} differs from the Phase 2 managed content.`);

  return {
    relativePath,
    absolutePath,
    action: "unchanged"
  };
}

function buildAgentsTargetContent(existingContent: string): { content: string; description: string } {
  const managedBlock = getManagedAgentsBlock();
  const hasStart = existingContent.includes(AGENTS_BLOCK_START);
  const hasEnd = existingContent.includes(AGENTS_BLOCK_END);

  if (hasStart !== hasEnd) {
    throw new Error("AGENTS.md contains only one codex-harness marker. Resolve it manually.");
  }

  if (hasStart && hasEnd) {
    const startIndex = existingContent.indexOf(AGENTS_BLOCK_START);
    const endIndex = existingContent.indexOf(AGENTS_BLOCK_END);

    if (endIndex < startIndex) {
      throw new Error("AGENTS.md codex-harness markers are out of order.");
    }

    const before = existingContent.slice(0, startIndex);
    const after = existingContent.slice(endIndex + AGENTS_BLOCK_END.length);
    const combined = `${before}${managedBlock}${after}`.replace(/\n{3,}/g, "\n\n");

    return {
      content: combined.endsWith("\n") ? combined : `${combined}\n`,
      description: "update managed block"
    };
  }

  const trimmed = existingContent.trimEnd();
  const separator = trimmed.length > 0 ? "\n\n" : "";

  return {
    content: `${trimmed}${separator}${managedBlock}\n`,
    description: "append managed block"
  };
}

function planAgentsFile(targetRoot: string, conflicts: string[]): AgentsPlan {
  const absolutePath = path.join(targetRoot, AGENTS_PATH);
  const managedBlock = `${getManagedAgentsBlock()}\n`;

  if (!fs.existsSync(absolutePath)) {
    return {
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "create",
      content: managedBlock,
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
  const next = buildAgentsTargetContent(currentContent);

  if (next.content === currentContent) {
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
  const installJsonPath = path.join(targetRoot, INSTALL_JSON_PATH);
  const existingMetadata = readInstallMetadata(installJsonPath);
  const metadata: InstallMetadata = {
    harness_version: version,
    templates_version: version,
    installed_at: existingMetadata?.installed_at ?? new Date().toISOString(),
    source: "codex-harness"
  };

  const conflicts: string[] = [];
  const directories = [
    ensureDirectoryPlan(targetRoot, HARNESS_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, TASKS_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, TEMPLATES_DIR, conflicts)
  ];
  const configFile = planManagedFile(targetRoot, CONFIG_PATH, buildConfigToml(version), conflicts);
  const installFile = planManagedFile(targetRoot, INSTALL_JSON_PATH, buildInstallJson(metadata), conflicts);
  const agentsFile = planAgentsFile(targetRoot, conflicts);

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
      conflicts
    };
  }

  if (!dryRun) {
    for (const directory of directories) {
      applyDirectoryPlan(directory);
    }

    applyFilePlan(configFile);
    applyFilePlan(installFile);
    applyAgentsPlan(agentsFile);
  }

  const created = [
    ...directories.filter((plan) => plan.action === "create").map((plan) => plan.relativePath),
    ...[configFile, installFile, agentsFile]
      .filter((plan) => plan.action === "create")
      .map((plan) => plan.relativePath)
  ];
  const updated = [agentsFile].filter((plan) => plan.action === "update").map((plan) => plan.relativePath);
  const unchanged = [
    ...directories.filter((plan) => plan.action === "unchanged").map((plan) => plan.relativePath),
    ...[configFile, installFile, agentsFile]
      .filter((plan) => plan.action === "unchanged")
      .map((plan) => plan.relativePath)
  ];
  const backups = agentsFile.backupPath ? [toRelativePath(targetRoot, agentsFile.backupPath)] : [];

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
    conflicts: []
  };
}
