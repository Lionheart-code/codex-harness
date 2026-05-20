import { spawnSync } from "node:child_process";

export interface StructuredCommandSpec {
  command: string;
  args: string[];
  cwd: string;
  timeout_seconds: number;
  shell: boolean;
  env?: NodeJS.ProcessEnv;
  capture_stdout?: boolean;
  capture_stderr?: boolean;
}

export interface StructuredCommandResult {
  command: string;
  args: string[];
  cwd: string;
  shell: boolean;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: string;
  spawnError?: string;
}

export function formatCommandForDisplay(command: string, args: string[]): string {
  return [command, ...args].map((segment) => (/\s/.test(segment) ? JSON.stringify(segment) : segment)).join(" ");
}

function quoteForPosixShell(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quoteForWindowsShell(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

function formatCommandForShell(command: string, args: string[]): string {
  const quote = process.platform === "win32" ? quoteForWindowsShell : quoteForPosixShell;
  return [command, ...args].map((segment) => quote(segment)).join(" ");
}

export function runStructuredCommand(spec: StructuredCommandSpec): StructuredCommandResult {
  const startedAt = Date.now();
  const result = spec.shell
    ? spawnSync(formatCommandForShell(spec.command, spec.args), {
        cwd: spec.cwd,
        encoding: "utf8",
        env: spec.env ?? process.env,
        shell: true,
        timeout: spec.timeout_seconds * 1000
      })
    : spawnSync(spec.command, spec.args, {
        cwd: spec.cwd,
        encoding: "utf8",
        env: spec.env ?? process.env,
        shell: false,
        timeout: spec.timeout_seconds * 1000
      });
  const durationMs = Date.now() - startedAt;
  const spawnError = result.error ? result.error.message : undefined;
  const timedOut =
    (result.error instanceof Error && "code" in result.error && result.error.code === "ETIMEDOUT") ||
    (typeof result.signal === "string" && result.signal.length > 0 && result.status === null);

  return {
    command: spec.command,
    args: [...spec.args],
    cwd: spec.cwd,
    shell: spec.shell,
    exitCode: result.status ?? 1,
    durationMs,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? result.error.message : ""),
    timedOut,
    signal: result.signal ?? "",
    spawnError
  };
}
