import * as path from "node:path";
import { spawnSync } from "node:child_process";

export interface GitRepositoryStatus {
  available: boolean;
  insideWorkTree: boolean;
  rootPath?: string;
  commonDir?: string;
  canonicalRootPath?: string;
  error?: string;
}

export interface GitCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export function runGitCommand(cwd: string, args: string[]): GitCommandResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error
  };
}

function extractStatusPaths(line: string): string[] {
  const rawPath = line.slice(3).trim();
  const renameSeparator = " -> ";
  const renameIndex = rawPath.indexOf(renameSeparator);

  if (renameIndex >= 0) {
    return [
      rawPath.slice(0, renameIndex),
      rawPath.slice(renameIndex + renameSeparator.length)
    ];
  }

  return [rawPath];
}

export function getGitStatusLines(cwd: string): string[] {
  const result = runGitCommand(cwd, ["status", "--porcelain", "--untracked-files=all"]);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git status failed");
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

export function getGitDiffPatch(cwd: string): string {
  const result = runGitCommand(cwd, ["diff", "--no-ext-diff", "--binary", "HEAD", "--"]);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git diff failed");
  }

  return result.stdout;
}

export function getGitStatusPaths(statusLines: string[]): string[] {
  return statusLines.flatMap((line) => extractStatusPaths(line));
}

export function detectGitRepository(cwd: string): GitRepositoryStatus {
  const insideProbe = runGitCommand(cwd, ["rev-parse", "--is-inside-work-tree"]);

  if (insideProbe.error) {
    return {
      available: false,
      insideWorkTree: false,
      error: insideProbe.error.message
    };
  }

  if (insideProbe.status !== 0 || insideProbe.stdout.trim() !== "true") {
    return {
      available: true,
      insideWorkTree: false,
      error: insideProbe.stderr.trim() || undefined
    };
  }

  const rootProbe = runGitCommand(cwd, ["rev-parse", "--show-toplevel"]);
  const commonDirProbe = runGitCommand(cwd, ["rev-parse", "--git-common-dir"]);
  const commonDir = commonDirProbe.status === 0 ? commonDirProbe.stdout.trim() : undefined;
  const rootPath = rootProbe.status === 0 ? rootProbe.stdout.trim() : undefined;
  const canonicalRootPath = commonDir && rootPath
    ? resolveCanonicalRootPath(rootPath, commonDir)
    : rootPath;

  return {
    available: true,
    insideWorkTree: true,
    rootPath,
    commonDir,
    canonicalRootPath,
    error: rootProbe.status === 0 ? undefined : rootProbe.stderr.trim() || undefined
  };
}

function resolveCanonicalRootPath(rootPath: string, commonDir: string): string {
  const absoluteCommonDir = commonDir.startsWith(".")
    ? path.resolve(rootPath, commonDir)
    : commonDir;
  const normalized = absoluteCommonDir.replace(/[\\/]+$/, "");

  if (normalized.endsWith("/.git") || normalized.endsWith("\\.git")) {
    return path.dirname(normalized);
  }

  return rootPath;
}

export function hasValidHead(cwd: string): boolean {
  return runGitCommand(cwd, ["rev-parse", "--verify", "HEAD"]).status === 0;
}

function isHarnessManagedPath(relativePath: string): boolean {
  return (
    relativePath === "AGENTS.md" ||
    relativePath === ".harness" ||
    relativePath.startsWith(".harness/") ||
    relativePath.startsWith(".harness\\")
  );
}

export function isSourceCheckoutDirty(cwd: string): boolean {
  return getGitStatusLines(cwd)
    .flatMap((line) => extractStatusPaths(line))
    .some((relativePath) => !isHarnessManagedPath(relativePath));
}

export function worktreePathExistsInGit(cwd: string, targetPath: string): boolean {
  const normalizeWorktreePath = (value: string): string => {
    const normalized = value.replace(/[\\/]+/g, "/");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  const normalizedTarget = normalizeWorktreePath(targetPath);
  const result = runGitCommand(cwd, ["worktree", "list", "--porcelain"]);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git worktree list failed");
  }

  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .map((worktreePath) => normalizeWorktreePath(worktreePath))
    .includes(normalizedTarget);
}
