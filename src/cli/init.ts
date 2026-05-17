import { error, lines } from "../core/logger";
import { createTaskId, getTaskTargetPaths } from "../core/paths";

export async function runInit(args: string[]): Promise<number> {
  const hasDryRun = args.includes("--dry-run");
  const titleParts = args.filter((arg) => !arg.startsWith("--"));
  const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--dry-run");

  if (unknownFlags.length > 0) {
    error(`Unknown init argument(s): ${unknownFlags.join(", ")}`);
    return 1;
  }

  if (!hasDryRun) {
    error("Phase 1 only supports `ch init \"task title\" --dry-run`.");
    return 1;
  }

  if (titleParts.length === 0) {
    error("A task title is required.");
    return 1;
  }

  const title = titleParts.join(" ");
  const taskId = createTaskId(title);

  lines([
    "codex-harness init (dry-run)",
    `title: ${title}`,
    `task id: ${taskId}`,
    "No files will be created in Phase 1.",
    "Planned Phase 3 task paths:",
    ...getTaskTargetPaths(taskId).map((target) => `- ${target}`)
  ]);

  return 0;
}
