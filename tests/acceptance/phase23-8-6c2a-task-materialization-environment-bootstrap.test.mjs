import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { productRoot } from "../helpers/cli-test-utils.mjs";

function read(relativePath) {
  return fs.readFileSync(path.join(productRoot, relativePath), "utf8");
}

test("phase 23.8.6C2A is the active, bounded task-materialization follow-up", () => {
  const task = read("tasks/PHASE_23_8_6C2A_COMMIT_BACKED_TASK_MATERIALIZATION_AND_ENVIRONMENT_BOOTSTRAP.md");
  const roadmap = read("docs/IMPLEMENTATION_ROADMAP.md");
  const operations = read("docs/OPERATIONS_PLAN.md");

  assert.equal(
    read("TASK.md").trim(),
    "# Current Task\n\nImplement only: tasks/PHASE_23_8_6C2A_COMMIT_BACKED_TASK_MATERIALIZATION_AND_ENVIRONMENT_BOOTSTRAP.md\n\nDo not implement Phase 23.8.6D or later."
  );
  assert.match(task, /^# Phase 23\.8\.6C2A - Commit-Backed Task Materialization and Environment Bootstrap/m);
  assert.match(task, /materialize-next-task[\s\S]*must not start a runtime run/);
  assert.match(task, /Codex Desktop[\s\S]*existing worktree/);
  assert.match(task, /deterministic, repo-owned worktree bootstrap-and-verify path/);
  assert.match(task, /do not copy, serialize, or infer ignored private state/i);
  assert.match(task, /\.worktreeinclude/);
  assert.match(task, /combined architecture\/authority and db-storage\s+conclusion/);
  assert.match(task, /pre-implementation `plan-review`: Sol High/);
  assert.match(task, /post-implementation `implementation-review`: Terra High/);
  assert.match(task, /Terra Medium for docs-consistency, `harness-audit`/);
  assert.match(operations, /23\.8\.6C2 -> 23\.8\.6C2A -> 23\.8\.6D/);
  assert.match(roadmap, /## Phase 23\.8\.6C2A — Commit-Backed Task Materialization and Environment Bootstrap/);
});

test("downstream contracts require C2A and preserve its ownership boundary", () => {
  const d = read("tasks/PHASE_23_8_6D_PROCEDURE_ARTIFACT_PAYLOAD_STORAGE_AND_WORKTREE_RETENTION.md");
  const e = read("tasks/PHASE_23_8_6E_AUTHORITY_SURFACE_FRESHNESS_AND_DOWNSTREAM_TASK_REVALIDATION.md");
  const stage = read("tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md");
  const proof = read("tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md");

  for (const downstream of [d, e, stage, proof]) {
    assert.match(downstream, /23\.8\.6C2A/);
  }
  assert.match(d, /No reimplementation of C2A commit-backed task activation/);
  assert.match(stage, /No reimplementation of Phase 23\.8\.6C2A/);
  assert.match(proof, /committed activation[\s\S]*current source snapshot\s+provenance/);
});
