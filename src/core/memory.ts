import * as fs from "node:fs";
import * as path from "node:path";
import { listAllAgentRunsInTarget, type AgentRunStatus } from "./agent-ledger";
import { getMemorySeedFilePlans } from "./memory-scaffold";
import {
  DEBT_JSONL_PATH,
  DEBT_MARKDOWN_PATH,
  MEMORY_DECISIONS_DIR,
  MEMORY_DEBT_DIR,
  MEMORY_DIR,
  MEMORY_SUMMARIES_DIR,
  PROJECT_INDEX_PATH,
  REPORT_SECTION_HEADINGS,
  TASKS_DIR
} from "./paths";
import { CURRENT_SCHEMA_VERSION, buildSchemaMetadata, validateOptionalSchemaMetadata } from "./schema-migrations";
import { listTasks, requireInstalledTargetRoot, type TaskState } from "./tasks";

export type DebtType = "technical" | "architectural" | "test" | "documentation" | "security" | "process";
export type DebtSeverity = "low" | "medium" | "high";
export type DebtStatus = "open" | "in_progress" | "resolved" | "accepted" | "obsolete";
export type DecisionStatus = "active" | "superseded" | "rejected";

export interface DebtItem {
  schema_version?: typeof CURRENT_SCHEMA_VERSION;
  producer_command?: string;
  created_at?: string;
  updated_at?: string;
  debt_id: string;
  title: string;
  type: DebtType;
  severity: DebtSeverity;
  created_by_task: string;
  created_by_agent_run: string;
  reason: string;
  location: string[];
  impact: string;
  paydown_condition: string;
  status: DebtStatus;
}

export interface DecisionRecord {
  schema_version?: typeof CURRENT_SCHEMA_VERSION;
  producer_command?: string;
  updated_at?: string;
  decision_id: string;
  title: string;
  date: string;
  context: string;
  decision: string;
  alternatives_considered: string[];
  reason: string;
  affected_files_or_modules: string[];
  related_task_ids: string[];
  superseded_by: string;
  status: DecisionStatus;
}

export interface DebtAddInput {
  title: string;
  type: DebtType;
  severity: DebtSeverity;
  reason: string;
  locations: string[];
  impact?: string;
  paydownCondition?: string;
  agentRun?: string;
}

export interface DebtAddResult {
  targetRoot: string;
  taskId: string;
  debt: DebtItem;
  debtLedgerPath: string;
  debtMarkdownPath: string;
  projectIndexPath: string;
}

export interface DebtResolveResult {
  targetRoot: string;
  taskId: string;
  debt: DebtItem;
  debtLedgerPath: string;
  alreadyResolved: boolean;
}

export interface DebtListResult {
  targetRoot: string;
  items: DebtItem[];
  warnings: string[];
  debtLedgerPath: string;
  debtMarkdownPath: string;
}

export interface DecisionAddInput {
  title: string;
  reason: string;
  context?: string;
  alternatives: string[];
  affected: string[];
}

export interface DecisionAddResult {
  targetRoot: string;
  taskId: string;
  decision: DecisionRecord;
  decisionPath: string;
  projectIndexPath: string;
}

export interface DecisionListResult {
  targetRoot: string;
  decisions: DecisionRecord[];
  warnings: string[];
}

export interface MemoryStatusResult {
  targetRoot: string;
  memoryRoot: string;
  debtCounts: Record<DebtStatus, number>;
  decisionCounts: Record<DecisionStatus, number>;
  agentCounts: Record<AgentRunStatus, number>;
  projectIndexPath: string;
  debtMarkdownPath: string;
  warnings: string[];
}

type LoadMode = "strict" | "warn";

const DEBT_TYPES: DebtType[] = ["technical", "architectural", "test", "documentation", "security", "process"];
const DEBT_SEVERITIES: DebtSeverity[] = ["low", "medium", "high"];
const DEBT_STATUSES: DebtStatus[] = ["open", "in_progress", "resolved", "accepted", "obsolete"];
const DECISION_STATUSES: DecisionStatus[] = ["active", "superseded", "rejected"];
const AGENT_STATUSES: AgentRunStatus[] = ["raw", "accepted", "stale", "rejected"];

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function toRepoRelative(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

export function isDebtType(value: string): value is DebtType {
  return DEBT_TYPES.includes(value as DebtType);
}

export function isDebtSeverity(value: string): value is DebtSeverity {
  return DEBT_SEVERITIES.includes(value as DebtSeverity);
}

function isDebtStatus(value: string): value is DebtStatus {
  return DEBT_STATUSES.includes(value as DebtStatus);
}

function isDecisionStatus(value: string): value is DecisionStatus {
  return DECISION_STATUSES.includes(value as DecisionStatus);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function getMemoryDirectoryAbsolutePaths(targetRoot: string): string[] {
  return [
    path.join(targetRoot, MEMORY_DIR),
    path.join(targetRoot, MEMORY_DECISIONS_DIR),
    path.join(targetRoot, MEMORY_DEBT_DIR),
    path.join(targetRoot, MEMORY_SUMMARIES_DIR)
  ];
}

function createEmptyDebtCounts(): Record<DebtStatus, number> {
  return {
    open: 0,
    in_progress: 0,
    resolved: 0,
    accepted: 0,
    obsolete: 0
  };
}

function createEmptyDecisionCounts(): Record<DecisionStatus, number> {
  return {
    active: 0,
    superseded: 0,
    rejected: 0
  };
}

function createEmptyAgentCounts(): Record<AgentRunStatus, number> {
  return {
    raw: 0,
    accepted: 0,
    stale: 0,
    rejected: 0
  };
}

function buildDebtMarkdown(items: DebtItem[]): string {
  const openItems = items.filter((item) => item.status !== "resolved" && item.status !== "obsolete");
  const closedItems = items.filter((item) => item.status === "resolved" || item.status === "obsolete");
  const sections = [
    "# Debt Ledger",
    "",
    `Tracked debt items: ${items.length}`,
    "",
    "## Unresolved",
    openItems.length === 0
      ? "- None recorded."
      : openItems
          .map(
            (item) =>
              `- ${item.debt_id} | ${item.status} | ${item.severity} | ${item.type} | ${item.title} | task=${item.created_by_task}`
          )
          .join("\n"),
    "",
    "## Closed",
    closedItems.length === 0
      ? "- None recorded."
      : closedItems
          .map(
            (item) =>
              `- ${item.debt_id} | ${item.status} | ${item.severity} | ${item.type} | ${item.title} | task=${item.created_by_task}`
          )
          .join("\n"),
    ""
  ];

  return sections.join("\n");
}

function buildProjectIndex(tasks: TaskState[], debtItems: DebtItem[], decisions: DecisionRecord[]): string {
  const activeDebt = debtItems.filter((item) => item.status !== "resolved" && item.status !== "obsolete");
  const activeDecisions = decisions.filter((decision) => decision.status === "active");
  const openTasks = tasks.filter((task) => task.status === "created");

  return [
    "# Project Index",
    "",
    "## Main Modules",
    "- Not cataloged in Phase 9.",
    "",
    "## Important Commands",
    "- `node bin/ch memory status`",
    "- `node bin/ch debt list`",
    "- `node bin/ch decisions list`",
    "",
    "## Active Architecture Decisions",
    ...(activeDecisions.length === 0
      ? ["- None recorded."]
      : activeDecisions.map((decision) => `- ${decision.decision_id} | ${decision.title}`)),
    "",
    "## Active Debt",
    ...(activeDebt.length === 0
      ? ["- None recorded."]
      : activeDebt.map((item) => `- ${item.debt_id} | ${item.severity} | ${item.title}`)),
    "",
    "## Recent Completed Tasks",
    "- None recorded in Phase 9.",
    "",
    "## Open Tasks",
    ...(openTasks.length === 0
      ? ["- None recorded."]
      : openTasks.map((task) => `- ${task.task_id} | ${task.title}`)),
    "",
    "## Known Risky Areas",
    "- See unresolved debt and active decisions.",
    "",
    "## Future Report Sections",
    ...REPORT_SECTION_HEADINGS.map((heading) => `- ${heading}`),
    ""
  ].join("\n");
}

function getSingleTaskForMemoryMutation(cwd: string): { targetRoot: string; task: TaskState } {
  const result = listTasks(cwd);

  if (result.tasks.length === 0) {
    throw new Error("No tasks found. Run `node bin/ch init \"task title\"` first.");
  }

  if (result.tasks.length > 1) {
    throw new Error("Phase 9 memory commands require exactly one task.");
  }

  return {
    targetRoot: result.targetRoot,
    task: result.tasks[0]
  };
}

export function parseDebtItem(value: unknown): DebtItem {
  const parsed = value as Partial<DebtItem> & Record<string, unknown>;
  validateOptionalSchemaMetadata(parsed, "debt.jsonl");

  if (
    typeof parsed.debt_id !== "string" ||
    typeof parsed.title !== "string" ||
    typeof parsed.type !== "string" ||
    !isDebtType(parsed.type) ||
    typeof parsed.severity !== "string" ||
    !isDebtSeverity(parsed.severity) ||
    typeof parsed.created_by_task !== "string" ||
    typeof parsed.created_by_agent_run !== "string" ||
    typeof parsed.reason !== "string" ||
    !isStringArray(parsed.location) ||
    typeof parsed.impact !== "string" ||
    typeof parsed.paydown_condition !== "string" ||
    typeof parsed.status !== "string" ||
    !isDebtStatus(parsed.status)
  ) {
    throw new Error("missing required debt fields");
  }

  if (parsed.created_at !== undefined && typeof parsed.created_at !== "string") {
    throw new Error("invalid created_at");
  }

  if (parsed.updated_at !== undefined && typeof parsed.updated_at !== "string") {
    throw new Error("invalid updated_at");
  }

  return parsed as DebtItem;
}

export function parseDecisionRecord(value: unknown): DecisionRecord {
  const parsed = value as Partial<DecisionRecord> & Record<string, unknown>;
  validateOptionalSchemaMetadata(parsed, "decision record");

  if (
    typeof parsed.decision_id !== "string" ||
    typeof parsed.title !== "string" ||
    typeof parsed.date !== "string" ||
    typeof parsed.context !== "string" ||
    typeof parsed.decision !== "string" ||
    !isStringArray(parsed.alternatives_considered) ||
    typeof parsed.reason !== "string" ||
    !isStringArray(parsed.affected_files_or_modules) ||
    !isStringArray(parsed.related_task_ids) ||
    typeof parsed.superseded_by !== "string" ||
    typeof parsed.status !== "string" ||
    !isDecisionStatus(parsed.status)
  ) {
    throw new Error("missing required decision fields");
  }

  if (parsed.updated_at !== undefined && typeof parsed.updated_at !== "string") {
    throw new Error("invalid updated_at");
  }

  return parsed as DecisionRecord;
}

function buildDebtWarning(targetRoot: string, lineNumber: number, debtPath: string, debtError: unknown): string {
  const message = debtError instanceof Error ? debtError.message : String(debtError);
  return `Skipped malformed debt item: ${toRepoRelative(targetRoot, debtPath)}:${lineNumber} (${message})`;
}

function buildDecisionWarning(targetRoot: string, decisionPath: string, decisionError: unknown): string {
  const message = decisionError instanceof Error ? decisionError.message : String(decisionError);
  return `Skipped malformed decision record: ${toRepoRelative(targetRoot, decisionPath)} (${message})`;
}

function loadDebtItemsByTargetRoot(targetRoot: string, mode: LoadMode): { items: DebtItem[]; warnings: string[] } {
  const debtPath = path.join(targetRoot, DEBT_JSONL_PATH);

  if (!fs.existsSync(debtPath)) {
    return {
      items: [],
      warnings: []
    };
  }

  const content = fs.readFileSync(debtPath, "utf8");

  if (content.trim().length === 0) {
    return {
      items: [],
      warnings: []
    };
  }

  const warnings: string[] = [];
  const items = content
    .split(/\r?\n/)
    .flatMap((line, index) => {
      if (line.trim().length === 0) {
        return [];
      }

      try {
        return [parseDebtItem(JSON.parse(line) as unknown)];
      } catch (debtError) {
        if (mode === "strict") {
          throw new Error(buildDebtWarning(targetRoot, index + 1, debtPath, debtError));
        }

        warnings.push(buildDebtWarning(targetRoot, index + 1, debtPath, debtError));
        return [];
      }
    });

  return {
    items,
    warnings
  };
}

function loadDecisionRecordsByTargetRoot(targetRoot: string, mode: LoadMode): { decisions: DecisionRecord[]; warnings: string[] } {
  const decisionsDir = path.join(targetRoot, MEMORY_DECISIONS_DIR);

  if (!fs.existsSync(decisionsDir)) {
    return {
      decisions: [],
      warnings: []
    };
  }

  const warnings: string[] = [];
  const decisions = fs
    .readdirSync(decisionsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(decisionsDir, entry.name))
    .flatMap((decisionPath) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(decisionPath, "utf8")) as unknown;
        return [parseDecisionRecord(parsed)];
      } catch (decisionError) {
        if (mode === "strict") {
          throw new Error(buildDecisionWarning(targetRoot, decisionPath, decisionError));
        }

        warnings.push(buildDecisionWarning(targetRoot, decisionPath, decisionError));
        return [];
      }
    })
    .sort((left, right) => left.decision_id.localeCompare(right.decision_id));

  return {
    decisions,
    warnings
  };
}

function writeDebtItems(targetRoot: string, items: DebtItem[]): void {
  const debtPath = path.join(targetRoot, DEBT_JSONL_PATH);
  const debtMarkdownPath = path.join(targetRoot, DEBT_MARKDOWN_PATH);
  const jsonl = items.map((item) => JSON.stringify(item)).join("\n");

  fs.writeFileSync(debtPath, jsonl.length > 0 ? `${jsonl}\n` : "", "utf8");
  fs.writeFileSync(debtMarkdownPath, buildDebtMarkdown(items), "utf8");
}

function writeDecisionRecord(targetRoot: string, decision: DecisionRecord): string {
  const decisionPath = path.join(targetRoot, MEMORY_DECISIONS_DIR, `${decision.decision_id}.json`);
  fs.writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
  return decisionPath;
}

function writeProjectIndex(targetRoot: string, debtItems: DebtItem[], decisions: DecisionRecord[]): void {
  const tasks = listTasks(targetRoot).tasks;
  fs.writeFileSync(path.join(targetRoot, PROJECT_INDEX_PATH), buildProjectIndex(tasks, debtItems, decisions), "utf8");
}

function getNextNumber(values: string[], prefix: string): number {
  const numbers = values
    .map((value) => new RegExp(`^${prefix}-(\\d{4,})$`).exec(value))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => Number.isFinite(value));

  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

function formatSequenceId(prefix: "DEBT" | "DECISION", nextNumber: number): string {
  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
}

function compareDebtItems(left: DebtItem, right: DebtItem): number {
  const leftResolved = left.status === "resolved" || left.status === "obsolete";
  const rightResolved = right.status === "resolved" || right.status === "obsolete";

  if (leftResolved !== rightResolved) {
    return leftResolved ? 1 : -1;
  }

  return left.debt_id.localeCompare(right.debt_id);
}

function ensureParentDirectories(targetRoot: string): void {
  for (const directoryPath of getMemoryDirectoryAbsolutePaths(targetRoot)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

export function ensureMemoryScaffold(targetRoot: string): void {
  ensureParentDirectories(targetRoot);

  for (const seedFile of getMemorySeedFilePlans(targetRoot)) {
    if (!fs.existsSync(seedFile.absolutePath)) {
      fs.writeFileSync(seedFile.absolutePath, seedFile.content, "utf8");
    }
  }
}

export function addDebt(cwd: string, input: DebtAddInput): DebtAddResult {
  const { targetRoot, task } = getSingleTaskForMemoryMutation(cwd);
  ensureMemoryScaffold(targetRoot);

  const debtLoad = loadDebtItemsByTargetRoot(targetRoot, "strict");
  const decisionLoad = loadDecisionRecordsByTargetRoot(targetRoot, "strict");
  const timestamp = new Date().toISOString();
  const debt: DebtItem = {
    ...buildSchemaMetadata("node bin/ch debt add"),
    created_at: timestamp,
    updated_at: timestamp,
    debt_id: formatSequenceId("DEBT", getNextNumber(debtLoad.items.map((item) => item.debt_id), "DEBT")),
    title: input.title,
    type: input.type,
    severity: input.severity,
    created_by_task: task.task_id,
    created_by_agent_run: input.agentRun ?? "",
    reason: input.reason,
    location: input.locations,
    impact: input.impact ?? "",
    paydown_condition: input.paydownCondition ?? "",
    status: "open"
  };
  const items = [...debtLoad.items, debt];

  writeDebtItems(targetRoot, items);
  writeProjectIndex(targetRoot, items, decisionLoad.decisions);

  return {
    targetRoot,
    taskId: task.task_id,
    debt,
    debtLedgerPath: path.join(targetRoot, DEBT_JSONL_PATH),
    debtMarkdownPath: path.join(targetRoot, DEBT_MARKDOWN_PATH),
    projectIndexPath: path.join(targetRoot, PROJECT_INDEX_PATH)
  };
}

export function resolveDebt(cwd: string, debtId: string): DebtResolveResult {
  const { targetRoot, task } = getSingleTaskForMemoryMutation(cwd);
  ensureMemoryScaffold(targetRoot);

  const debtLoad = loadDebtItemsByTargetRoot(targetRoot, "strict");
  const decisionLoad = loadDecisionRecordsByTargetRoot(targetRoot, "strict");
  const currentDebt = debtLoad.items.find((item) => item.debt_id === debtId);

  if (!currentDebt) {
    throw new Error(`Debt item not found: ${debtId}`);
  }

  const alreadyResolved = currentDebt.status === "resolved";
  const nextDebt = alreadyResolved
    ? currentDebt
    : {
        ...currentDebt,
        ...buildSchemaMetadata("node bin/ch debt resolve"),
        created_at: currentDebt.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "resolved" as const
      };
  const items = debtLoad.items.map((item) => (item.debt_id === debtId ? nextDebt : item));

  if (!alreadyResolved) {
    writeDebtItems(targetRoot, items);
    writeProjectIndex(targetRoot, items, decisionLoad.decisions);
  }

  return {
    targetRoot,
    taskId: task.task_id,
    debt: nextDebt,
    debtLedgerPath: path.join(targetRoot, DEBT_JSONL_PATH),
    alreadyResolved
  };
}

export function listDebt(cwd: string): DebtListResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const debtLoad = loadDebtItemsByTargetRoot(targetRoot, "warn");

  return {
    targetRoot,
    items: [...debtLoad.items].sort(compareDebtItems),
    warnings: debtLoad.warnings,
    debtLedgerPath: path.join(targetRoot, DEBT_JSONL_PATH),
    debtMarkdownPath: path.join(targetRoot, DEBT_MARKDOWN_PATH)
  };
}

export function addDecision(cwd: string, input: DecisionAddInput): DecisionAddResult {
  const { targetRoot, task } = getSingleTaskForMemoryMutation(cwd);
  ensureMemoryScaffold(targetRoot);

  const debtLoad = loadDebtItemsByTargetRoot(targetRoot, "strict");
  const decisionLoad = loadDecisionRecordsByTargetRoot(targetRoot, "strict");
  const timestamp = new Date().toISOString();
  const decision: DecisionRecord = {
    ...buildSchemaMetadata("node bin/ch decisions add"),
    updated_at: timestamp,
    decision_id: formatSequenceId(
      "DECISION",
      getNextNumber(decisionLoad.decisions.map((item) => item.decision_id), "DECISION")
    ),
    title: input.title,
    date: timestamp,
    context: input.context ?? "",
    decision: input.title,
    alternatives_considered: input.alternatives,
    reason: input.reason,
    affected_files_or_modules: input.affected,
    related_task_ids: [task.task_id],
    superseded_by: "",
    status: "active"
  };

  const decisionPath = writeDecisionRecord(targetRoot, decision);
  writeProjectIndex(targetRoot, debtLoad.items, [...decisionLoad.decisions, decision]);

  return {
    targetRoot,
    taskId: task.task_id,
    decision,
    decisionPath,
    projectIndexPath: path.join(targetRoot, PROJECT_INDEX_PATH)
  };
}

export function listDecisions(cwd: string): DecisionListResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const decisionLoad = loadDecisionRecordsByTargetRoot(targetRoot, "warn");

  return {
    targetRoot,
    decisions: decisionLoad.decisions,
    warnings: decisionLoad.warnings
  };
}

export function getMemoryStatus(cwd: string): MemoryStatusResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const debtLoad = loadDebtItemsByTargetRoot(targetRoot, "warn");
  const decisionLoad = loadDecisionRecordsByTargetRoot(targetRoot, "warn");
  const agentLoad = listAllAgentRunsInTarget(targetRoot);
  const debtCounts = createEmptyDebtCounts();
  const decisionCounts = createEmptyDecisionCounts();
  const agentCounts = createEmptyAgentCounts();

  for (const item of debtLoad.items) {
    debtCounts[item.status] += 1;
  }

  for (const decision of decisionLoad.decisions) {
    decisionCounts[decision.status] += 1;
  }

  for (const run of agentLoad.runs) {
    agentCounts[run.status] += 1;
  }

  return {
    targetRoot,
    memoryRoot: path.join(targetRoot, MEMORY_DIR),
    debtCounts,
    decisionCounts,
    agentCounts,
    projectIndexPath: path.join(targetRoot, PROJECT_INDEX_PATH),
    debtMarkdownPath: path.join(targetRoot, DEBT_MARKDOWN_PATH),
    warnings: [...debtLoad.warnings, ...decisionLoad.warnings, ...agentLoad.warnings]
  };
}

export { REPORT_SECTION_HEADINGS };
