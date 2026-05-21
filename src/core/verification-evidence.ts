import * as fs from "node:fs";
import * as path from "node:path";
import {
  getGitDiffPatch,
  getGitStatusLines,
  getGitStatusPaths,
  runGitCommand
} from "./git";
import { ArtifactStore } from "./artifact-store";
import { MemoryEvidenceStore, buildDefaultEvidenceScope } from "./evidence-store";
import {
  type ChangeClassification,
  type ChangeSetFingerprint,
  type EvidenceScope,
  type LocalVerificationReuseStatus,
  type VerificationCommandResultEvidence,
  type VerificationCommandSpec,
  type VerificationReuseDecision,
  type VerifiedSnapshot,
  buildScopedHash,
  buildTargetProjectId,
  canonicalJson,
  sha256Hex,
  toPortablePath
} from "./evidence-types";

export interface CaptureVerifiedSnapshotInput {
  targetRoot: string;
  namespace?: string;
  commands: VerificationCommandSpec[];
  commandResults?: VerificationCommandResultEvidence[];
  timestamp?: string;
}

export interface SnapshotReuseResult {
  decision: VerificationReuseDecision;
  reusableSnapshot?: VerifiedSnapshot;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readGitValue(targetRoot: string, args: string[]): string | undefined {
  const result = runGitCommand(targetRoot, args);

  if (result.status !== 0 || result.error) {
    return undefined;
  }

  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

function normalizeRepoPath(value: string): string {
  return toPortablePath(value).replace(/^\.\/+/, "");
}

function isPrivateGeneratedPath(relativePath: string): boolean {
  const normalized = normalizeRepoPath(relativePath);
  return (
    normalized === ".harness" ||
    normalized === ".codex" ||
    normalized === ".agents" ||
    normalized.startsWith(".harness/") ||
    normalized.startsWith(".codex/") ||
    normalized.startsWith(".agents/")
  );
}

function classifyStatusLine(line: string): { code: string; path: string } {
  return {
    code: line.slice(0, 2),
    path: normalizeRepoPath(line.slice(3).trim())
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function hashFile(targetRoot: string, relativePath: string): string {
  const absolutePath = path.join(targetRoot, relativePath);
  return sha256Hex(fs.readFileSync(absolutePath));
}

function classifyPath(relativePath: string): ChangeClassification | undefined {
  const normalized = normalizeRepoPath(relativePath);

  if (
    normalized === "TASK.md" ||
    normalized === "AGENTS.md" ||
    /^README(?:_START_HERE)?\.md$/.test(normalized) ||
    normalized.startsWith("docs/") ||
    normalized.startsWith("tasks/") ||
    normalized.endsWith(".md")
  ) {
    return "docs_task_only";
  }

  if (normalized.startsWith(".github/")) {
    return "ci";
  }

  if (normalized.startsWith("schemas/")) {
    return "schema";
  }

  if (normalized.startsWith("tests/")) {
    return "test";
  }

  if (
    normalized === "package.json" ||
    normalized.endsWith("lock.json") ||
    normalized === "package-lock.json" ||
    normalized === "pnpm-lock.yaml" ||
    normalized === "yarn.lock"
  ) {
    return "package";
  }

  if (normalized.startsWith("src/") || normalized.startsWith("bin/") || normalized.startsWith("scripts/")) {
    return "source";
  }

  return "source";
}

export function classifyChangedPaths(paths: string[]): ChangeClassification {
  const publicPaths = paths.filter((entry) => !isPrivateGeneratedPath(entry));
  if (publicPaths.length === 0) {
    return "none";
  }

  const categories = uniqueSorted(publicPaths.flatMap((entry) => classifyPath(entry) ?? [])) as ChangeClassification[];
  return categories.length === 1 ? categories[0] : "mixed";
}

export function buildCommandSetHash(commands: VerificationCommandSpec[]): string {
  return buildScopedHash(commands.map((command) => ({ command: command.command })));
}

export function captureVerifiedSnapshot(input: CaptureVerifiedSnapshotInput): VerifiedSnapshot {
  const targetRoot = input.targetRoot;
  const scope = buildDefaultEvidenceScope(targetRoot, { namespace: input.namespace });
  const rawStatusLines = getGitStatusLines(targetRoot);
  const statusLines = rawStatusLines.filter((line) => !getGitStatusPaths([line]).every((entry) => isPrivateGeneratedPath(entry)));
  const trackedEntries = statusLines
    .map(classifyStatusLine)
    .filter((entry) => entry.code !== "??")
    .flatMap((entry) => getGitStatusPaths([`${entry.code} ${entry.path}`]))
    .map(normalizeRepoPath)
    .filter((entry) => !isPrivateGeneratedPath(entry));
  const untrackedFiles = statusLines
    .map(classifyStatusLine)
    .filter((entry) => entry.code === "??")
    .map((entry) => entry.path)
    .filter((entry) => !isPrivateGeneratedPath(entry));
  const untrackedFileHashes: Record<string, string> = {};

  for (const relativePath of uniqueSorted(untrackedFiles)) {
    const absolutePath = path.join(targetRoot, relativePath);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      untrackedFileHashes[relativePath] = hashFile(targetRoot, relativePath);
    }
  }

  const currentCommit = readGitValue(targetRoot, ["rev-parse", "--verify", "HEAD"]);
  const commandSetHash = buildCommandSetHash(input.commands);
  const changedTrackedFiles = uniqueSorted(trackedEntries);
  const sortedUntrackedFiles = uniqueSorted(untrackedFiles);
  const trackedDiffFingerprint = sha256Hex(getGitDiffPatch(targetRoot));
  const changedPaths = uniqueSorted([...changedTrackedFiles, ...sortedUntrackedFiles]);
  const changeClassification = classifyChangedPaths(changedPaths);
  const fingerprintBase = {
    target_project_id: buildTargetProjectId(targetRoot),
    target_root: targetRoot,
    namespace: scope.namespace,
    base_commit: currentCommit,
    current_commit: currentCommit,
    git_status_lines: statusLines,
    changed_tracked_files: changedTrackedFiles,
    untracked_files: sortedUntrackedFiles,
    tracked_diff_fingerprint: trackedDiffFingerprint,
    untracked_file_hashes: untrackedFileHashes,
    command_set_hash: commandSetHash,
    change_classification: changeClassification
  };
  const fingerprintId = `changeset:${buildScopedHash(fingerprintBase)}`;
  const fingerprint: ChangeSetFingerprint = {
    fingerprint_id: fingerprintId,
    target_project_id: buildTargetProjectId(targetRoot),
    target_root: targetRoot,
    namespace: scope.namespace,
    ...(currentCommit ? { base_commit: currentCommit, current_commit: currentCommit } : {}),
    git_status_lines: statusLines,
    changed_tracked_files: changedTrackedFiles,
    untracked_files: sortedUntrackedFiles,
    removed_untracked_files: [],
    tracked_diff_fingerprint: trackedDiffFingerprint,
    untracked_file_hashes: untrackedFileHashes,
    command_set_hash: commandSetHash,
    change_classification: changeClassification
  };
  const timestamp = input.timestamp ?? nowIso();

  return {
    snapshot_id: `snapshot:${buildScopedHash({ fingerprint_id: fingerprintId, timestamp, commands: input.commands })}`,
    target_project_id: fingerprint.target_project_id,
    target_root: targetRoot,
    namespace: scope.namespace,
    ...(currentCommit ? { base_commit: currentCommit, current_commit: currentCommit } : {}),
    git_status_lines: statusLines,
    changed_tracked_files: changedTrackedFiles,
    untracked_files: sortedUntrackedFiles,
    tracked_diff_fingerprint: trackedDiffFingerprint,
    untracked_file_hashes: untrackedFileHashes,
    verification_commands: input.commands,
    command_set_hash: commandSetHash,
    command_results: input.commandResults ?? [],
    timestamp,
    change_classification: changeClassification,
    fingerprint
  };
}

export function compareVerifiedSnapshots(previous: VerifiedSnapshot, current: VerifiedSnapshot): string[] {
  const invalidatedBy: string[] = [];

  if (previous.target_root !== current.target_root) {
    invalidatedBy.push("different root/worktree");
  }

  if (previous.base_commit !== current.base_commit) {
    invalidatedBy.push("different base commit");
  }

  if (previous.command_set_hash !== current.command_set_hash) {
    invalidatedBy.push("changed command set");
  }

  if (previous.tracked_diff_fingerprint !== current.tracked_diff_fingerprint) {
    invalidatedBy.push("changed tracked file");
  }

  for (const [relativePath, hash] of Object.entries(previous.untracked_file_hashes)) {
    if (!(relativePath in current.untracked_file_hashes)) {
      invalidatedBy.push("removed untracked file");
      break;
    }

    if (current.untracked_file_hashes[relativePath] !== hash) {
      invalidatedBy.push("changed untracked file");
      break;
    }
  }

  for (const [relativePath, hash] of Object.entries(current.untracked_file_hashes)) {
    if (!(relativePath in previous.untracked_file_hashes)) {
      invalidatedBy.push("changed untracked file");
      break;
    }

    if (previous.untracked_file_hashes[relativePath] !== hash) {
      invalidatedBy.push("changed untracked file");
      break;
    }
  }

  if (!isSuccessfulSnapshot(previous)) {
    invalidatedBy.push("failed previous verification");
  }

  return uniqueSorted(invalidatedBy);
}

function decisionStatus(status: LocalVerificationReuseStatus, reason: string, current: VerifiedSnapshot, invalidatedBy: string[] = []): VerificationReuseDecision {
  return {
    status,
    reason,
    current_fingerprint: current.fingerprint.fingerprint_id,
    invalidated_by: invalidatedBy
  };
}

function isSuccessfulSnapshot(snapshot: VerifiedSnapshot): boolean {
  return snapshot.command_results.length > 0 && snapshot.command_results.every((result) => result.exit_code === 0);
}

export async function decideLocalVerificationReuse(
  store: MemoryEvidenceStore,
  current: VerifiedSnapshot
): Promise<SnapshotReuseResult> {
  const scope: Pick<EvidenceScope, "target_project_id" | "target_root" | "namespace"> = {
    target_project_id: current.target_project_id,
    target_root: current.target_root,
    namespace: current.namespace
  };
  const prior = await store.projection.queryLatestVerifiedSnapshot(scope, current.fingerprint.fingerprint_id);

  if (!prior) {
    const priorSnapshots = store.ledger.exists()
      ? store.ledger
          .readAll()
          .filter((event) => event.evidence_type === "verified_snapshot")
          .flatMap((event) => {
            const snapshot = event.payload as unknown as VerifiedSnapshot;
            return typeof snapshot.snapshot_id === "string" && typeof snapshot.command_set_hash === "string"
              ? [snapshot]
              : [];
          })
          .filter(
            (snapshot) =>
              snapshot.target_project_id === current.target_project_id &&
              snapshot.namespace === current.namespace &&
              snapshot.command_set_hash === current.command_set_hash
          )
          .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      : [];
    const staleCandidate = priorSnapshots[0];

    if (staleCandidate) {
      const invalidatedBy = compareVerifiedSnapshots(staleCandidate, current);
      return {
        decision: decisionStatus(
          isSuccessfulSnapshot(staleCandidate) ? "STALE" : "FAILED",
          isSuccessfulSnapshot(staleCandidate)
            ? "Prior local verification evidence is stale for the current input set."
            : "Prior local verification evidence failed and cannot be reused.",
          current,
          invalidatedBy.length > 0 ? invalidatedBy : ["missing/corrupt evidence"]
        )
      };
    }

    return {
      decision: decisionStatus("MISSING", "No prior successful local verification evidence matched this exact input set.", current)
    };
  }

  const invalidatedBy = compareVerifiedSnapshots(prior.snapshot, current);
  const artifactStore = new ArtifactStore(current.target_root);

  for (const commandResult of prior.snapshot.command_results) {
    for (const artifact of [commandResult.stdout_artifact, commandResult.stderr_artifact]) {
      if (!artifact) {
        continue;
      }

      const integrity = artifactStore.verify(artifact);
      if (!integrity.ok) {
        invalidatedBy.push(integrity.reason ?? "missing/corrupt artifact");
      }
    }
  }

  if (invalidatedBy.length > 0) {
    return {
      decision: {
        ...decisionStatus("STALE", "Prior local verification evidence is stale for the current input set.", current, uniqueSorted(invalidatedBy)),
        matched_event_id: prior.event.event_id,
        snapshot_id: prior.snapshot.snapshot_id
      }
    };
  }

  return {
    decision: {
      ...decisionStatus("REUSED", "Prior local verification evidence exactly matches the current input set.", current),
      matched_event_id: prior.event.event_id,
      snapshot_id: prior.snapshot.snapshot_id
    },
    reusableSnapshot: prior.snapshot
  };
}

export function buildVerificationSnapshotPayload(snapshot: VerifiedSnapshot): Record<string, unknown> {
  return JSON.parse(canonicalJson(snapshot)) as Record<string, unknown>;
}

export function buildVerificationReuseDecisionPayload(decision: VerificationReuseDecision): Record<string, unknown> {
  return JSON.parse(canonicalJson(decision)) as Record<string, unknown>;
}
