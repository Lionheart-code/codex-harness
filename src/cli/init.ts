import { error, lines } from "../core/logger";
import { createTask, previewTaskCreation } from "../core/tasks";

export async function runInit(args: string[]): Promise<number> {
  const hasDryRun = args.includes("--dry-run");
  const titleParts = args.filter((arg) => !arg.startsWith("--"));
  const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--dry-run");

  if (unknownFlags.length > 0) {
    error(`Unknown init argument(s): ${unknownFlags.join(", ")}`);
    return 1;
  }

  if (titleParts.length === 0) {
    error("A task title is required.");
    return 1;
  }

  const title = titleParts.join(" ");

  try {
    if (hasDryRun) {
      const preview = previewTaskCreation(process.cwd(), title);

      lines([
        "codex-harness init (dry-run)",
        `title: ${title}`,
        `task id: ${preview.taskId}`,
        "No files will be created in Phase 3 dry-run mode.",
        "Planned Phase 3 task paths:",
        ...preview.targetPaths.map((target) => `- ${target}`)
      ]);

      return 0;
    }

    const result = createTask(process.cwd(), title);

    lines([
      "codex-harness init",
      `title: ${title}`,
      `task id: ${result.taskId}`,
      "Created Phase 3 task files:",
      ...result.createdPaths.map((target) => `- ${target}`)
    ]);

    return 0;
  } catch (taskError) {
    const message = taskError instanceof Error ? taskError.message : String(taskError);
    error(message);
    return 1;
  }
}
