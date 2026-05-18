import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { LOCAL_SMOKE_TASK_IDS, type EvalCorpusEntry, getLocalSmokeEntries } from "./eval-corpus";
import {
  createTaskId,
  PLAYGROUND_MARKER_FILE,
  PLAYGROUND_SMOKE_RESULTS_FILE,
  TASK_DIFF_FILE,
  TASK_RESULT_FILE,
  TASK_VERIFIER_FILE
} from "./paths";
import { getPlaygroundProjectPath, requireManagedPlayground, type PlaygroundProjectName } from "./eval-playground";

interface CommandExecution {
  status: number;
  stdout: string;
  stderr: string;
}

interface ScenarioMetrics {
  failedChecks: number;
  unsafeCommandBlocks: number;
  abandonedWorktree: boolean;
}

export interface SmokeResultRecord {
  task_id: string;
  project: string;
  category: string;
  mode: "local_deterministic_smoke";
  pass: boolean;
  time_to_ready_ms: number;
  manual_interventions: number;
  failed_checks: number;
  unsafe_command_blocks: number;
  abandoned_worktree: boolean;
  review_usefulness: null;
  cost_limit_pressure_by_agent_role: null;
}

export interface PlaygroundSmokeResult {
  productRoot: string;
  rootPath: string;
  resultsPath: string;
  results: SmokeResultRecord[];
  passed: number;
  failed: number;
}

class SmokeScenarioError extends Error {
  failedChecks: number;
  unsafeCommandBlocks: number;
  abandonedWorktree: boolean;

  constructor(
    message: string,
    metrics: {
      failedChecks?: number;
      unsafeCommandBlocks?: number;
      abandonedWorktree?: boolean;
    } = {}
  ) {
    super(message);
    this.failedChecks = metrics.failedChecks ?? 1;
    this.unsafeCommandBlocks = metrics.unsafeCommandBlocks ?? 0;
    this.abandonedWorktree = metrics.abandonedWorktree ?? false;
  }
}

function getCliPath(productRoot: string): string {
  return path.join(productRoot, "bin", "ch");
}

function runHarnessCli(
  productRoot: string,
  cwd: string,
  args: string[],
  input?: string
): CommandExecution {
  const result = spawnSync(process.execPath, [getCliPath(productRoot), ...args], {
    cwd,
    encoding: "utf8",
    input,
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function runHarnessCliOrThrow(productRoot: string, cwd: string, args: string[], input?: string): CommandExecution {
  const result = runHarnessCli(productRoot, cwd, args, input);

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: node ${getCliPath(productRoot)} ${args.join(" ")}`,
        `cwd: ${cwd}`,
        "stdout:",
        result.stdout || "(none)",
        "stderr:",
        result.stderr || "(none)"
      ].join("\n")
    );
  }

  return result;
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readText(filePath)) as T;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function replaceChecksSection(content: string, commands: string[]): string {
  const nextSection = [
    "[checks]",
    `commands = ${JSON.stringify(commands)}`,
    ""
  ].join("\n");

  if (/\[checks\]\r?\ncommands = \[[^\n]*\]\r?\n/.test(content)) {
    return content.replace(/\[checks\]\r?\ncommands = \[[^\n]*\]\r?\n/, nextSection);
  }

  throw new Error("Unable to locate the [checks] section in .harness/config.toml.");
}

function updateCheckCommands(repoRoot: string, commands: string[]): void {
  const configPath = path.join(repoRoot, ".harness", "config.toml");
  const current = readText(configPath);
  writeText(configPath, replaceChecksSection(current, commands));
}

function getTaskRoot(repoRoot: string, title: string): { taskId: string; taskRoot: string } {
  const taskId = createTaskId(title);

  return {
    taskId,
    taskRoot: path.join(repoRoot, ".harness", "tasks", taskId)
  };
}

function readWorktreePath(taskRoot: string): string {
  return readText(path.join(taskRoot, "worktree.txt")).trim();
}

function assertTaskArtifacts(taskRoot: string): void {
  for (const artifact of [TASK_DIFF_FILE, TASK_VERIFIER_FILE, TASK_RESULT_FILE]) {
    const artifactPath = path.join(taskRoot, artifact);

    if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
      throw new Error(`Expected task artifact to exist: ${artifactPath}`);
    }
  }
}

function countFailedChecks(taskRoot: string): number {
  const verifier = readJson<{
    result: string;
    commands: Array<{ result: string }>;
    protected_path_violations: string[];
  }>(path.join(taskRoot, TASK_VERIFIER_FILE));

  if (verifier.result !== "pass") {
    const commandFailures = verifier.commands.filter((command) => command.result === "fail").length;
    return commandFailures + verifier.protected_path_violations.length;
  }

  return 0;
}

function runScenario(entry: EvalCorpusEntry, run: () => ScenarioMetrics): SmokeResultRecord {
  const startedAt = Date.now();

  try {
    const metrics = run();

    return {
      task_id: entry.task_id,
      project: entry.project,
      category: entry.category,
      mode: "local_deterministic_smoke",
      pass: true,
      time_to_ready_ms: Date.now() - startedAt,
      manual_interventions: 0,
      failed_checks: metrics.failedChecks,
      unsafe_command_blocks: metrics.unsafeCommandBlocks,
      abandoned_worktree: metrics.abandonedWorktree,
      review_usefulness: null,
      cost_limit_pressure_by_agent_role: null
    };
  } catch (scenarioError) {
    const error =
      scenarioError instanceof SmokeScenarioError
        ? scenarioError
        : new SmokeScenarioError(
            scenarioError instanceof Error ? scenarioError.message : String(scenarioError)
          );

    return {
      task_id: entry.task_id,
      project: entry.project,
      category: entry.category,
      mode: "local_deterministic_smoke",
      pass: false,
      time_to_ready_ms: Date.now() - startedAt,
      manual_interventions: 0,
      failed_checks: error.failedChecks,
      unsafe_command_blocks: error.unsafeCommandBlocks,
      abandoned_worktree: error.abandonedWorktree,
      review_usefulness: null,
      cost_limit_pressure_by_agent_role: null
    };
  }
}

function runLifecycleTaskScenario(
  productRoot: string,
  repoRoot: string,
  entry: EvalCorpusEntry,
  taskType: "bugfix" | "feature" | "docs",
  checkCommand: string,
  editWorktree: (worktreePath: string) => void
): ScenarioMetrics {
  let worktreePath = "";

  try {
    runHarnessCliOrThrow(productRoot, repoRoot, ["install"]);
    runHarnessCliOrThrow(productRoot, repoRoot, ["init", entry.title, "--type", taskType]);
    runHarnessCliOrThrow(productRoot, repoRoot, ["worktree"]);

    const { taskId, taskRoot } = getTaskRoot(repoRoot, entry.title);

    if (taskId !== entry.task_id) {
      throw new Error(`Scenario task_id mismatch. Expected ${entry.task_id}, received ${taskId}.`);
    }

    worktreePath = readWorktreePath(taskRoot);
    editWorktree(worktreePath);
    updateCheckCommands(repoRoot, [checkCommand]);
    runHarnessCliOrThrow(productRoot, repoRoot, ["capture"]);
    runHarnessCliOrThrow(productRoot, repoRoot, ["check"]);
    runHarnessCliOrThrow(productRoot, repoRoot, ["report"]);
    assertTaskArtifacts(taskRoot);

    return {
      failedChecks: countFailedChecks(taskRoot),
      unsafeCommandBlocks: 0,
      abandonedWorktree: false
    };
  } catch (scenarioError) {
    throw new SmokeScenarioError(
      scenarioError instanceof Error ? scenarioError.message : String(scenarioError),
      {
        failedChecks: 1,
        unsafeCommandBlocks: 0,
        abandonedWorktree: worktreePath.length > 0 && fs.existsSync(worktreePath)
      }
    );
  }
}

function runSafetyLifecycleScenario(productRoot: string, rootPath: string): ScenarioMetrics {
  let unsafeCommandBlocks = 0;

  try {
    const idempotentRoot = path.join(rootPath, "managed-idempotent-target");
    const unmanagedInitRoot = path.join(rootPath, "unmanaged-init-target");
    const managedCleanRoot = path.join(rootPath, "managed-clean-target");
    const unmanagedCleanRoot = path.join(rootPath, "unmanaged-clean-target");

    runHarnessCliOrThrow(productRoot, productRoot, ["eval", "playground", "init", "--root", idempotentRoot]);
    runHarnessCliOrThrow(productRoot, productRoot, ["eval", "playground", "init", "--root", idempotentRoot]);

    const markerPath = path.join(idempotentRoot, PLAYGROUND_MARKER_FILE);

    if (!fs.existsSync(markerPath)) {
      throw new Error(`Managed idempotent playground marker was not created: ${markerPath}`);
    }

    fs.mkdirSync(unmanagedInitRoot, { recursive: true });
    writeText(path.join(unmanagedInitRoot, "keep.txt"), "unmanaged\n");

    const unmanagedInitResult = runHarnessCli(
      productRoot,
      productRoot,
      ["eval", "playground", "init", "--root", unmanagedInitRoot]
    );

    if (unmanagedInitResult.status === 0 || !/Refusing to initialize a non-empty unmanaged playground target/.test(unmanagedInitResult.stderr)) {
      throw new Error("Expected playground init to refuse a non-empty unmanaged target.");
    }

    const repoRoot = path.join(idempotentRoot, "python-app");
    runHarnessCliOrThrow(productRoot, repoRoot, ["install"]);
    runHarnessCliOrThrow(productRoot, repoRoot, ["init", "Safety hook task"]);
    runHarnessCliOrThrow(productRoot, repoRoot, ["worktree"]);
    runHarnessCliOrThrow(productRoot, repoRoot, ["hooks", "install"]);

    const hookPath = path.join(repoRoot, ".codex", "hooks", "pre-tool-use.cjs");
    const dangerousPayload = JSON.stringify({ command: "git reset --hard HEAD" });
    const dangerousResult = spawnSync(process.execPath, [hookPath], {
      cwd: repoRoot,
      encoding: "utf8",
      input: dangerousPayload,
      shell: false
    });

    if ((dangerousResult.status ?? 1) === 0 || !/blocked dangerous shell\/git command/i.test(dangerousResult.stderr ?? "")) {
      throw new Error("Expected the installed pre-tool hook to block a dangerous command.");
    }

    unsafeCommandBlocks += 1;

    runHarnessCliOrThrow(productRoot, productRoot, ["eval", "playground", "init", "--root", managedCleanRoot]);

    if (!fs.existsSync(managedCleanRoot)) {
      throw new Error(`Managed clean target was not created: ${managedCleanRoot}`);
    }

    runHarnessCliOrThrow(productRoot, productRoot, ["eval", "playground", "clean", "--root", managedCleanRoot]);

    if (fs.existsSync(managedCleanRoot)) {
      throw new Error(`Managed clean target was not removed: ${managedCleanRoot}`);
    }

    fs.mkdirSync(unmanagedCleanRoot, { recursive: true });
    writeText(path.join(unmanagedCleanRoot, "keep.txt"), "unmanaged-clean\n");

    const unmanagedCleanResult = runHarnessCli(
      productRoot,
      productRoot,
      ["eval", "playground", "clean", "--root", unmanagedCleanRoot]
    );

    if (unmanagedCleanResult.status === 0 || !/Refusing to clean an unmanaged playground root/.test(unmanagedCleanResult.stderr)) {
      throw new Error("Expected playground clean to refuse an unmanaged target.");
    }

    if (!fs.existsSync(unmanagedCleanRoot)) {
      throw new Error(`Unmanaged clean target should remain after refusal: ${unmanagedCleanRoot}`);
    }

    return {
      failedChecks: 0,
      unsafeCommandBlocks,
      abandonedWorktree: false
    };
  } catch (scenarioError) {
    throw new SmokeScenarioError(
      scenarioError instanceof Error ? scenarioError.message : String(scenarioError),
      {
        failedChecks: 0,
        unsafeCommandBlocks,
        abandonedWorktree: false
      }
    );
  }
}

export function runPlaygroundSmoke(cwd: string, explicitRoot?: string): PlaygroundSmokeResult {
  const { productRoot, rootPath } = requireManagedPlayground(cwd, explicitRoot);
  const entries = getLocalSmokeEntries();

  if (entries.length !== LOCAL_SMOKE_TASK_IDS.length) {
    throw new Error(`Local smoke scenario count mismatch. Expected ${LOCAL_SMOKE_TASK_IDS.length}, received ${entries.length}.`);
  }

  const results = [
    runScenario(entries[0], () => {
      const repoRoot = getPlaygroundProjectPath(rootPath, "python-app");

      return runLifecycleTaskScenario(
        productRoot,
        repoRoot,
        entries[0],
        "bugfix",
        "node verify.mjs bugfix",
        (worktreePath) => {
          const appPath = path.join(worktreePath, "app.py");
          writeText(appPath, readText(appPath).replace('"Helo, "', '"Hello, "'));
        }
      );
    }),
    runScenario(entries[1], () => {
      const repoRoot = getPlaygroundProjectPath(rootPath, "ts-app");

      return runLifecycleTaskScenario(
        productRoot,
        repoRoot,
        entries[1],
        "feature",
        "node verify.mjs feature",
        (worktreePath) => {
          const featurePath = path.join(worktreePath, "src", "feature.ts");
          writeText(
            featurePath,
            [
              "export function buildGreeting(name: string): string {",
              "  return `Hello, ${name}!`;",
              "}",
              ""
            ].join("\n")
          );
        }
      );
    }),
    runScenario(entries[2], () => {
      const docsRoot = path.join(rootPath, "docs-scenario-target");

      runHarnessCliOrThrow(productRoot, productRoot, ["eval", "playground", "init", "--root", docsRoot]);

      const repoRoot = getPlaygroundProjectPath(docsRoot, "ts-app");

      return runLifecycleTaskScenario(
        productRoot,
        repoRoot,
        entries[2],
        "docs",
        "node verify.mjs docs",
        (worktreePath) => {
          const readmePath = path.join(worktreePath, "README.md");
          writeText(
            readmePath,
            `${readText(readmePath).trimEnd()}\n\n## Usage\n\nRun the sample checks with \`node verify.mjs docs\`.\n`
          );
        }
      );
    }),
    runScenario(entries[3], () => runSafetyLifecycleScenario(productRoot, rootPath))
  ];
  const resultsPath = path.join(rootPath, PLAYGROUND_SMOKE_RESULTS_FILE);
  const summary = {
    mode: "local_deterministic_smoke",
    generated_at: new Date().toISOString(),
    results
  };

  writeText(resultsPath, `${JSON.stringify(summary, null, 2)}\n`);

  return {
    productRoot,
    rootPath,
    resultsPath,
    results,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length
  };
}
