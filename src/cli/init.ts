import { error, lines } from "../core/logger";
import { createTask, isTaskType, previewTaskCreation } from "../core/tasks";
import type { TaskType } from "../core/tasks";

interface InitArgs {
  title: string;
  dryRun: boolean;
  taskType?: TaskType;
}

function parseInitArgs(args: string[]): InitArgs | { error: string } {
  const positional: string[] = [];
  let taskType: TaskType | undefined;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (current === "--type") {
      const next = args[index + 1];

      if (!next || next.startsWith("--")) {
        return { error: "The `--type` flag requires one of: bugfix, feature, refactor, architecture, docs, deployment." };
      }

      if (taskType) {
        return { error: "The `--type` flag may only be provided once." };
      }

      if (!isTaskType(next)) {
        return { error: `Unsupported task type: ${next}` };
      }

      taskType = next;
      index += 1;
      continue;
    }

    if (current.startsWith("--")) {
      return { error: `Unknown init argument(s): ${current}` };
    }

    positional.push(current);
  }

  if (positional.length === 0) {
    return { error: "A task title is required." };
  }

  return {
    title: positional.join(" "),
    dryRun,
    taskType
  };
}

export async function runInit(args: string[]): Promise<number> {
  const parsed = parseInitArgs(args);

  if ("error" in parsed) {
    error(parsed.error);
    return 1;
  }

  try {
    if (parsed.dryRun) {
      const preview = previewTaskCreation(process.cwd(), parsed.title, { taskType: parsed.taskType });
      const output = [
        "codex-harness init (dry-run)",
        `title: ${parsed.title}`,
        `task id: ${preview.taskId}`
      ];

      if (preview.taskType) {
        output.push(`task type: ${preview.taskType}`);
      }

      output.push(
        "No files will be created in Phase 3 dry-run mode.",
        "Planned Phase 3 task paths:",
        ...preview.targetPaths.map((target) => `- ${target}`)
      );

      lines(output);

      return 0;
    }

    const result = createTask(process.cwd(), parsed.title, { taskType: parsed.taskType });
    const output = [
      "codex-harness init",
      `title: ${parsed.title}`,
      `task id: ${result.taskId}`
    ];

    if (parsed.taskType) {
      output.push(`task type: ${parsed.taskType}`);
    }

    output.push(
      "Created Phase 3 task files:",
      ...result.createdPaths.map((target) => `- ${target}`)
    );

    lines(output);

    return 0;
  } catch (taskError) {
    const message = taskError instanceof Error ? taskError.message : String(taskError);
    error(message);
    return 1;
  }
}
