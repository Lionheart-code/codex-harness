import { error, lines } from "../core/logger";
import { runDoctor } from "./doctor";
import { runInit } from "./init";
import { runInstall } from "./install";

type CommandHandler = (args: string[]) => Promise<number>;

function printHelp(): void {
  lines([
    "codex-harness Phase 1 CLI",
    "",
    "Usage:",
    "  node bin/ch --help",
    "  node bin/ch doctor",
    "  node bin/ch install --dry-run",
    "  node bin/ch init \"task title\" --dry-run",
    "",
    "Commands:",
    "  doctor   Report whether the current directory is inside a git repository.",
    "  install  Show the Phase 2 install plan. Dry-run only in Phase 1.",
    "  init     Show the Phase 3 task scaffold plan. Dry-run only in Phase 1."
  ]);
}

function getCommandHandler(command: string): CommandHandler | undefined {
  switch (command) {
    case "doctor":
      return runDoctor;
    case "install":
      return runInstall;
    case "init":
      return runInit;
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
