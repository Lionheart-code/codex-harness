import * as path from "node:path";
import { runStructuredCommand } from "./command-runner";
import { getProductRoot } from "./install";

interface EvalStepDefinition {
  name: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export interface EvalRegressionStepResult {
  name: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface EvalRegressionResult {
  productRoot: string;
  cwd: string;
  steps: EvalRegressionStepResult[];
}

function normalizePath(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function getNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function stringifyCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

export function runEvalRegression(cwd: string): EvalRegressionResult {
  const productRoot = getProductRoot();

  if (normalizePath(cwd) !== normalizePath(productRoot)) {
    throw new Error("Phase 20 bare `ch eval` must run from the codex-harness product repository root.");
  }

  const steps: EvalStepDefinition[] = [
    {
      name: "build",
      command: getNpmCommand(),
      args: ["run", "build"]
    },
    {
      name: "acceptance",
      command: process.execPath,
      args: [path.join("scripts", "run-acceptance.mjs")],
      env: {
        ...process.env,
        CODEX_HARNESS_EVAL_RUNNING: "1"
      }
    }
  ];

  const results: EvalRegressionStepResult[] = [];

  for (const step of steps) {
    const run = runStructuredCommand({
      command: step.command,
      args: step.args,
      cwd: productRoot,
      timeout_seconds: 3600,
      shell: false,
      env: step.env ?? process.env
    });

    if (run.spawnError) {
      throw new Error(run.spawnError);
    }

    const stepResult: EvalRegressionStepResult = {
      name: step.name,
      command: stringifyCommand(step.command, step.args),
      exitCode: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr
    };

    results.push(stepResult);

    if (stepResult.exitCode !== 0) {
      return {
        productRoot,
        cwd,
        steps: results
      };
    }
  }

  return {
    productRoot,
    cwd,
    steps: results
  };
}
