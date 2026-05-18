import { installHooks } from "../core/hooks";
import { error, lines } from "../core/logger";

function printHooksHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch hooks --help",
    "  node bin/ch hooks install"
  ]);
}

export async function runHooks(args: string[]): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;

  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHooksHelp();
    return 0;
  }

  if (subcommand !== "install") {
    error(`Unknown hooks subcommand: ${subcommand}`);
    printHooksHelp();
    return 1;
  }

  if (subcommandArgs.length > 0) {
    error(`Unknown hooks argument(s): ${subcommandArgs.join(", ")}`);
    printHooksHelp();
    return 1;
  }

  try {
    const result = installHooks(process.cwd());
    const output = [
      "codex-harness hooks install",
      `target root: ${result.targetRoot}`
    ];

    if (!result.ok) {
      output.push("conflicts:");
      output.push(...result.conflicts.map((conflict) => `- ${conflict}`));
      lines(output);
      return 1;
    }

    if (result.created.length === 0) {
      output.push("status: already up to date");
    } else {
      output.push("status: hook install completed");
    }

    output.push("created:");
    output.push(...(result.created.length > 0 ? result.created : ["- none"]).map((item) => item.startsWith("- ") ? item : `- ${item}`));
    output.push("unchanged:");
    output.push(...(result.unchanged.length > 0 ? result.unchanged : ["- none"]).map((item) => item.startsWith("- ") ? item : `- ${item}`));
    lines(output);
    return 0;
  } catch (hooksError) {
    const message = hooksError instanceof Error ? hooksError.message : String(hooksError);
    error(message);
    return 1;
  }
}
