import { error, lines } from "../core/logger";
import { listTasks } from "../core/tasks";

export async function runStatus(args: string[]): Promise<number> {
  if (args.length > 0) {
    error(`Unknown status argument(s): ${args.join(", ")}`);
    return 1;
  }

  try {
    const result = listTasks(process.cwd());

    if (result.tasks.length === 0) {
      lines([
        "codex-harness status",
        `target root: ${result.targetRoot}`,
        "No tasks found."
      ]);
      return 0;
    }

    lines([
      "codex-harness status",
      `target root: ${result.targetRoot}`,
      ...result.tasks.map(
        (task) =>
          `- ${task.task_id} | ${task.status} | ${task.title} | created_at=${task.created_at} | updated_at=${task.updated_at}`
      )
    ]);

    return 0;
  } catch (taskError) {
    const message = taskError instanceof Error ? taskError.message : String(taskError);
    error(message);
    return 1;
  }
}
