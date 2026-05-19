import { error, lines } from "../core/logger";
import { runAgent } from "./agent";
import { runCapture } from "./capture";
import { runCheck } from "./check";
import { runContext } from "./context";
import { runDebt } from "./debt";
import { runDecisions } from "./decisions";
import { runDoctor } from "./doctor";
import { runEval } from "./eval";
import { runGovernance } from "./governance";
import { runHooks } from "./hooks";
import { runInit } from "./init";
import { runInstall } from "./install";
import { runMemory } from "./memory";
import { runParallel } from "./parallel";
import { runPrompt } from "./prompt";
import { runReport } from "./report";
import { runReview } from "./review";
import { runSecurity } from "./security";
import { runSchema } from "./schema";
import { runStatus } from "./status";
import { runUpgrade } from "./upgrade";
import { runWorktree } from "./worktree";

type CommandHandler = (args: string[]) => Promise<number>;

function printHelp(): void {
  lines([
    "codex-harness Phase 20 CLI",
    "",
    "Usage:",
    "  node bin/ch --help",
    "  node bin/ch agent record --role scout-tests --output sample.md",
    "  node bin/ch agent list",
    "  node bin/ch agent prompt codex --role tests",
    "  node bin/ch agent run codex --role tests",
    "  node bin/ch capture",
    "  node bin/ch check",
    "  node bin/ch review",
    "  node bin/ch review --exec",
    "  node bin/ch report",
    "  node bin/ch schema --help",
    "  node bin/ch schema validate",
    "  node bin/ch schema migrate --dry-run",
    "  node bin/ch schema migrate",
    "  node bin/ch hooks --help",
    "  node bin/ch hooks install",
    "  node bin/ch memory status",
    "  node bin/ch debt add --title \"test debt\" --type technical --severity low --reason \"test\"",
    "  node bin/ch debt list",
    "  node bin/ch debt resolve --id DEBT-0001",
    "  node bin/ch decisions add --title \"test decision\" --reason \"test\"",
    "  node bin/ch decisions list",
    "  node bin/ch doctor",
    "  node bin/ch doctor --help",
    "  node bin/ch doctor --all",
    "  node bin/ch security --help",
    "  node bin/ch security doctor",
    "  node bin/ch context --help",
    "  node bin/ch context inspect plan",
    "  node bin/ch context inspect work",
    "  node bin/ch context inspect review",
    "  node bin/ch context inspect scout --role tests",
    "  node bin/ch eval",
    "  node bin/ch eval playground init",
    "  node bin/ch eval playground smoke",
    "  node bin/ch eval playground clean",
    "  node bin/ch governance --help",
    "  node bin/ch parallel --help",
    "  node bin/ch install",
    "  node bin/ch install --dry-run",
    "  node bin/ch upgrade --help",
    "  node bin/ch upgrade --dry-run",
    "  node bin/ch upgrade",
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
    "  agent    Record, prompt, run, and list bounded agent ledger entries.",
    "  capture  Capture the current task worktree git status and diff.",
    "  check    Run deterministic checks and write verifier artifacts.",
    "  review   Validate or generate a Phase 14 review artifact.",
    "  report   Generate a deterministic task handoff report.",
    "  schema   Validate or migrate Phase 19 machine-readable artifacts.",
    "  hooks    Install minimal Codex sidecar hooks and templates.",
    "  security Audit the current implemented security and permission posture.",
    "  context  Inspect the current prompt context inputs without writing files.",
    "  memory   Show Phase 9 memory, debt, decision, and agent-output status.",
    "  debt     Add, list, and resolve Phase 9 debt ledger items.",
    "  decisions Add and list Phase 9 decision records.",
    "  doctor   Report whether the current directory is inside a git repository.",
    "  eval     Run deterministic local regression checks or manage the Phase 15 playground.",
    "  governance Run Phase 17 harness governance review, proposal, metrics, and status commands.",
    "  parallel Manage the Phase 16 opt-in parallel worktree scaffold.",
    "  install  Install or preview the Phase 2 harness layer.",
    "  upgrade  Upgrade or preview the installed Phase 18 harness layer.",
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
    case "security":
      return runSecurity;
    case "context":
      return runContext;
    case "eval":
      return runEval;
    case "governance":
      return runGovernance;
    case "parallel":
      return runParallel;
    case "agent":
      return runAgent;
    case "capture":
      return runCapture;
    case "check":
      return runCheck;
    case "review":
      return runReview;
    case "report":
      return runReport;
    case "schema":
      return runSchema;
    case "hooks":
      return runHooks;
    case "memory":
      return runMemory;
    case "debt":
      return runDebt;
    case "decisions":
      return runDecisions;
    case "install":
      return runInstall;
    case "upgrade":
      return runUpgrade;
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
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
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
