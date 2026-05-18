import * as path from "node:path";
import { captureTaskState } from "../core/checks";
import { error, lines } from "../core/logger";

export async function runCapture(args: string[]): Promise<number> {
  if (args.length > 0) {
    error(`Unknown capture argument(s): ${args.join(", ")}`);
    return 1;
  }

  try {
    const result = captureTaskState(process.cwd());

    lines([
      "codex-harness capture",
      `target root: ${result.targetRoot}`,
      `task id: ${result.taskId}`,
      `worktree: ${result.worktreePath}`,
      `diff path: ${path.relative(result.targetRoot, result.diffPath)}`,
      `verifier path: ${path.relative(result.targetRoot, result.verifierPath)}`,
      `git status lines: ${result.verifier.git_status_lines.length}`,
      `protected path violations: ${result.verifier.protected_path_violations.length}`,
      "result: captured"
    ]);

    return 0;
  } catch (captureError) {
    const message = captureError instanceof Error ? captureError.message : String(captureError);
    error(message);
    return 1;
  }
}
