import { spawnSync } from "node:child_process";

export interface GitRepositoryStatus {
  available: boolean;
  insideWorkTree: boolean;
  rootPath?: string;
  error?: string;
}

export function detectGitRepository(cwd: string): GitRepositoryStatus {
  const insideProbe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    encoding: "utf8",
    shell: false
  });

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

  const rootProbe = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    shell: false
  });

  return {
    available: true,
    insideWorkTree: true,
    rootPath: rootProbe.status === 0 ? rootProbe.stdout.trim() : undefined,
    error: rootProbe.status === 0 ? undefined : rootProbe.stderr.trim() || undefined
  };
}
