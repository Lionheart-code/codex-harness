import * as fs from "node:fs";
import * as path from "node:path";
import { getGovernanceSeedFilePlans } from "./governance-scaffold";
import {
  contentEquals,
  detectInstalledLayer,
  extractManagedAgentsBlock,
  getBackupPath,
  getManagedBaselineContents,
  getPackageVersion,
  type InstallMetadata,
  type LastUpgradeMetadata,
  readInstallMetadataFromTarget,
  readInstalledManagedBaselines,
  renderAgentsFileContent
} from "./install";
import { getMemorySeedFilePlans } from "./memory-scaffold";
import {
  AGENTS_PATH,
  CONFIG_PATH,
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
  TEMPLATES_DIR
} from "./paths";
import { upsertRegistryProject } from "./registry";
import { detectGitRepository } from "./git";

type UpgradeAction = "create" | "update" | "unchanged" | "blocked";

interface UpgradePlanBase {
  relativePath: string;
  absolutePath: string;
  action: UpgradeAction;
  reason: string;
}

interface UpgradeDirectoryPlan extends UpgradePlanBase {
  kind: "directory";
}

interface UpgradeFilePlan extends UpgradePlanBase {
  kind: "file";
  content?: string;
  backupPath?: string;
}

export interface UpgradeResult {
  ok: boolean;
  dryRun: boolean;
  targetRoot: string;
  metadata: InstallMetadata;
  created: string[];
  updated: string[];
  unchanged: string[];
  blocked: string[];
  backups: string[];
  warnings: string[];
  registryAction: string;
}

function buildInstallJson(metadata: InstallMetadata): string {
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

function ensureCreateIfMissingDirectory(targetRoot: string, relativePath: string): UpgradeDirectoryPlan {
  const absolutePath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      kind: "directory",
      relativePath,
      absolutePath,
      action: "create",
      reason: "missing install scaffold directory"
    };
  }

  if (!fs.statSync(absolutePath).isDirectory()) {
    return {
      kind: "directory",
      relativePath,
      absolutePath,
      action: "blocked",
      reason: "path exists but is not a directory"
    };
  }

  return {
    kind: "directory",
    relativePath,
    absolutePath,
    action: "unchanged",
    reason: "directory present"
  };
}

function ensureSeedFile(targetRoot: string, relativePath: string, content: string): UpgradeFilePlan {
  const absolutePath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      kind: "file",
      relativePath,
      absolutePath,
      action: "create",
      content,
      reason: "missing install seed file"
    };
  }

  if (!fs.statSync(absolutePath).isFile()) {
    return {
      kind: "file",
      relativePath,
      absolutePath,
      action: "blocked",
      reason: "path exists but is not a file"
    };
  }

  return {
    kind: "file",
    relativePath,
    absolutePath,
    action: "unchanged",
    reason: "runtime file preserved"
  };
}

function planManagedBaselineFile(targetRoot: string, relativePath: string, desiredContent: string): UpgradeFilePlan {
  const absolutePath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      kind: "file",
      relativePath,
      absolutePath,
      action: "create",
      content: desiredContent,
      reason: "missing managed baseline"
    };
  }

  if (!fs.statSync(absolutePath).isFile()) {
    return {
      kind: "file",
      relativePath,
      absolutePath,
      action: "blocked",
      reason: "managed baseline path exists but is not a file"
    };
  }

  const currentContent = fs.readFileSync(absolutePath, "utf8");

  if (contentEquals(currentContent, desiredContent)) {
    return {
      kind: "file",
      relativePath,
      absolutePath,
      action: "unchanged",
      reason: "managed baseline already current"
    };
  }

  return {
    kind: "file",
    relativePath,
    absolutePath,
    action: "update",
    content: desiredContent,
    backupPath: getBackupPath(absolutePath),
    reason: "refresh managed baseline"
  };
}

function planConfigUpgrade(
  targetRoot: string,
  desiredContent: string,
  baselineContent: string | undefined
): UpgradeFilePlan {
  const absolutePath = path.join(targetRoot, CONFIG_PATH);

  if (!fs.existsSync(absolutePath)) {
    return {
      kind: "file",
      relativePath: CONFIG_PATH,
      absolutePath,
      action: "create",
      content: desiredContent,
      reason: "missing managed config"
    };
  }

  if (!fs.statSync(absolutePath).isFile()) {
    return {
      kind: "file",
      relativePath: CONFIG_PATH,
      absolutePath,
      action: "blocked",
      reason: "config path exists but is not a file"
    };
  }

  const currentContent = fs.readFileSync(absolutePath, "utf8");

  if (contentEquals(currentContent, desiredContent)) {
    return {
      kind: "file",
      relativePath: CONFIG_PATH,
      absolutePath,
      action: "unchanged",
      reason: "config already matches current harness baseline"
    };
  }

  if (baselineContent === undefined) {
    return {
      kind: "file",
      relativePath: CONFIG_PATH,
      absolutePath,
      action: "blocked",
      reason: "config differs and no prior managed baseline snapshot exists"
    };
  }

  if (!contentEquals(currentContent, baselineContent)) {
    return {
      kind: "file",
      relativePath: CONFIG_PATH,
      absolutePath,
      action: "blocked",
      reason: "config contains local modifications outside the managed baseline"
    };
  }

  return {
    kind: "file",
    relativePath: CONFIG_PATH,
    absolutePath,
    action: "update",
    content: desiredContent,
    backupPath: getBackupPath(absolutePath),
    reason: "update managed config"
  };
}

function planAgentsUpgrade(
  targetRoot: string,
  desiredBlock: string,
  baselineBlock: string | undefined
): UpgradeFilePlan {
  const absolutePath = path.join(targetRoot, AGENTS_PATH);

  if (!fs.existsSync(absolutePath)) {
    return {
      kind: "file",
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "create",
      content: desiredBlock,
      reason: "missing AGENTS.md managed block"
    };
  }

  if (!fs.statSync(absolutePath).isFile()) {
    return {
      kind: "file",
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "blocked",
      reason: "AGENTS.md exists but is not a file"
    };
  }

  const currentContent = fs.readFileSync(absolutePath, "utf8");
  let currentBlock: string | undefined;

  try {
    currentBlock = extractManagedAgentsBlock(currentContent);
  } catch (agentsError) {
    const message = agentsError instanceof Error ? agentsError.message : String(agentsError);
    return {
      kind: "file",
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "blocked",
      reason: message
    };
  }

  if (currentBlock === undefined) {
    return {
      kind: "file",
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "blocked",
      reason: "AGENTS.md is missing the codex-harness managed block"
    };
  }

  if (contentEquals(currentBlock, desiredBlock)) {
    return {
      kind: "file",
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "unchanged",
      reason: "managed block already matches current harness baseline"
    };
  }

  if (baselineBlock === undefined) {
    return {
      kind: "file",
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "blocked",
      reason: "AGENTS.md differs and no prior managed baseline snapshot exists"
    };
  }

  if (!contentEquals(currentBlock, baselineBlock)) {
    return {
      kind: "file",
      relativePath: AGENTS_PATH,
      absolutePath,
      action: "blocked",
      reason: "AGENTS.md managed block contains local modifications"
    };
  }

  const next = renderAgentsFileContent(currentContent, desiredBlock);

  return {
    kind: "file",
    relativePath: AGENTS_PATH,
    absolutePath,
    action: "update",
    content: next.content,
    backupPath: getBackupPath(absolutePath),
    reason: "update AGENTS.md managed block"
  };
}

function buildLastUpgradeMetadata(
  existingMetadata: InstallMetadata,
  version: string,
  appliedAt: string,
  changedPaths: string[],
  backupPaths: string[]
): LastUpgradeMetadata {
  return {
    from_version: existingMetadata.harness_version,
    to_version: version,
    applied_at: appliedAt,
    changed_paths: [...changedPaths].sort((left, right) => left.localeCompare(right)),
    backup_paths: [...backupPaths].sort((left, right) => left.localeCompare(right))
  };
}

function planInstallMetadataUpdate(
  targetRoot: string,
  existingMetadata: InstallMetadata,
  version: string,
  appliedAt: string,
  changedPaths: string[],
  backupPaths: string[]
): UpgradeFilePlan {
  const absolutePath = path.join(targetRoot, INSTALL_JSON_PATH);
  const currentContent = fs.readFileSync(absolutePath, "utf8");
  const backupPath = getBackupPath(absolutePath);
  const nextMetadata: InstallMetadata = {
    harness_version: version,
    templates_version: version,
    installed_at: existingMetadata.installed_at,
    source: existingMetadata.source,
    last_upgrade: buildLastUpgradeMetadata(
      existingMetadata,
      version,
      appliedAt,
      [...changedPaths, INSTALL_JSON_PATH],
      [...backupPaths, path.relative(targetRoot, backupPath) || INSTALL_JSON_PATH]
    )
  };
  const desiredContent = buildInstallJson(nextMetadata);

  if (contentEquals(currentContent, desiredContent)) {
    return {
      kind: "file",
      relativePath: INSTALL_JSON_PATH,
      absolutePath,
      action: "unchanged",
      reason: "install metadata already current"
    };
  }

  return {
    kind: "file",
    relativePath: INSTALL_JSON_PATH,
    absolutePath,
    action: "update",
    content: desiredContent,
    backupPath,
    reason: "record upgraded install metadata"
  };
}

function applyDirectoryPlan(plan: UpgradeDirectoryPlan): void {
  if (plan.action === "create") {
    fs.mkdirSync(plan.absolutePath, { recursive: true });
  }
}

function applyFilePlan(plan: UpgradeFilePlan): void {
  if (plan.action !== "create" && plan.action !== "update") {
    return;
  }

  if (plan.content === undefined) {
    throw new Error(`Missing content for ${plan.relativePath}.`);
  }

  if (plan.action === "update" && plan.backupPath) {
    fs.copyFileSync(plan.absolutePath, plan.backupPath);
  }

  fs.mkdirSync(path.dirname(plan.absolutePath), { recursive: true });
  fs.writeFileSync(plan.absolutePath, plan.content, "utf8");
}

function buildResultLists(
  targetRoot: string,
  directoryPlans: UpgradeDirectoryPlan[],
  filePlans: UpgradeFilePlan[]
): Pick<UpgradeResult, "created" | "updated" | "unchanged" | "blocked" | "backups"> {
  const created = [
    ...directoryPlans.filter((plan) => plan.action === "create").map((plan) => plan.relativePath),
    ...filePlans.filter((plan) => plan.action === "create").map((plan) => plan.relativePath)
  ];
  const updated = filePlans.filter((plan) => plan.action === "update").map((plan) => plan.relativePath);
  const unchanged = [
    ...directoryPlans.filter((plan) => plan.action === "unchanged").map((plan) => plan.relativePath),
    ...filePlans.filter((plan) => plan.action === "unchanged").map((plan) => plan.relativePath)
  ];
  const blocked = [
    ...directoryPlans
      .filter((plan) => plan.action === "blocked")
      .map((plan) => `${plan.relativePath}: ${plan.reason}`),
    ...filePlans
      .filter((plan) => plan.action === "blocked")
      .map((plan) => `${plan.relativePath}: ${plan.reason}`)
  ];
  const backups = filePlans
    .filter((plan) => plan.backupPath && plan.action === "update")
    .map((plan) => path.relative(targetRoot, plan.backupPath as string) || plan.relativePath);

  return {
    created,
    updated,
    unchanged,
    blocked,
    backups
  };
}

export function upgradeHarness(cwd: string, dryRun: boolean): UpgradeResult {
  const gitStatus = detectGitRepository(cwd);

  if (!gitStatus.available) {
    throw new Error(`git is unavailable: ${gitStatus.error ?? "unknown error"}`);
  }

  if (!gitStatus.insideWorkTree || !gitStatus.rootPath) {
    throw new Error("Upgrade must run inside a git repository.");
  }

  const targetRoot = gitStatus.rootPath;

  if (!detectInstalledLayer(targetRoot)) {
    throw new Error("Installed harness layer not found. Run `node bin/ch install` first.");
  }

  const existingMetadata = readInstallMetadataFromTarget(targetRoot);

  if (!existingMetadata) {
    throw new Error("Existing .harness/install.json is missing required metadata fields.");
  }

  const version = getPackageVersion();
  const desiredManagedContent = getManagedBaselineContents(version);
  const currentBaselines = readInstalledManagedBaselines(targetRoot);
  const appliedAt = new Date().toISOString();

  const directoryPlans: UpgradeDirectoryPlan[] = [
    ensureCreateIfMissingDirectory(targetRoot, HARNESS_DIR),
    ensureCreateIfMissingDirectory(targetRoot, TASKS_DIR),
    ensureCreateIfMissingDirectory(targetRoot, TEMPLATES_DIR),
    ensureCreateIfMissingDirectory(targetRoot, MANAGED_TEMPLATES_DIR),
    ensureCreateIfMissingDirectory(targetRoot, MEMORY_DIR),
    ensureCreateIfMissingDirectory(targetRoot, MEMORY_DECISIONS_DIR),
    ensureCreateIfMissingDirectory(targetRoot, MEMORY_DEBT_DIR),
    ensureCreateIfMissingDirectory(targetRoot, MEMORY_SUMMARIES_DIR),
    ensureCreateIfMissingDirectory(targetRoot, GOVERNANCE_DIR),
    ensureCreateIfMissingDirectory(targetRoot, GOVERNANCE_REVIEWS_DIR),
    ensureCreateIfMissingDirectory(targetRoot, GOVERNANCE_PROPOSALS_DIR),
    ensureCreateIfMissingDirectory(targetRoot, GOVERNANCE_METRICS_DIR)
  ];

  const filePlans: UpgradeFilePlan[] = [
    planConfigUpgrade(targetRoot, desiredManagedContent.configToml, currentBaselines.configToml),
    planAgentsUpgrade(targetRoot, desiredManagedContent.agentsBlock, currentBaselines.agentsBlock),
    planManagedBaselineFile(targetRoot, MANAGED_AGENTS_BLOCK_PATH, desiredManagedContent.agentsBlock),
    planManagedBaselineFile(targetRoot, MANAGED_CONFIG_PATH, desiredManagedContent.configToml),
    ...getMemorySeedFilePlans(targetRoot).map((seedFile) =>
      ensureSeedFile(targetRoot, seedFile.relativePath, seedFile.content)
    ),
    ...getGovernanceSeedFilePlans(targetRoot).map((seedFile) =>
      ensureSeedFile(targetRoot, seedFile.relativePath, seedFile.content)
    )
  ];

  const blockedPlansExist =
    directoryPlans.some((plan) => plan.action === "blocked") || filePlans.some((plan) => plan.action === "blocked");

  if (!blockedPlansExist) {
    const changedPaths = [
      ...directoryPlans.filter((plan) => plan.action === "create").map((plan) => plan.relativePath),
      ...filePlans
        .filter((plan) => plan.action === "create" || plan.action === "update")
        .map((plan) => plan.relativePath)
    ];
    const backupPaths = filePlans
      .filter((plan) => plan.action === "update" && plan.backupPath)
      .map((plan) => path.relative(targetRoot, plan.backupPath as string) || plan.relativePath);
    const needsInstallMetadataUpdate =
      changedPaths.length > 0 ||
      existingMetadata.harness_version !== version ||
      existingMetadata.templates_version !== version;

    if (needsInstallMetadataUpdate) {
      filePlans.push(
        planInstallMetadataUpdate(targetRoot, existingMetadata, version, appliedAt, changedPaths, backupPaths)
      );
    } else {
      filePlans.push({
        kind: "file",
        relativePath: INSTALL_JSON_PATH,
        absolutePath: path.join(targetRoot, INSTALL_JSON_PATH),
        action: "unchanged",
        reason: "install metadata already current"
      });
    }
  }

  const metadataPlan = filePlans.find((plan) => plan.relativePath === INSTALL_JSON_PATH);
  const resultLists = buildResultLists(targetRoot, directoryPlans, filePlans);
  const metadata =
    metadataPlan && metadataPlan.content
      ? (JSON.parse(metadataPlan.content) as InstallMetadata)
      : existingMetadata;
  const warnings: string[] = [];

  if (resultLists.blocked.length > 0) {
    return {
      ok: false,
      dryRun,
      targetRoot,
      metadata,
      ...resultLists,
      warnings,
      registryAction: "not-run"
    };
  }

  let registryAction = "dry-run";

  if (!dryRun) {
    for (const directoryPlan of directoryPlans) {
      applyDirectoryPlan(directoryPlan);
    }

    for (const filePlan of filePlans) {
      applyFilePlan(filePlan);
    }

    const registryResult = upsertRegistryProject(targetRoot, metadata);
    registryAction = registryResult.action;

    if (registryResult.warning) {
      warnings.push(registryResult.warning);
    }
  }

  return {
    ok: true,
    dryRun,
    targetRoot,
    metadata,
    ...resultLists,
    warnings,
    registryAction
  };
}
