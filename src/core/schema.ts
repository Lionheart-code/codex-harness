import * as fs from "node:fs";
import * as path from "node:path";
import { listAdapterProfileIds, readAdapterProfile, readAdapterProfileSchemaMetadata } from "./agent-adapters";
import { readAgentRunRecord } from "./agent-ledger";
import { validateVerifierRecord } from "./checks";
import {
  buildGovernanceProposalRecord,
  getGovernanceProposalJsonPath,
  validateGovernanceProposalRecord,
  writeGovernanceProposalRecord
} from "./governance";
import { getBackupPath, readInstallMetadata } from "./install";
import { parseDebtItem, parseDecisionRecord } from "./memory";
import {
  CONFIG_PATH,
  DEBT_JSONL_PATH,
  GOVERNANCE_PROPOSALS_DIR,
  INSTALL_JSON_PATH,
  INSTALLED_SCHEMAS_DIR,
  MEMORY_DECISIONS_DIR,
  TASKS_DIR
} from "./paths";
import {
  LEGACY_TO_V1_MIGRATION_ID,
  PRODUCT_SCHEMA_FILE_NAMES,
  buildSchemaMetadata
} from "./schema-migrations";
import { parseTaskState, requireInstalledTargetRoot } from "./tasks";
import { validateReviewRecord } from "./review";

interface ValidationIssue {
  relativePath: string;
  message: string;
}

export interface SchemaValidationResult {
  targetRoot: string;
  checked: number;
  valid: number;
  legacy: ValidationIssue[];
  errors: ValidationIssue[];
}

type MigrationAction = "create" | "update" | "unchanged" | "blocked";

interface MigrationPlan {
  relativePath: string;
  absolutePath: string;
  action: MigrationAction;
  reason: string;
  content?: string;
  backupPath?: string;
}

export interface SchemaMigrationResult {
  ok: boolean;
  dryRun: boolean;
  targetRoot: string;
  migrationId: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  blocked: string[];
  backups: string[];
}

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function toRepoRelative(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

function readJsonValue(filePath: string, label: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (jsonError) {
    const message = jsonError instanceof Error ? jsonError.message : String(jsonError);
    throw new Error(`Invalid JSON in ${label}: ${message}`);
  }
}

function readJsonObject(filePath: string, label: string): Record<string, unknown> {
  const value = readJsonValue(filePath, label);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function buildValidationIssue(targetRoot: string, absolutePath: string, message: string): ValidationIssue {
  return {
    relativePath: toRepoRelative(targetRoot, absolutePath),
    message
  };
}

function classifySchemaStatus(
  targetRoot: string,
  absolutePath: string,
  schemaVersion: unknown,
  checked: { count: number },
  valid: { count: number },
  legacy: ValidationIssue[],
  errors: ValidationIssue[]
): void {
  checked.count += 1;

  if (schemaVersion === undefined) {
    legacy.push(
      buildValidationIssue(
        targetRoot,
        absolutePath,
        "legacy unversioned artifact; run `node bin/ch schema migrate --dry-run` and `node bin/ch schema migrate`."
      )
    );
    return;
  }

  valid.count += 1;
}

function collectTaskRoots(targetRoot: string): string[] {
  const tasksRoot = path.join(targetRoot, TASKS_DIR);

  if (!fs.existsSync(tasksRoot) || !fs.statSync(tasksRoot).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(tasksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(tasksRoot, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function validateSchemaSnapshotFiles(
  targetRoot: string,
  checked: { count: number },
  valid: { count: number },
  errors: ValidationIssue[]
): void {
  for (const fileName of PRODUCT_SCHEMA_FILE_NAMES) {
    const absolutePath = path.join(targetRoot, INSTALLED_SCHEMAS_DIR, fileName);
    checked.count += 1;

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      errors.push(
        buildValidationIssue(
          targetRoot,
          absolutePath,
          "installed schema snapshot is missing; run `node bin/ch upgrade --dry-run` and `node bin/ch upgrade`."
        )
      );
      continue;
    }

    try {
      readJsonObject(absolutePath, toRepoRelative(targetRoot, absolutePath));
      valid.count += 1;
    } catch (schemaError) {
      const message = schemaError instanceof Error ? schemaError.message : String(schemaError);
      errors.push(buildValidationIssue(targetRoot, absolutePath, message));
    }
  }
}

interface AdapterSectionRange {
  agentId: string;
  startIndex: number;
  endIndex: number;
  hasSchemaVersion: boolean;
  hasProducerCommand: boolean;
}

function collectAdapterSectionRanges(lines: string[]): AdapterSectionRange[] {
  const sections: Array<{ name: string; startIndex: number; endIndex: number }> = [];
  let currentName: string | undefined;
  let currentStartIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\[([^\]]+)\]$/.exec(lines[index].trim());
    if (!match) {
      continue;
    }

    if (currentName !== undefined) {
      sections.push({
        name: currentName,
        startIndex: currentStartIndex,
        endIndex: index
      });
    }

    currentName = match[1];
    currentStartIndex = index;
  }

  if (currentName !== undefined) {
    sections.push({
      name: currentName,
      startIndex: currentStartIndex,
      endIndex: lines.length
    });
  }

  return sections
    .filter((section) => section.name.startsWith("agents."))
    .map((section) => {
      let hasSchemaVersion = false;
      let hasProducerCommand = false;

      for (let index = section.startIndex + 1; index < section.endIndex; index += 1) {
        const trimmed = lines[index].trim();
        const keyValueMatch = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(trimmed);
        if (!keyValueMatch) {
          continue;
        }

        if (keyValueMatch[1] === "schema_version") {
          hasSchemaVersion = true;
        }

        if (keyValueMatch[1] === "producer_command") {
          hasProducerCommand = true;
        }
      }

      return {
        agentId: section.name.slice("agents.".length),
        startIndex: section.startIndex,
        endIndex: section.endIndex,
        hasSchemaVersion,
        hasProducerCommand
      };
    })
    .sort((left, right) => left.agentId.localeCompare(right.agentId));
}

function getLeadingWhitespace(value: string): string {
  const match = /^(\s*)/.exec(value);
  return match ? match[1] : "";
}

function planAdapterProfileConfigMigration(targetRoot: string): MigrationPlan | undefined {
  const absolutePath = path.join(targetRoot, CONFIG_PATH);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return undefined;
  }

  const originalContent = fs.readFileSync(absolutePath, "utf8");
  const newline = originalContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = originalContent.split(/\r?\n/);
  const sections = collectAdapterSectionRanges(lines);

  if (sections.length === 0) {
    return undefined;
  }

  const relativePath = toRepoRelative(targetRoot, absolutePath);
  const legacySections = sections.filter((section) => !section.hasSchemaVersion);

  for (const section of sections) {
    try {
      readAdapterProfile(targetRoot, section.agentId);
    } catch (profileError) {
      const message = profileError instanceof Error ? profileError.message : String(profileError);
      return buildMigrationPlan(targetRoot, relativePath, "blocked", message);
    }
  }

  if (legacySections.length === 0) {
    return buildMigrationPlan(targetRoot, relativePath, "unchanged", "adapter profiles already schema-versioned.");
  }

  const nextLines = [...lines];

  for (const section of [...legacySections].sort((left, right) => right.startIndex - left.startIndex)) {
    let insertAt = section.endIndex;
    let indent = "";

    for (let index = section.startIndex + 1; index < section.endIndex; index += 1) {
      const trimmed = nextLines[index].trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) {
        continue;
      }

      insertAt = index;
      indent = getLeadingWhitespace(nextLines[index]);
      break;
    }

    const insertedLines: string[] = [];
    if (!section.hasSchemaVersion) {
      insertedLines.push(`${indent}schema_version = 1`);
    }
    if (!section.hasProducerCommand) {
      insertedLines.push(`${indent}producer_command = "node bin/ch schema migrate"`);
    }

    if (insertedLines.length > 0) {
      nextLines.splice(insertAt, 0, ...insertedLines);
    }
  }

  return buildMigrationPlan(
    targetRoot,
    relativePath,
    "update",
    "add schema metadata to legacy adapter profiles",
    nextLines.join(newline)
  );
}

export function validateSchemas(cwd: string): SchemaValidationResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const checked = { count: 0 };
  const valid = { count: 0 };
  const legacy: ValidationIssue[] = [];
  const errors: ValidationIssue[] = [];
  const installPath = path.join(targetRoot, INSTALL_JSON_PATH);

  validateSchemaSnapshotFiles(targetRoot, checked, valid, errors);

  try {
    readInstallMetadata(installPath);
    const raw = readJsonObject(installPath, INSTALL_JSON_PATH);
    classifySchemaStatus(targetRoot, installPath, raw.schema_version, checked, valid, legacy, errors);
  } catch (installError) {
    const message = installError instanceof Error ? installError.message : String(installError);
    checked.count += 1;
    errors.push(buildValidationIssue(targetRoot, installPath, message));
  }

  for (const taskRoot of collectTaskRoots(targetRoot)) {
    const statePath = path.join(taskRoot, "state.json");
    if (fs.existsSync(statePath) && fs.statSync(statePath).isFile()) {
      try {
        parseTaskState(statePath);
        const raw = readJsonObject(statePath, toRepoRelative(targetRoot, statePath));
        classifySchemaStatus(targetRoot, statePath, raw.schema_version, checked, valid, legacy, errors);
      } catch (taskError) {
        const message = taskError instanceof Error ? taskError.message : String(taskError);
        checked.count += 1;
        errors.push(buildValidationIssue(targetRoot, statePath, message));
      }
    }

    const verifierPath = path.join(taskRoot, "verifier.json");
    if (fs.existsSync(verifierPath) && fs.statSync(verifierPath).isFile()) {
      try {
        const raw = readJsonObject(verifierPath, toRepoRelative(targetRoot, verifierPath));
        validateVerifierRecord(raw);
        classifySchemaStatus(targetRoot, verifierPath, raw.schema_version, checked, valid, legacy, errors);
      } catch (verifierError) {
        const message = verifierError instanceof Error ? verifierError.message : String(verifierError);
        checked.count += 1;
        errors.push(buildValidationIssue(targetRoot, verifierPath, message));
      }
    }

    const reviewPath = path.join(taskRoot, "review.json");
    if (fs.existsSync(reviewPath) && fs.statSync(reviewPath).isFile()) {
      try {
        const raw = readJsonObject(reviewPath, toRepoRelative(targetRoot, reviewPath));
        const expectedTaskId = path.basename(taskRoot);
        validateReviewRecord(raw, expectedTaskId);
        classifySchemaStatus(targetRoot, reviewPath, raw.schema_version, checked, valid, legacy, errors);
      } catch (reviewError) {
        const message = reviewError instanceof Error ? reviewError.message : String(reviewError);
        checked.count += 1;
        errors.push(buildValidationIssue(targetRoot, reviewPath, message));
      }
    }

    const agentsRoot = path.join(taskRoot, "agents");
    if (!fs.existsSync(agentsRoot) || !fs.statSync(agentsRoot).isDirectory()) {
      continue;
    }

    for (const runEntry of fs.readdirSync(agentsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const statusPath = path.join(agentsRoot, runEntry.name, "status.json");

      if (!fs.existsSync(statusPath) || !fs.statSync(statusPath).isFile()) {
        continue;
      }

      try {
        readAgentRunRecord(statusPath);
        const raw = readJsonObject(statusPath, toRepoRelative(targetRoot, statusPath));
        classifySchemaStatus(targetRoot, statusPath, raw.schema_version, checked, valid, legacy, errors);
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError);
        checked.count += 1;
        errors.push(buildValidationIssue(targetRoot, statusPath, message));
      }
    }
  }

  const debtPath = path.join(targetRoot, DEBT_JSONL_PATH);
  if (fs.existsSync(debtPath) && fs.statSync(debtPath).isFile()) {
    checked.count += 1;

    try {
      const lines = fs
        .readFileSync(debtPath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      let hasLegacyDebt = false;

      for (const line of lines) {
        const parsed = JSON.parse(line) as unknown;
        const item = parseDebtItem(parsed);
        if (item.schema_version === undefined) {
          hasLegacyDebt = true;
        }
      }

      if (hasLegacyDebt) {
        legacy.push(
          buildValidationIssue(
            targetRoot,
            debtPath,
            "legacy unversioned debt items; run `node bin/ch schema migrate --dry-run` and `node bin/ch schema migrate`."
          )
        );
      } else {
        valid.count += 1;
      }
    } catch (debtError) {
      const message = debtError instanceof Error ? debtError.message : String(debtError);
      errors.push(buildValidationIssue(targetRoot, debtPath, message));
    }
  }

  const decisionsRoot = path.join(targetRoot, MEMORY_DECISIONS_DIR);
  if (fs.existsSync(decisionsRoot) && fs.statSync(decisionsRoot).isDirectory()) {
    for (const entry of fs.readdirSync(decisionsRoot, { withFileTypes: true }).filter((item) => item.isFile() && item.name.endsWith(".json"))) {
      const decisionPath = path.join(decisionsRoot, entry.name);

      try {
        const raw = readJsonValue(decisionPath, toRepoRelative(targetRoot, decisionPath));
        const decision = parseDecisionRecord(raw);
        classifySchemaStatus(targetRoot, decisionPath, decision.schema_version, checked, valid, legacy, errors);
      } catch (decisionError) {
        const message = decisionError instanceof Error ? decisionError.message : String(decisionError);
        checked.count += 1;
        errors.push(buildValidationIssue(targetRoot, decisionPath, message));
      }
    }
  }

  const proposalsRoot = path.join(targetRoot, GOVERNANCE_PROPOSALS_DIR);
  if (fs.existsSync(proposalsRoot) && fs.statSync(proposalsRoot).isDirectory()) {
    for (const entry of fs.readdirSync(proposalsRoot, { withFileTypes: true }).filter((item) => item.isFile() && item.name.endsWith(".md"))) {
      const markdownPath = path.join(proposalsRoot, entry.name);
      const jsonPath = getGovernanceProposalJsonPath(markdownPath);

      if (!fs.existsSync(jsonPath) || !fs.statSync(jsonPath).isFile()) {
        checked.count += 1;
        legacy.push(
          buildValidationIssue(
            targetRoot,
            jsonPath,
            "governance proposal JSON sidecar is missing; run `node bin/ch schema migrate --dry-run` and `node bin/ch schema migrate`."
          )
        );
        continue;
      }

      try {
        const raw = readJsonValue(jsonPath, toRepoRelative(targetRoot, jsonPath));
        const proposal = validateGovernanceProposalRecord(raw);
        if (!fs.existsSync(path.join(targetRoot, proposal.markdown_path))) {
          throw new Error("referenced proposal markdown is missing.");
        }
        classifySchemaStatus(targetRoot, jsonPath, proposal.schema_version, checked, valid, legacy, errors);
      } catch (proposalError) {
        const message = proposalError instanceof Error ? proposalError.message : String(proposalError);
        checked.count += 1;
        errors.push(buildValidationIssue(targetRoot, jsonPath, message));
      }
    }
  }

  for (const profileId of listAdapterProfileIds(targetRoot)) {
    try {
      const metadata = readAdapterProfileSchemaMetadata(targetRoot, profileId);
      readAdapterProfile(targetRoot, profileId);
      classifySchemaStatus(targetRoot, path.join(targetRoot, CONFIG_PATH), metadata.schemaVersion, checked, valid, legacy, errors);
    } catch (profileError) {
      const message = profileError instanceof Error ? profileError.message : String(profileError);
      checked.count += 1;
      errors.push(buildValidationIssue(targetRoot, path.join(targetRoot, CONFIG_PATH), message));
    }
  }

  return {
    targetRoot,
    checked: checked.count,
    valid: valid.count,
    legacy,
    errors
  };
}

function buildMigrationPlan(
  targetRoot: string,
  relativePath: string,
  action: MigrationAction,
  reason: string,
  content?: string
): MigrationPlan {
  const absolutePath = path.join(targetRoot, relativePath);
  return {
    relativePath,
    absolutePath,
    action,
    reason,
    content,
    ...(action === "update" ? { backupPath: getBackupPath(absolutePath) } : {})
  };
}

function planInstallMigration(targetRoot: string, appliedAt: string): MigrationPlan {
  const relativePath = INSTALL_JSON_PATH;
  const absolutePath = path.join(targetRoot, relativePath);

  try {
    const metadata = readInstallMetadata(absolutePath);

    if (!metadata) {
      return buildMigrationPlan(targetRoot, relativePath, "blocked", "install metadata is missing.");
    }

    const raw = readJsonObject(absolutePath, relativePath);
    if (raw.schema_version !== undefined) {
      return buildMigrationPlan(targetRoot, relativePath, "unchanged", "install metadata already schema-versioned.");
    }

    return buildMigrationPlan(
      targetRoot,
      relativePath,
      "update",
      "add schema metadata to install metadata",
      `${JSON.stringify(
        {
          ...metadata,
          ...buildSchemaMetadata("node bin/ch schema migrate"),
          updated_at: metadata.updated_at ?? metadata.last_upgrade?.applied_at ?? metadata.installed_at
        },
        null,
        2
      )}\n`
    );
  } catch (installError) {
    const message = installError instanceof Error ? installError.message : String(installError);
    return buildMigrationPlan(targetRoot, relativePath, "blocked", message);
  }
}

function planTaskStateMigration(targetRoot: string, taskRoot: string): MigrationPlan {
  const absolutePath = path.join(taskRoot, "state.json");
  const relativePath = toRepoRelative(targetRoot, absolutePath);

  try {
    const state = parseTaskState(absolutePath);
    const raw = readJsonObject(absolutePath, relativePath);

    if (raw.schema_version !== undefined) {
      return buildMigrationPlan(targetRoot, relativePath, "unchanged", "task state already schema-versioned.");
    }

    return buildMigrationPlan(
      targetRoot,
      relativePath,
      "update",
      "add schema metadata to task state",
      `${JSON.stringify({ ...state, ...buildSchemaMetadata("node bin/ch schema migrate") }, null, 2)}\n`
    );
  } catch (taskError) {
    const message = taskError instanceof Error ? taskError.message : String(taskError);
    return buildMigrationPlan(targetRoot, relativePath, "blocked", message);
  }
}

function planVerifierMigration(targetRoot: string, taskRoot: string): MigrationPlan | undefined {
  const absolutePath = path.join(taskRoot, "verifier.json");
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return undefined;
  }

  const relativePath = toRepoRelative(targetRoot, absolutePath);

  try {
    const raw = readJsonObject(absolutePath, relativePath);
    const verifier = validateVerifierRecord(raw);

    if (raw.schema_version !== undefined) {
      return buildMigrationPlan(targetRoot, relativePath, "unchanged", "verifier already schema-versioned.");
    }

    return buildMigrationPlan(
      targetRoot,
      relativePath,
      "update",
      "add schema metadata to verifier record",
      `${JSON.stringify({ ...verifier, ...buildSchemaMetadata("node bin/ch schema migrate") }, null, 2)}\n`
    );
  } catch (verifierError) {
    const message = verifierError instanceof Error ? verifierError.message : String(verifierError);
    return buildMigrationPlan(targetRoot, relativePath, "blocked", message);
  }
}

function planReviewMigration(targetRoot: string, taskRoot: string): MigrationPlan | undefined {
  const absolutePath = path.join(taskRoot, "review.json");
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return undefined;
  }

  const relativePath = toRepoRelative(targetRoot, absolutePath);

  try {
    const raw = readJsonObject(absolutePath, relativePath);
    const review = validateReviewRecord(raw, path.basename(taskRoot));

    if (raw.schema_version !== undefined) {
      return buildMigrationPlan(targetRoot, relativePath, "unchanged", "review already schema-versioned.");
    }

    return buildMigrationPlan(
      targetRoot,
      relativePath,
      "update",
      "add schema metadata to review record",
      `${JSON.stringify({ ...review, ...buildSchemaMetadata("node bin/ch schema migrate") }, null, 2)}\n`
    );
  } catch (reviewError) {
    const message = reviewError instanceof Error ? reviewError.message : String(reviewError);
    return buildMigrationPlan(targetRoot, relativePath, "blocked", message);
  }
}

function planAgentRunMigrations(targetRoot: string, taskRoot: string): MigrationPlan[] {
  const agentsRoot = path.join(taskRoot, "agents");
  if (!fs.existsSync(agentsRoot) || !fs.statSync(agentsRoot).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(agentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(agentsRoot, entry.name, "status.json"))
    .filter((statusPath) => fs.existsSync(statusPath) && fs.statSync(statusPath).isFile())
    .map((statusPath) => {
      const relativePath = toRepoRelative(targetRoot, statusPath);

      try {
        const raw = readJsonObject(statusPath, relativePath);
        const record = readAgentRunRecord(statusPath);

        if (raw.schema_version !== undefined) {
          return buildMigrationPlan(targetRoot, relativePath, "unchanged", "agent run already schema-versioned.");
        }

        return buildMigrationPlan(
          targetRoot,
          relativePath,
          "update",
          "add schema metadata to agent run record",
          `${JSON.stringify({ ...record, ...buildSchemaMetadata("node bin/ch schema migrate") }, null, 2)}\n`
        );
      } catch (statusError) {
        const message = statusError instanceof Error ? statusError.message : String(statusError);
        return buildMigrationPlan(targetRoot, relativePath, "blocked", message);
      }
    });
}

function planDebtMigration(targetRoot: string, appliedAt: string): MigrationPlan | undefined {
  const absolutePath = path.join(targetRoot, DEBT_JSONL_PATH);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return undefined;
  }

  const relativePath = toRepoRelative(targetRoot, absolutePath);

  try {
    const lines = fs
      .readFileSync(absolutePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return buildMigrationPlan(targetRoot, relativePath, "unchanged", "debt ledger is empty.");
    }

    let changed = false;
    const migratedItems = lines.map((line) => {
      const item = parseDebtItem(JSON.parse(line) as unknown);
      if (item.schema_version !== undefined) {
        return item;
      }
      changed = true;
      return {
        ...item,
        ...buildSchemaMetadata("node bin/ch schema migrate"),
        created_at: item.created_at ?? appliedAt,
        updated_at: item.updated_at ?? appliedAt
      };
    });

    if (!changed) {
      return buildMigrationPlan(targetRoot, relativePath, "unchanged", "debt items already schema-versioned.");
    }

    return buildMigrationPlan(
      targetRoot,
      relativePath,
      "update",
      "add schema metadata to debt ledger",
      `${migratedItems.map((item) => JSON.stringify(item)).join("\n")}\n`
    );
  } catch (debtError) {
    const message = debtError instanceof Error ? debtError.message : String(debtError);
    return buildMigrationPlan(targetRoot, relativePath, "blocked", message);
  }
}

function planDecisionMigrations(targetRoot: string): MigrationPlan[] {
  const decisionsRoot = path.join(targetRoot, MEMORY_DECISIONS_DIR);
  if (!fs.existsSync(decisionsRoot) || !fs.statSync(decisionsRoot).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(decisionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(decisionsRoot, entry.name))
    .map((decisionPath) => {
      const relativePath = toRepoRelative(targetRoot, decisionPath);

      try {
        const decision = parseDecisionRecord(readJsonValue(decisionPath, relativePath));

        if (decision.schema_version !== undefined) {
          return buildMigrationPlan(targetRoot, relativePath, "unchanged", "decision already schema-versioned.");
        }

        return buildMigrationPlan(
          targetRoot,
          relativePath,
          "update",
          "add schema metadata to decision record",
          `${JSON.stringify(
            {
              ...decision,
              ...buildSchemaMetadata("node bin/ch schema migrate"),
              updated_at: decision.updated_at ?? decision.date
            },
            null,
            2
          )}\n`
        );
      } catch (decisionError) {
        const message = decisionError instanceof Error ? decisionError.message : String(decisionError);
        return buildMigrationPlan(targetRoot, relativePath, "blocked", message);
      }
    });
}

function extractProposalIdentity(markdownPath: string): { proposalId: string; title: string } {
  const content = fs.readFileSync(markdownPath, "utf8");
  const match = /^#\s+(HEP-\d+)\s+-\s+(.+)$/m.exec(content);

  if (match) {
    return {
      proposalId: match[1],
      title: match[2].trim()
    };
  }

  const fileName = path.basename(markdownPath, ".md");
  const idMatch = /^(HEP-\d+)-(.+)$/.exec(fileName);

  if (!idMatch) {
    throw new Error("unable to infer governance proposal identity from markdown filename.");
  }

  return {
    proposalId: idMatch[1],
    title: idMatch[2].replace(/-/g, " ")
  };
}

function planGovernanceProposalMigrations(targetRoot: string, appliedAt: string): MigrationPlan[] {
  const proposalsRoot = path.join(targetRoot, GOVERNANCE_PROPOSALS_DIR);
  if (!fs.existsSync(proposalsRoot) || !fs.statSync(proposalsRoot).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(proposalsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(proposalsRoot, entry.name))
    .map((markdownPath) => {
      const jsonPath = getGovernanceProposalJsonPath(markdownPath);
      const relativePath = toRepoRelative(targetRoot, jsonPath);

      try {
        const markdownRelativePath = toRepoRelative(targetRoot, markdownPath);

        if (!fs.existsSync(jsonPath)) {
          const identity = extractProposalIdentity(markdownPath);
          const record = buildGovernanceProposalRecord(
            identity.proposalId,
            identity.title,
            [],
            appliedAt,
            markdownRelativePath,
            "node bin/ch schema migrate"
          );
          return buildMigrationPlan(
            targetRoot,
            relativePath,
            "create",
            "create governance proposal JSON sidecar",
            `${JSON.stringify(record, null, 2)}\n`
          );
        }

        const proposal = validateGovernanceProposalRecord(readJsonValue(jsonPath, relativePath));
        if (proposal.schema_version !== undefined) {
          return buildMigrationPlan(targetRoot, relativePath, "unchanged", "governance proposal already schema-versioned.");
        }

        return buildMigrationPlan(
          targetRoot,
          relativePath,
          "update",
          "add schema metadata to governance proposal sidecar",
          `${JSON.stringify(
            {
              ...proposal,
              ...buildSchemaMetadata("node bin/ch schema migrate"),
              updated_at: proposal.updated_at ?? appliedAt
            },
            null,
            2
          )}\n`
        );
      } catch (proposalError) {
        const message = proposalError instanceof Error ? proposalError.message : String(proposalError);
        return buildMigrationPlan(targetRoot, relativePath, "blocked", message);
      }
    });
}

function applyMigrationPlan(plan: MigrationPlan): void {
  if (plan.action !== "create" && plan.action !== "update") {
    return;
  }

  if (plan.content === undefined) {
    throw new Error(`Missing migration content for ${plan.relativePath}.`);
  }

  if (plan.action === "update" && plan.backupPath) {
    fs.copyFileSync(plan.absolutePath, plan.backupPath);
  }

  fs.mkdirSync(path.dirname(plan.absolutePath), { recursive: true });

  if (plan.relativePath.endsWith(".json") && plan.absolutePath.includes(`${path.sep}${GOVERNANCE_PROPOSALS_DIR}${path.sep}`)) {
    writeGovernanceProposalRecord(plan.absolutePath, validateGovernanceProposalRecord(JSON.parse(plan.content) as unknown));
    return;
  }

  fs.writeFileSync(plan.absolutePath, plan.content, "utf8");
}

export function migrateSchemas(cwd: string, dryRun: boolean): SchemaMigrationResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const appliedAt = new Date().toISOString();
  const plans: MigrationPlan[] = [planInstallMigration(targetRoot, appliedAt)];

  for (const taskRoot of collectTaskRoots(targetRoot)) {
    plans.push(planTaskStateMigration(targetRoot, taskRoot));
    const verifierPlan = planVerifierMigration(targetRoot, taskRoot);
    if (verifierPlan) {
      plans.push(verifierPlan);
    }
    const reviewPlan = planReviewMigration(targetRoot, taskRoot);
    if (reviewPlan) {
      plans.push(reviewPlan);
    }
    plans.push(...planAgentRunMigrations(targetRoot, taskRoot));
  }

  const debtPlan = planDebtMigration(targetRoot, appliedAt);
  if (debtPlan) {
    plans.push(debtPlan);
  }

  const adapterProfilePlan = planAdapterProfileConfigMigration(targetRoot);
  if (adapterProfilePlan) {
    plans.push(adapterProfilePlan);
  }

  plans.push(...planDecisionMigrations(targetRoot));
  plans.push(...planGovernanceProposalMigrations(targetRoot, appliedAt));

  const blocked = plans
    .filter((plan) => plan.action === "blocked")
    .map((plan) => `${plan.relativePath}: ${plan.reason}`);

  if (blocked.length > 0) {
    return {
      ok: false,
      dryRun,
      targetRoot,
      migrationId: LEGACY_TO_V1_MIGRATION_ID,
      created: plans.filter((plan) => plan.action === "create").map((plan) => plan.relativePath),
      updated: plans.filter((plan) => plan.action === "update").map((plan) => plan.relativePath),
      unchanged: plans.filter((plan) => plan.action === "unchanged").map((plan) => plan.relativePath),
      blocked,
      backups: plans
        .filter((plan) => plan.action === "update" && plan.backupPath)
        .map((plan) => toRepoRelative(targetRoot, plan.backupPath as string))
    };
  }

  if (!dryRun) {
    for (const plan of plans) {
      applyMigrationPlan(plan);
    }
  }

  return {
    ok: true,
    dryRun,
    targetRoot,
    migrationId: LEGACY_TO_V1_MIGRATION_ID,
    created: plans.filter((plan) => plan.action === "create").map((plan) => plan.relativePath),
    updated: plans.filter((plan) => plan.action === "update").map((plan) => plan.relativePath),
    unchanged: plans.filter((plan) => plan.action === "unchanged").map((plan) => plan.relativePath),
    blocked: [],
    backups: plans
      .filter((plan) => plan.action === "update" && plan.backupPath)
      .map((plan) => toRepoRelative(targetRoot, plan.backupPath as string))
  };
}
