import { error, lines } from "../core/logger";
import { listTasks } from "../core/tasks";

export async function runStatus(args: string[]): Promise<number> {
  if (args.length > 0) {
    error(`Unknown status argument(s): ${args.join(", ")}`);
    return 1;
  }

  try {
    const result = listTasks(process.cwd());
    const warningLines =
      result.warnings.length > 0
        ? ["warnings:", ...result.warnings.map((warning) => `- ${warning}`)]
        : [];

    if (result.tasks.length === 0) {
      lines([
        "codex-harness status",
        `target root: ${result.targetRoot}`,
        "No tasks found.",
        ...warningLines
      ]);
      return 0;
    }

    lines([
      "codex-harness status",
      `target root: ${result.targetRoot}`,
      ...result.tasks.map(
        (task) => {
          const segments = [
            `- ${task.task_id}`,
            task.status,
            task.title,
            `created_at=${task.created_at}`,
            `updated_at=${task.updated_at}`
          ];

          if (task.task_type) {
            segments.push(`task_type=${task.task_type}`);
          }

          if (task.branch) {
            segments.push(`branch=${task.branch}`);
          }

          if (task.worktree) {
            segments.push(`worktree=${task.worktree}`);
          }

          return segments.join(" | ");
        }
      ),
      ...warningLines
    ]);

    return 0;
  } catch (taskError) {
    const message = taskError instanceof Error ? taskError.message : String(taskError);
    error(message);
    return 1;
  }
}
