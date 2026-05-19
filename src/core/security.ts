import * as fs from "node:fs";
import * as path from "node:path";
import { readAdapterProfile, listAdapterProfileIds } from "./agent-adapters";
import { DEFAULT_PROTECTED_PATHS, inspectCheckConfig } from "./checks";
import { detectGitRepository } from "./git";
import { detectInstalledLayer, getProductRoot } from "./install";

interface SecurityDoctorBase {
  cwd: string;
  gitAvailable: boolean;
  repositoryRoot?: string;
}

export interface ProductSecurityDoctorResult extends SecurityDoctorBase {
  repositoryRole: "product";
  installedLayer: "absent";
}

export interface InstalledSecurityAdapterSummary {
  agentId: string;
  transport: string;
  workingDirectoryPolicy: string;
  permissionMode: string;
  allowedRoles: string[];
  outputContract: string;
  timeoutSeconds: number;
  requiresHumanConfirmation: boolean;
}

export interface InstalledSecurityDoctorResult extends SecurityDoctorBase {
  repositoryRole: "installed_target";
  installedLayer: "present";
  protectedPaths: string[];
  protectedPathsSource: "default" | "configured";
  defaultProtectedPaths: string[];
  adapterProfiles: InstalledSecurityAdapterSummary[];
}

export type SecurityDoctorResult = ProductSecurityDoctorResult | InstalledSecurityDoctorResult;

function normalizePathForComparison(targetPath: string): string {
  let resolved: string;

  try {
    resolved = fs.realpathSync.native(targetPath);
  } catch {
    resolved = path.resolve(targetPath);
  }

  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isProductRepository(rootPath: string): boolean {
  return normalizePathForComparison(rootPath) === normalizePathForComparison(getProductRoot());
}

function classifyAdapterProfileError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("permission_mode")) {
    throw new Error(`Unclear permission state: ${message}`);
  }

  throw new Error(`Malformed adapter config: ${message}`);
}

export function runSecurityDoctor(cwd: string): SecurityDoctorResult {
  const gitStatus = detectGitRepository(cwd);

  if (!gitStatus.available) {
    throw new Error(`git is unavailable: ${gitStatus.error ?? "unknown error"}`);
  }

  if (!gitStatus.insideWorkTree || !gitStatus.rootPath) {
    throw new Error("This command must run inside a git repository.");
  }

  const repositoryRoot = gitStatus.rootPath;

  if (isProductRepository(repositoryRoot)) {
    return {
      cwd,
      gitAvailable: true,
      repositoryRoot,
      repositoryRole: "product",
      installedLayer: "absent"
    };
  }

  if (!detectInstalledLayer(repositoryRoot)) {
    throw new Error("Installed harness layer not found. Run `node bin/ch install` first.");
  }

  const checkConfig = inspectCheckConfig(repositoryRoot);
  const adapterProfiles = listAdapterProfileIds(repositoryRoot).map((agentId) => {
    try {
      const profile = readAdapterProfile(repositoryRoot, agentId);

      return {
        agentId,
        transport: profile.transport,
        workingDirectoryPolicy: profile.workingDirectoryPolicy,
        permissionMode: profile.permissionMode,
        allowedRoles: [...profile.allowedRoles],
        outputContract: profile.outputContract,
        timeoutSeconds: profile.timeoutSeconds,
        requiresHumanConfirmation: profile.requiresHumanConfirmation
      } satisfies InstalledSecurityAdapterSummary;
    } catch (profileError) {
      classifyAdapterProfileError(profileError);
    }
  });

  return {
    cwd,
    gitAvailable: true,
    repositoryRoot,
    repositoryRole: "installed_target",
    installedLayer: "present",
    protectedPaths: [...checkConfig.protectedPaths],
    protectedPathsSource: checkConfig.protectedPathsSource,
    defaultProtectedPaths: [...DEFAULT_PROTECTED_PATHS],
    adapterProfiles
  };
}
