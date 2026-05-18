import { error, lines } from "../core/logger";
import { cleanPlayground, initializePlayground } from "../core/eval-playground";
import { runPlaygroundSmoke } from "../core/eval-smoke";

type EvalAction = "init" | "smoke" | "clean";

function printEvalHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch eval playground init",
    "  node bin/ch eval playground init --root <path>",
    "  node bin/ch eval playground smoke",
    "  node bin/ch eval playground smoke --root <path>",
    "  node bin/ch eval playground clean",
    "  node bin/ch eval playground clean --root <path>"
  ]);
}

function parsePlaygroundArgs(args: string[]): { action?: EvalAction; root?: string; error?: string } {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    return {};
  }

  const [action, ...rest] = args;

  if (action !== "init" && action !== "smoke" && action !== "clean") {
    return { error: `Unknown eval playground action: ${action}` };
  }

  if (rest.length === 0) {
    return { action };
  }

  if (rest.length !== 2 || rest[0] !== "--root" || rest[1].trim().length === 0) {
    return { error: `Unknown eval playground argument(s): ${rest.join(", ")}` };
  }

  return {
    action,
    root: rest[1]
  };
}

export async function runEval(args: string[]): Promise<number> {
  const [scope, ...scopeArgs] = args;

  if (!scope || scope === "--help" || scope === "-h" || scope === "help") {
    printEvalHelp();
    return 0;
  }

  if (scope !== "playground") {
    error(`Unknown eval scope: ${scope}`);
    printEvalHelp();
    return 1;
  }

  const parsed = parsePlaygroundArgs(scopeArgs);

  if (!parsed.action && !parsed.error) {
    printEvalHelp();
    return 0;
  }

  if (parsed.error) {
    error(parsed.error);
    printEvalHelp();
    return 1;
  }

  try {
    if (parsed.action === "init") {
      const result = initializePlayground(process.cwd(), parsed.root);

      lines([
        "codex-harness eval playground init",
        `root: ${result.rootPath}`,
        `marker: ${result.markerPath}`,
        `corpus: ${result.corpusPath}`,
        `status: ${result.status === "initialized" ? "playground initialized" : "playground reinitialized"}`,
        ...result.seededProjects.map((project) => `- seeded: ${project}`)
      ]);

      return 0;
    }

    if (parsed.action === "smoke") {
      const result = runPlaygroundSmoke(process.cwd(), parsed.root);

      lines([
        "codex-harness eval playground smoke",
        `root: ${result.rootPath}`,
        `results: ${result.resultsPath}`,
        `passed: ${result.passed}`,
        `failed: ${result.failed}`,
        ...result.results.map(
          (record) =>
            `- ${record.task_id} | ${record.project} | ${record.category} | ${record.pass ? "pass" : "fail"}`
        )
      ]);

      return result.failed === 0 ? 0 : 1;
    }

    const result = cleanPlayground(process.cwd(), parsed.root);

    lines([
      "codex-harness eval playground clean",
      `root: ${result.rootPath}`,
      `status: ${result.removed ? "playground removed" : "no changes"}`
    ]);

    return 0;
  } catch (evalError) {
    const message = evalError instanceof Error ? evalError.message : String(evalError);
    error(message);
    return 1;
  }
}
