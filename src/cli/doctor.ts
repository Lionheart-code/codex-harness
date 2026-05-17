import { detectGitRepository } from "../core/git";
import { lines } from "../core/logger";

export async function runDoctor(_args: string[]): Promise<number> {
  const result = detectGitRepository(process.cwd());
  const output = ["codex-harness doctor", `cwd: ${process.cwd()}`];

  if (!result.available) {
    output.push("git: unavailable");
    output.push(`repository: unknown (${result.error ?? "git command failed"})`);
    lines(output);
    return 0;
  }

  output.push("git: available");

  if (result.insideWorkTree) {
    output.push("repository: inside git work tree");

    if (result.rootPath) {
      output.push(`root: ${result.rootPath}`);
    }
  } else {
    output.push("repository: not inside a git work tree");
  }

  lines(output);
  return 0;
}
