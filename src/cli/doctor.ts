import * as fs from "node:fs";
import * as path from "node:path";
import { inspectCheckConfig } from "../core/checks";
import { detectInstalledLayer, readInstallMetadataFromTarget } from "../core/install";
import { detectGitRepository } from "../core/git";
import { error, lines } from "../core/logger";
import { getProjectRegistryPath, loadProjectRegistry } from "../core/registry";

function normalizePathForComparison(targetPath: string): string {
  let resolved: string;

  try {
    resolved = fs.realpathSync.native(targetPath);
  } catch {
    resolved = path.resolve(targetPath);
  }

  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function printDoctorHelp(): void {
  lines([
    "Usage:",
    "  node bin/ch doctor",
    "  node bin/ch doctor --help",
    "  node bin/ch doctor --all",
    "  node bin/ch doctor platform",
    "  node bin/ch doctor commands"
  ]);
}

function getNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runLocalDoctor(): number {
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
      output.push(
        `installed layer: ${detectInstalledLayer(result.rootPath) ? "present" : "absent"}`
      );
      output.push(`harness path: ${path.join(result.rootPath, ".harness")}`);
    }
  } else {
    output.push("repository: not inside a git work tree");
    output.push("installed layer: unavailable");
  }

  lines(output);
  return 0;
}

function runDoctorAll(): number {
  const registryPath = getProjectRegistryPath();
  const registry = loadProjectRegistry();
  const output = ["codex-harness doctor --all", `registry: ${registryPath}`];

  if (!registry || registry.projects.length === 0) {
    output.push("projects: 0");
    output.push("installed: 0");
    output.push("warnings: 0");
    output.push("status: no registered projects");
    lines(output);
    return 0;
  }

  const warnings: string[] = [];
  const projectLines: string[] = [];
  const seen = new Set<string>();
  let installedCount = 0;

  for (const entry of registry.projects) {
    const normalizedRoot = normalizePathForComparison(entry.root_path);

    if (seen.has(normalizedRoot)) {
      warnings.push(`Duplicate registry entry: ${entry.root_path}`);
      continue;
    }

    seen.add(normalizedRoot);

    if (!fs.existsSync(entry.root_path)) {
      warnings.push(`Registered path is missing: ${entry.root_path}`);
      projectLines.push(`- ${entry.root_path} | status=missing`);
      continue;
    }

    if (!fs.statSync(entry.root_path).isDirectory()) {
      warnings.push(`Registered path is not a directory: ${entry.root_path}`);
      projectLines.push(`- ${entry.root_path} | status=not-directory`);
      continue;
    }

    const gitStatus = detectGitRepository(entry.root_path);

    if (!gitStatus.available) {
      warnings.push(`git is unavailable for registry entry: ${entry.root_path}`);
      projectLines.push(`- ${entry.root_path} | status=git-unavailable`);
      continue;
    }

    if (!gitStatus.insideWorkTree || !gitStatus.rootPath) {
      warnings.push(`Registered path is not inside a git work tree: ${entry.root_path}`);
      projectLines.push(`- ${entry.root_path} | status=not-git`);
      continue;
    }

    const targetRoot = gitStatus.rootPath;

    if (!detectInstalledLayer(targetRoot)) {
      warnings.push(`Registered path is not an installed harness repository: ${targetRoot}`);
      projectLines.push(`- ${targetRoot} | status=not-installed`);
      continue;
    }

    const metadata = readInstallMetadataFromTarget(targetRoot);

    if (!metadata) {
      warnings.push(`Installed metadata is unreadable: ${targetRoot}`);
      projectLines.push(`- ${targetRoot} | status=invalid-install-metadata`);
      continue;
    }

    installedCount += 1;
    projectLines.push(
      `- ${targetRoot} | status=installed | harness_version=${metadata.harness_version} | templates_version=${metadata.templates_version}`
    );
  }

  output.push(`projects: ${registry.projects.length}`);
  output.push(`installed: ${installedCount}`);
  output.push(`warnings: ${warnings.length}`);
  output.push("entries:");
  output.push(...projectLines);

  if (warnings.length > 0) {
    output.push("warning details:");
    output.push(...warnings.map((warning) => `- ${warning}`));
  }

  lines(output);
  return 0;
}

function runDoctorPlatform(): number {
  const result = detectGitRepository(process.cwd());
  const output = [
    "codex-harness doctor platform",
    `cwd: ${process.cwd()}`,
    `platform: ${process.platform}`,
    `arch: ${process.arch}`,
    `node: ${process.version}`,
    `path_separator: ${path.sep}`,
    `npm_command: ${getNpmCommand()}`
  ];

  if (!result.available) {
    output.push("git: unavailable");
    output.push(`repository: unknown (${result.error ?? "git command failed"})`);
    output.push("installed layer: unavailable");
    lines(output);
    return 0;
  }

  output.push("git: available");

  if (!result.insideWorkTree || !result.rootPath) {
    output.push("repository: not inside a git work tree");
    output.push("installed layer: unavailable");
    lines(output);
    return 0;
  }

  output.push("repository: inside git work tree");
  output.push(`root: ${result.rootPath}`);
  output.push(`installed layer: ${detectInstalledLayer(result.rootPath) ? "present" : "absent"}`);
  lines(output);
  return 0;
}

function runDoctorCommands(): number {
  const result = detectGitRepository(process.cwd());
  const output = [
    "codex-harness doctor commands",
    "checks config support: legacy [checks].commands + structured [[checks.commands]]",
    "legacy execution mode: shell=false tokenized argv only",
    "legacy shell syntax: blocked fail-closed",
    "structured shell default: false",
    "structured shell opt-in: shell = true",
    "acceptance runner: scripts/run-acceptance.mjs",
    "npm test: node scripts/run-acceptance.mjs",
    "npm run test:acceptance: node scripts/run-acceptance.mjs",
    "bare eval acceptance delegation: node scripts/run-acceptance.mjs"
  ];

  if (!result.available || !result.insideWorkTree || !result.rootPath) {
    output.push("configured checks: unavailable");
    lines(output);
    return 0;
  }

  if (!detectInstalledLayer(result.rootPath)) {
    output.push("configured checks: unavailable (installed layer absent)");
    lines(output);
    return 0;
  }

  const config = inspectCheckConfig(result.rootPath);
  output.push(`configured checks format: ${config.commandsFormat}`);
  output.push(`configured checks commands: ${config.commands.length}`);
  output.push(`protected paths source: ${config.protectedPathsSource}`);
  lines(output);
  return 0;
}

export async function runDoctor(args: string[]): Promise<number> {
  if (args.length === 0) {
    return runLocalDoctor();
  }

  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h" || args[0] === "help")) {
    printDoctorHelp();
    return 0;
  }

  if (args.length === 1 && args[0] === "--all") {
    try {
      return runDoctorAll();
    } catch (doctorError) {
      const message = doctorError instanceof Error ? doctorError.message : String(doctorError);
      error(message);
      return 1;
    }
  }

  if (args.length === 1 && args[0] === "platform") {
    try {
      return runDoctorPlatform();
    } catch (doctorError) {
      const message = doctorError instanceof Error ? doctorError.message : String(doctorError);
      error(message);
      return 1;
    }
  }

  if (args.length === 1 && args[0] === "commands") {
    try {
      return runDoctorCommands();
    } catch (doctorError) {
      const message = doctorError instanceof Error ? doctorError.message : String(doctorError);
      error(message);
      return 1;
    }
  }

  error(`Unknown doctor argument(s): ${args.join(", ")}`);
  printDoctorHelp();
  return 1;
}
