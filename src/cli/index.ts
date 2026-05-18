import { error, lines } from "../core/logger";
import { runAgent } from "./agent";
import { runDoctor } from "./doctor";
import { runInit } from "./init";
import { runInstall } from "./install";
import { runPrompt } from "./prompt";
import { runStatus } from "./status";
import { runWorktree } from "./worktree";

type CommandHandler = (args: string[]) => Promise<number>;

function printHelp(): void {
  lines([
    "codex-harness Phase 8 CLI",
    "",
    "Usage:",
    "  node bin/ch --help",
    "  node bin/ch agent record --role scout-tests --output sample.md",
    "  node bin/ch agent list",
    "  node bin/ch doctor",
    "  node bin/ch install",
    "  node bin/ch install --dry-run",
    "  node bin/ch status",
    "  node bin/ch init \"task title\"",
    "  node bin/ch init \"task title\" --dry-run",
    "  node bin/ch worktree",
    "  node bin/ch prompt plan",
    "  node bin/ch prompt work",
    "  node bin/ch prompt review",
    "  node bin/ch prompt scout --role tests",
    "",
    "Commands:",
    "  agent    Record and list Phase 8 agent ledger entries.",
    "  doctor   Report whether the current directory is inside a git repository.",
    "  install  Install or preview the Phase 2 harness layer.",
    "  status   List tasks from the installed Phase 3 task-state layer.",
    "  init     Create or preview a Phase 3 task folder.",
    "  worktree Create or reuse the Phase 4 task worktree.",
    "  prompt   Generate Phase 5 or Phase 7 task prompt files."
  ]);
}

function getCommandHandler(command: string): CommandHandler | undefined {
  switch (command) {
    case "doctor":
      return runDoctor;
    case "agent":
      return runAgent;
    case "install":
      return runInstall;
    case "status":
      return runStatus;
    case "init":
      return runInit;
    case "worktree":
      return runWorktree;
    case "prompt":
      return runPrompt;
    default:
      return undefined;
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h") || argv[0] === "help") {
    printHelp();
    return 0;
  }

  const [command, ...commandArgs] = argv;
  const handler = getCommandHandler(command);

  if (!handler) {
    error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }

  return handler(commandArgs);
}

if (require.main === module) {
  void main().then((code) => {
    process.exit(code);
  });
}
