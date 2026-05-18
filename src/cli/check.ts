import * as path from "node:path";
import { runDeterministicChecks } from "../core/checks";
import { error, lines } from "../core/logger";

export async function runCheck(args: string[]): Promise<number> {
  if (args.length > 0) {
    error(`Unknown check argument(s): ${args.join(", ")}`);
    return 1;
  }

  try {
    const result = runDeterministicChecks(process.cwd());
    const output = [
      "codex-harness check",
      `target root: ${result.targetRoot}`,
      `task id: ${result.taskId}`,
      `worktree: ${result.worktreePath}`,
      `diff path: ${path.relative(result.targetRoot, result.diffPath)}`,
      `verifier path: ${path.relative(result.targetRoot, result.verifierPath)}`,
      `log path: ${path.relative(result.targetRoot, result.logPath)}`,
      `protected path violations: ${result.verifier.protected_path_violations.length}`,
      `commands: ${result.verifier.commands.length}`,
      `result: ${result.verifier.result}`
    ];

    if (result.verifier.protected_path_violations.length > 0) {
      output.push(...result.verifier.protected_path_violations.map((entry) => `- protected: ${entry}`));
    }

    if (result.verifier.commands.length > 0) {
      output.push(
        ...result.verifier.commands.map(
          (command) =>
            `- ${command.result} | exit_code=${command.exit_code} | duration_ms=${command.duration_ms} | ${command.command}`
        )
      );
    }

    lines(output);
    return result.verifier.result === "pass" ? 0 : 1;
  } catch (checkError) {
    const message = checkError instanceof Error ? checkError.message : String(checkError);
    error(message);
    return 1;
  }
}
