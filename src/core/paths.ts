import * as path from "node:path";

const HARNESS_DIR = ".harness";
const TASKS_DIR = path.join(HARNESS_DIR, "tasks");

export function getInstallTargetPaths(): string[] {
  return [
    "AGENTS.md",
    path.join(HARNESS_DIR, "config.toml"),
    TASKS_DIR,
    path.join(HARNESS_DIR, "templates"),
    path.join(HARNESS_DIR, "install.json")
  ];
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
