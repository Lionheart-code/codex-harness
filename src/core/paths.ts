import * as path from "node:path";

export const HARNESS_DIR = ".harness";
export const TASKS_DIR = path.join(HARNESS_DIR, "tasks");
export const TEMPLATES_DIR = path.join(HARNESS_DIR, "templates");
export const MEMORY_DIR = path.join(HARNESS_DIR, "memory");
export const MEMORY_DECISIONS_DIR = path.join(MEMORY_DIR, "decisions");
export const MEMORY_DEBT_DIR = path.join(MEMORY_DIR, "debt");
export const MEMORY_SUMMARIES_DIR = path.join(MEMORY_DIR, "summaries");
export const CONFIG_PATH = path.join(HARNESS_DIR, "config.toml");
export const INSTALL_JSON_PATH = path.join(HARNESS_DIR, "install.json");
export const PROJECT_INDEX_PATH = path.join(MEMORY_DIR, "project-index.md");
export const DEBT_JSONL_PATH = path.join(MEMORY_DEBT_DIR, "debt.jsonl");
export const DEBT_MARKDOWN_PATH = path.join(MEMORY_DEBT_DIR, "debt.md");
export const AGENTS_PATH = "AGENTS.md";
export const AGENTS_BLOCK_START = "<!-- codex-harness:start -->";
export const AGENTS_BLOCK_END = "<!-- codex-harness:end -->";
export const AGENTS_BACKUP_SUFFIX = ".codex-harness.bak";
export const DEFAULT_WORKTREE_ROOT = "../.codex-harness-worktrees";
export const BRANCH_RECORD_FILE = "branch.txt";
export const WORKTREE_RECORD_FILE = "worktree.txt";
export const PROMPT_PLAN_FILE = "prompt-plan.md";
export const PROMPT_WORK_FILE = "prompt-work.md";
export const PROMPT_REVIEW_FILE = "prompt-review.md";
export const TASK_PROMPTS_DIR = "prompts";
export const TASK_SCOUTS_DIR = "scouts";
export const TASK_AGENTS_DIR = "agents";
export const TASK_LOGS_DIR = "logs";
export const AGENT_RUN_STATUS_FILE = "status.json";
export const AGENT_RUN_PROMPT_FILE = "prompt.md";
export const AGENT_RUN_COMMAND_FILE = "command.json";
export const AGENT_RUN_OUTPUT_FILE = "output.md";
export const AGENT_RUN_LOG_FILE = "log.txt";
export const TASK_DIFF_FILE = "diff.patch";
export const TASK_VERIFIER_FILE = "verifier.json";
export const TASK_CHECK_LOG_FILE = "check.log";
export const REPORT_SECTION_HEADINGS = [
  "Done",
  "Not done",
  "Checks",
  "Risks",
  "Follow-ups",
  "Debt created",
  "Debt resolved",
  "Next action"
] as const;

export function getInstallTargetPaths(): string[] {
  return [
    AGENTS_PATH,
    CONFIG_PATH,
    TASKS_DIR,
    TEMPLATES_DIR,
    MEMORY_DIR,
    MEMORY_DECISIONS_DIR,
    MEMORY_DEBT_DIR,
    MEMORY_SUMMARIES_DIR,
    INSTALL_JSON_PATH
  ];
}

export function getMemorySeedPaths(): string[] {
  return [
    PROJECT_INDEX_PATH,
    DEBT_JSONL_PATH,
    DEBT_MARKDOWN_PATH
  ];
}

export function getManagedAgentsBlock(): string {
  return [
    AGENTS_BLOCK_START,
    "## codex-harness",
    "",
    "This repository has an installed `codex-harness` layer.",
    "",
    "Installed paths:",
    `- \`${CONFIG_PATH}\``,
    `- \`${TASKS_DIR}/\``,
    `- \`${TEMPLATES_DIR}/\``,
    `- \`${MEMORY_DIR}/\``,
    `- \`${INSTALL_JSON_PATH}\``,
    "",
    "Treat `.harness/` as harness-managed project state.",
    AGENTS_BLOCK_END
  ].join("\n");
}

export function getImplementationDisciplineSection(): string {
  return [
    "## Implementation discipline",
    "",
    "- Surface ambiguity before choosing an implementation path.",
    "- Prefer the smallest implementation that satisfies the active task acceptance criteria.",
    "- Make surgical changes only; do not refactor unrelated code.",
    "- Do not add speculative flexibility, future features, or abstractions.",
    "- Verify with the required acceptance commands before reporting completion."
  ].join("\n");
}

export function createTaskId(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `task-${slug || "untitled"}`;
}

export function getTaskTargetPaths(taskId: string): string[] {
  const taskDir = path.join(TASKS_DIR, taskId);

  return [
    taskDir,
    path.join(taskDir, "spec.md"),
    path.join(taskDir, "acceptance.md"),
    path.join(taskDir, "state.json")
  ];
}

export function getPromptTargetPaths(taskId: string): string[] {
  const taskDir = path.join(TASKS_DIR, taskId);

  return [
    path.join(taskDir, PROMPT_PLAN_FILE),
    path.join(taskDir, PROMPT_WORK_FILE),
    path.join(taskDir, PROMPT_REVIEW_FILE)
  ];
}

export function getScoutPromptTargetPaths(taskId: string, role: string): string[] {
  const taskDir = path.join(TASKS_DIR, taskId);

  return [
    path.join(taskDir, TASK_PROMPTS_DIR),
    path.join(taskDir, TASK_SCOUTS_DIR),
    path.join(taskDir, TASK_PROMPTS_DIR, `scout-${role}.md`)
  ];
}

export function getAgentRunTargetPaths(taskId: string, runId: string): string[] {
  const taskDir = path.join(TASKS_DIR, taskId);
  const agentsDir = path.join(taskDir, TASK_AGENTS_DIR);
  const runDir = path.join(agentsDir, runId);

  return [
    agentsDir,
    runDir,
    path.join(runDir, AGENT_RUN_STATUS_FILE)
  ];
}

export function getAgentRunArtifactPaths(taskId: string, runId: string): string[] {
  const taskDir = path.join(TASKS_DIR, taskId);
  const runDir = path.join(taskDir, TASK_AGENTS_DIR, runId);

  return [
    path.join(runDir, AGENT_RUN_PROMPT_FILE),
    path.join(runDir, AGENT_RUN_COMMAND_FILE),
    path.join(runDir, AGENT_RUN_OUTPUT_FILE),
    path.join(runDir, AGENT_RUN_LOG_FILE)
  ];
}

export function getCheckTargetPaths(taskId: string): string[] {
  const taskDir = path.join(TASKS_DIR, taskId);
  const logsDir = path.join(taskDir, TASK_LOGS_DIR);

  return [
    path.join(taskDir, TASK_DIFF_FILE),
    path.join(taskDir, TASK_VERIFIER_FILE),
    logsDir,
    path.join(logsDir, TASK_CHECK_LOG_FILE)
  ];
}
