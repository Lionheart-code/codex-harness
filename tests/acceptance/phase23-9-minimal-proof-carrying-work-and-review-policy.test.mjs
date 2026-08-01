import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import { isIgnoredPlatformMetadata } from "../../dist/core/platform-metadata.js";
import { detectProductRepositoryIdentity, assertNotProductRepository } from "../../dist/core/product-repository-identity.js";
import { materializeZeroOwnerTaskState } from "../../dist/core/zero-owner-materialization.js";
import { openVerifiedTaskStateStore } from "../../dist/core/tasks.js";
import { buildSuccessorDisposition, assertCompatibleSuccessorDisposition } from "../../dist/core/successor-disposition.js";
import { buildReviewAttempt, assertPlanningBundleIdentity } from "../../dist/core/review-cohort.js";
import { aggregatePlanBlockers, reconcilePlanningLenses, validatePlanningLensResult } from "../../dist/core/plan-contract.js";
import { buildProofRecord, extractTaskRequirements, parseProofDerivationRequest } from "../../dist/core/proof-record.js";
import {
  buildInstallerOwnershipCatalog,
  buildInstallerOwnershipCatalogEntry,
  readInstallerOwnershipCatalog
} from "../../dist/core/legacy-installer-ownership-catalog.js";
import { buildInstallerOwnershipManifest } from "../../dist/core/installer-ownership.js";
import { getManagedBaselineContents } from "../../dist/core/install.js";
import {
  applySelfInstallReconciliation,
  prepareSelfInstallReconciliation,
  rollbackSelfInstallReconciliation
} from "../../dist/core/product-self-install-reconciliation.js";
import { RunStagingDatabase } from "../../dist/core/run-staging-db.js";
import { buildRuntimeRun, extractEffectiveValidationCommands } from "../../dist/core/runtime.js";
import { harvestRun } from "../../dist/core/harvest.js";

const sha = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

test("phase 23.9 ignores only case-sensitive .DS_Store", () => {
  assert.equal(isIgnoredPlatformMetadata(".DS_Store"), true);
  assert.equal(isIgnoredPlatformMetadata("nested/.DS_Store"), true);
  assert.equal(isIgnoredPlatformMetadata(".ds_store"), false);
  assert.equal(isIgnoredPlatformMetadata("Thumbs.db"), false);
});

test("phase 23.9 product guard fails before mutation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-product-root-"));
  for (const relativePath of [
    "src/core/install.ts", "src/core/runtime.ts", "schemas/install.schema.json",
    "skills/self-hosting/procedure-registry.json"
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), "{}\n");
  }
  assert.equal(detectProductRepositoryIdentity(root).is_product_repository, true);
  assert.throws(() => assertNotProductRepository(root), /product_repository_install_forbidden/);
  assert.equal(fs.existsSync(path.join(root, ".harness")), false);
});

test("phase 23.9 zero-owner materialization creates one exact owner and replays", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ch-owner-project-"));
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "ch-owner-worktree-"));
  const input = {
    projectRoot, worktreePath: worktree, branch: "codex/phase-24",
    baseCommitSha: "a".repeat(40), taskPath: "tasks/NEXT.md",
    pointerContents: "# Current Task\n\n`tasks/NEXT.md`\n"
  };
  assert.equal(materializeZeroOwnerTaskState(input).created_owner, true);
  const owners = openVerifiedTaskStateStore(projectRoot).enumerate();
  assert.equal(owners.length, 1);
  assert.equal(owners[0].branch, input.branch);
  assert.equal(owners[0].worktree, fs.realpathSync.native(worktree));
  assert.equal(owners[0].base_commit_sha, input.baseCommitSha);
  assert.equal(materializeZeroOwnerTaskState(input).created_owner, false);
  assert.equal(openVerifiedTaskStateStore(projectRoot).enumerate().length, 1);
  fs.writeFileSync(path.join(worktree, "TASK.md"), "# wrong\n");
  assert.throws(() => materializeZeroOwnerTaskState(input), /pointer_readback_mismatch/);
  fs.writeFileSync(path.join(worktree, "TASK.md"), input.pointerContents);
  assert.throws(() => materializeZeroOwnerTaskState({
    ...input, taskPath: "tasks/OTHER.md"
  }), /task_contract_conflict/);
});

test("phase 23.9 successor disposition rejects a conflicting authority", () => {
  const selected = buildSuccessorDisposition({
    source_run_instance_id: "instance", disposition: "selected_successor",
    next_task_decision_id: sha("decision"),
    next_task: { task_path: "tasks/NEXT.md", base_commit_sha: "a".repeat(40), source_artifact_identity: sha("task") },
    no_successor: null
  });
  const none = buildSuccessorDisposition({
    source_run_instance_id: "instance", disposition: "no_successor",
    next_task_decision_id: null, next_task: null,
    no_successor: { reason: "terminal", decision_owner_id: "owner", decision_approval_id: "approval", no_successor_decision_id: sha("none") }
  });
  assert.doesNotThrow(() => assertCompatibleSuccessorDisposition(selected, selected));
  assert.throws(() => assertCompatibleSuccessorDisposition(selected, none), /successor_disposition_conflict/);
});

test("phase 23.9 raw startup observation binds one three-lens attempt", () => {
  const raw = "adapter=codex_cli\nprovider=openai\nmodel=gpt-5.6-sol\nreasoning=high\nsandbox=read-only\napproval_policy=never";
  const observation = {
    schema_version: 1, source_kind: "codex_cli_startup_preamble_v1",
    session_id: "fresh", raw_bytes: raw, raw_sha256: sha(raw),
    byte_start: 0, byte_end: Buffer.byteLength(raw)
  };
  const attempt = buildReviewAttempt({
    launch_kind: "planning_review_bundle",
    procedure_ids: ["plan-review", "architecture-review", "db-storage-review"],
    cohort_id: "cohort", source_head: "a".repeat(40), source_plan_sha: sha("plan"),
    terminal_status: "success", artifact_ids: [sha("p"), sha("a"), sha("d")]
  }, observation, { model: "gpt-5.6-sol", sandbox: "read-only" });
  assert.doesNotThrow(() => assertPlanningBundleIdentity(attempt));
  assert.throws(() => buildReviewAttempt({
    launch_kind: attempt.launch_kind, procedure_ids: attempt.procedure_ids,
    cohort_id: attempt.cohort_id, source_head: attempt.source_head,
    source_plan_sha: attempt.source_plan_sha, terminal_status: attempt.terminal_status,
    artifact_ids: attempt.artifact_ids
  }, { ...observation, raw_sha256: sha("wrong") }), /raw_hash_mismatch/);
});

test("phase 23.9 reconciliation aggregates blockers only and requires coverage", () => {
  const shared = {
    schema_version: "phase-23.9.planning-lens-result.v1", bundle_kind: "impact_closure",
    plan_sha: sha("plan"), source_head: "a".repeat(40), task_artifact_id: sha("task"),
    immutable_base: "b".repeat(40), verdict: "PASS",
    covered_decision_ids: ["D1"], covered_trace_ids: ["T1"], output_contract_id: "contract"
  };
  const make = (procedure_id, findings = []) => ({ ...shared, procedure_id, findings });
  const results = [
    make("plan-review", [{ finding_id: "F", classification: "IMPLEMENTATION_DISCRETION", summary: "bounded", primary_lens: "plan-review", secondary_lenses: [], decision_ids: ["D1"], trace_ids: ["T1"] }]),
    make("architecture-review"), make("db-storage-review")
  ];
  assert.equal(aggregatePlanBlockers(results).findings.length, 0);
  assert.equal(reconcilePlanningLenses(results, ["D1"], ["T1"]), "REVIEW_COVERAGE_COMPLETE");
  assert.throws(() => reconcilePlanningLenses(results, ["D2"], ["T1"]), /coverage_incomplete/);
  assert.throws(() => validatePlanningLensResult({
    ...make("plan-review"), source_head: "requested"
  }), /planning_lens_result_contract_invalid/);
});

test("phase 23.9 proof is rejected until baseline review and delivery exist", () => {
  const runtimeField = (field_name) => ({
    field_id: sha(field_name), field_name, status: "observed",
    value: "observed", evidence_ref_id: sha(`ref:${field_name}`),
    gap_id: null, unavailable_cause: null
  });
  const proof = buildProofRecord({
    run_instance_id: "instance", run_id: "run", task_artifact_id: sha("task"),
    immutable_base: "a".repeat(40), activation_hash: sha("activation"),
    activation_source_head: "b".repeat(40), implementation_baseline_head: null,
    final_reviewed_source_head: null, delivered_source_head: null,
    eligibility_snapshot_id: sha("eligibility"), lifecycle_applicability: {},
    task_verifiability_map: [], evidence_refs: [], evidence_families: [],
    assumption_ledger: [],
    operating_envelope: {
      schema_version: "phase-23.9.operating-envelope.v1",
      producer_id: "proof_record_deriver_v1",
      run_start_ref_id: sha("run-start"),
      runtime_fields: ["host_os", "host_arch", "node_version", "network_access"].map(runtimeField),
      planning_lineage: {
        lineage_id: sha("lineage"), target_plan_sha: sha("plan"),
        direct_closure_cohort_id: null, contributing_context_ids: [], lens_map: []
      },
      review_contexts: [], gap_ids: []
    },
    delivery_slices: [],
    evidence_gaps: [], created_at: new Date(0).toISOString()
  });
  assert.equal(proof.acceptance.status, "rejected");
  assert.match(proof.record_id, /^sha256:[a-f0-9]{64}$/);
});

test("phase 23.9 proof command accepts derivation requests, never caller-authored proof", () => {
  assert.deepEqual(parseProofDerivationRequest(Buffer.from('{"schema_version":1}')), {
    schema_version: 1
  });
  assert.throws(() => parseProofDerivationRequest(Buffer.from(JSON.stringify({
    schema_version: 1,
    acceptance: { status: "accepted" },
    task_verifiability_map: []
  }))), /proof_derivation_request_invalid/);
});

test("phase 23.9 procedure sequences are internal, unique, and monotonic", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-sequence-"));
  const staging = new RunStagingDatabase(root, root, "run-sequence");
  const run = buildRuntimeRun({
    runId: "run-sequence",
    taskPath: "TASK.md",
    phaseId: "23.9",
    timestamp: new Date(0).toISOString(),
    repository: {
      root_path: root, project_root: root, branch: "codex/test",
      head_sha: "a".repeat(40), dirty: false
    }
  });
  staging.saveRun(run);
  const descriptor = (suffix, provenance = {}) => ({
    run_instance_id: run.run_instance_id,
    source_run_id: run.run_id,
    procedure_id: "plan-review",
    artifact_id: sha(`artifact:${suffix}`),
    payload_id: `payload-${suffix}`,
    content_hash: createHash("sha256").update(`artifact:${suffix}`).digest("hex"),
    recorded_at: new Date(Number(suffix) * 1000).toISOString(),
    provenance_json: JSON.stringify({ phase_id: "23.9", ...provenance })
  });
  staging.mutateRunWithDatabase(run.run_id, (current, database) => {
    staging.storeProcedureArtifact(database, descriptor("1"));
    return current;
  });
  const stored = staging.readProcedureArtifact(
    run.run_instance_id, "plan-review", descriptor("1").artifact_id
  );
  assert.equal(JSON.parse(stored.provenance_json).recording_sequence, 1);
  assert.throws(() => staging.mutateRunWithDatabase(run.run_id, (current, database) => {
    staging.storeProcedureArtifact(database, descriptor("2", { recording_sequence: 1 }));
    return current;
  }), /procedure_recording_sequence_not_next/);
  assert.throws(() => staging.mutateRunWithDatabase(run.run_id, (current, database) => {
    staging.storeProcedureArtifact(database, descriptor("3"));
    staging.storeProcedureArtifact(database, descriptor("4", { recording_sequence: 2 }));
    return current;
  }), /procedure_recording_sequence_not_next/);
  assert.equal(staging.readProcedureArtifact(
    run.run_instance_id, "plan-review", descriptor("3").artifact_id
  ), undefined);
});

test("phase 23.9 harvest preserves discarded runs and gates later self-hosting runs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-harvest-"));
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"codex-harness"}\n');
  const discarded = buildRuntimeRun({
    runId: "run-discarded", taskPath: "TASK.md", phaseId: "23.9",
    timestamp: new Date(0).toISOString(),
    repository: {
      root_path: root, project_root: root, branch: "codex/test",
      head_sha: "a".repeat(40), dirty: false
    }
  });
  const discardedStaging = new RunStagingDatabase(root, root, discarded.run_id);
  discardedStaging.saveRun({ ...discarded, lifecycle_status: "discarded" });
  assert.equal(harvestRun(root, root, discarded.run_id).harvest.status, "discarded");

  const later = buildRuntimeRun({
    runId: "run-later", taskPath: "TASK.md", phaseId: "24",
    timestamp: new Date(0).toISOString(),
    repository: {
      root_path: root, project_root: root, branch: "codex/test",
      head_sha: "b".repeat(40), dirty: false
    }
  });
  const laterStaging = new RunStagingDatabase(root, root, later.run_id);
  laterStaging.saveRun({ ...later, lifecycle_status: "closed" });
  assert.throws(() => harvestRun(root, root, later.run_id), /successor_disposition_cardinality_invalid:0/);
});

test("phase 23.9 reconciliation stops on drift and preserves runtime and source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ch-reconcile-product-"));
  const priorHome = process.env.HOME;
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ch-reconcile-home-"));
  try {
    for (const relativePath of [
      "src/core/install.ts", "src/core/runtime.ts", "schemas/install.schema.json",
      "skills/self-hosting/procedure-registry.json"
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), `${relativePath}\n`);
    }
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
    const managed = getManagedBaselineContents("0.1.0");
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root, encoding: "utf8"
    }).trim();
    const sourceTree = execFileSync("git", ["rev-parse", `${sourceCommit}^{tree}`], {
      cwd: root, encoding: "utf8"
    }).trim();
    const sourceInstall = execFileSync("git", ["show", `${sourceCommit}:src/core/install.ts`], {
      cwd: root
    });
    const catalog = buildInstallerOwnershipCatalog([
      buildInstallerOwnershipCatalogEntry({
        provenance: {
          kind: "committed_historical_source",
          source_id: sourceCommit,
          source_content_hash: sha(sourceTree),
          manifest_path: "src/core/install.ts",
          manifest_content_hash: sha(sourceInstall),
          review_authority_ref: sha("fixture-review")
        },
        inventory: [
          {
            path: ".harness/config.toml", content_hash: sha(managed.configToml),
            disposition: "quarantine", owner: "installer"
          },
          {
            path: ".harness/templates/managed/agents-block.md",
            content_hash: sha(managed.agentsBlock),
            disposition: "quarantine", owner: "installer"
          }
        ]
      })
    ]);
    fs.mkdirSync(path.join(root, "assets"), { recursive: true });
    fs.writeFileSync(path.join(root, "assets/installer-ownership-catalog.v1.json"),
      `${JSON.stringify(catalog, null, 2)}\n`);
    execFileSync("git", ["add", "assets/installer-ownership-catalog.v1.json"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "catalog"], { cwd: root });
    for (const [relativePath, contents] of [
      [".harness/config.toml", managed.configToml],
      [".harness/templates/managed/agents-block.md", managed.agentsBlock],
      [".harness/templates/managed/config.toml", managed.configToml],
      [".harness/runs/retained.txt", "runtime\n"],
      [".harness/evidence/retained.txt", "evidence\n"]
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), contents);
    }
    const manifest = buildInstallerOwnershipManifest(root, [
      {
        path: ".harness/config.toml", content_hash: sha(managed.configToml),
        disposition: "quarantine", owner: "installer"
      },
      {
        path: ".harness/templates/managed/agents-block.md", content_hash: sha(managed.agentsBlock),
        disposition: "quarantine", owner: "installer"
      }
    ]);
    fs.writeFileSync(path.join(root, ".harness/installer-ownership.v1.json"),
      `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(root, ".harness/install.json"), `${JSON.stringify({
      harness_version: "0.1.0", ownership_manifest: manifest.manifest_id
    })}\n`);
    fs.writeFileSync(path.join(root, "AGENTS.md"),
      `unrelated\n${managed.agentsBlock}tail\n`);
    const journal = prepareSelfInstallReconciliation(root);
    fs.writeFileSync(path.join(root, ".harness/config.toml"), "drift\n");
    assert.throws(() => applySelfInstallReconciliation(journal), /reconciliation_(managed_content|inventory)_drift/);
    assert.equal(fs.readFileSync(path.join(root, ".harness/runs/retained.txt"), "utf8"), "runtime\n");
    assert.equal(fs.existsSync(path.join(root, ".harness/install.json")), true);
    fs.writeFileSync(path.join(root, ".harness/config.toml"), managed.configToml);
    const quarantine = path.join(
      root, ".harness/self-install-reconciliation/quarantine", journal.journal_id.slice(7),
      ".harness/config.toml"
    );
    fs.mkdirSync(path.dirname(quarantine), { recursive: true });
    fs.copyFileSync(path.join(root, ".harness/config.toml"), quarantine);
    fs.rmSync(path.join(root, ".harness/config.toml"));
    const completed = applySelfInstallReconciliation({
      ...journal,
      state: "partial_failure",
      completed_steps: ["removed:.harness/config.toml"],
      error: "injected interruption"
    });
    assert.equal(completed.state, "completed_receipt");
    assert.equal(fs.existsSync(path.join(root, ".harness/install.json")), false);
    assert.equal(fs.readFileSync(path.join(root, ".harness/runs/retained.txt"), "utf8"), "runtime\n");
    assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), "unrelated\n\ntail\n");
    const rolledBack = rollbackSelfInstallReconciliation(completed);
    assert.equal(rolledBack.state, "rolled_back");
    assert.equal(fs.existsSync(path.join(root, ".harness/install.json")), true);
    assert.equal(fs.readFileSync(path.join(root, ".harness/config.toml"), "utf8"), managed.configToml);
    assert.equal(fs.readFileSync(path.join(root, ".harness/runs/retained.txt"), "utf8"), "runtime\n");
    assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"),
      `unrelated\n${managed.agentsBlock}tail\n`);
  } finally {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
  }
});

test("phase 23.9 validation delegation is source-grounded, not plan-hash-specific", () => {
  const plan = [
    "### 15. Ordered implementation slices and validation",
    "",
    "Commands:",
    "",
    "- `npm run build`;",
    "- `node --test tests/acceptance/example.test.mjs`;",
    "",
    "## Effective Validation",
    "",
    "Section 15 is the complete binding validation contract."
  ].join("\n");
  assert.deepEqual(extractEffectiveValidationCommands(plan), [
    "npm run build",
    "node --test tests/acceptance/example.test.mjs"
  ]);
});

test("phase 23.9 frozen task extraction is stable and includes foundation authority", () => {
  const taskBytes = fs.readFileSync(path.join(
    process.cwd(),
    "tasks/PHASE_23_9_MINIMAL_PROOF_CARRYING_WORK_AND_REVIEW_POLICY.md"
  ));
  const first = extractTaskRequirements(taskBytes);
  const second = extractTaskRequirements(taskBytes);
  assert.deepEqual(first, second);
  assert.ok(first.some((entry) => entry.source.requirement_kind === "foundation_constraint"));
  assert.ok(first.some((entry) => entry.source.requirement_kind === "schema_authority_constraint"));
  assert.ok(first.some((entry) => entry.source.requirement_kind === "acceptance_command"));
  assert.equal(new Set(first.map((entry) => entry.requirement_id)).size, first.length);
});

test("phase 23.9 exposes the exact bounded command surface and canonical catalog", () => {
  const help = execFileSync(process.execPath, ["bin/ch", "run", "--help"], {
    cwd: process.cwd(), encoding: "utf8"
  });
  assert.match(help, /launch-review --run <run-id> --bundle planning/);
  assert.match(help, /implementation-review\|fix-pass-review/);
  assert.match(help, /record-proof/);
  assert.match(help, /record-review-capability-evidence/);
  const catalog = readInstallerOwnershipCatalog(path.join(
    process.cwd(), "assets/installer-ownership-catalog.v1.json"
  ));
  assert.ok(Array.isArray(catalog.manifest_entries));
  assert.match(catalog.catalog_id, /^sha256:[a-f0-9]{64}$/);
});
