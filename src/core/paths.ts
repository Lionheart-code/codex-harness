import * as path from "node:path";

export const HARNESS_DIR = ".harness";
export const TASKS_DIR = path.join(HARNESS_DIR, "tasks");
export const TEMPLATES_DIR = path.join(HARNESS_DIR, "templates");
export const CONFIG_PATH = path.join(HARNESS_DIR, "config.toml");
export const INSTALL_JSON_PATH = path.join(HARNESS_DIR, "install.json");
export const AGENTS_PATH = "AGENTS.md";
export const AGENTS_BLOCK_START = "<!-- codex-harness:start -->";
export const AGENTS_BLOCK_END = "<!-- codex-harness:end -->";

export function getInstallTargetPaths(): string[] {
  return [
    AGENTS_PATH,
    CONFIG_PATH,
    TASKS_DIR,
    TEMPLATES_DIR,
    INSTALL_JSON_PATH
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
    `- \`${INSTALL_JSON_PATH}\``,
    "",
    "Treat `.harness/` as harness-managed project state.",
    AGENTS_BLOCK_END
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
    path.join(taskDir, "spec.md"),
    path.join(taskDir, "acceptance.md"),
    path.join(taskDir, "state.json")
  ];
}
