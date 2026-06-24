import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { assertSuccess, productRoot, runCommand } from "../helpers/cli-test-utils.mjs";

function readText(relativePath) {
  return fs.readFileSync(path.join(productRoot, relativePath), "utf8");
}

test("phase 23.8 bounded source-of-truth and procedure-surface patch stays within scope", () => {
  const task = readText("tasks/PHASE_23_8_AGENT_NATIVE_PROCEDURE_REGISTRY_AND_SKILL_SURFACE.md");
  const roadmap = readText("docs/IMPLEMENTATION_ROADMAP.md");
  const phase25 = readText("tasks/PHASE_25_AGENT_ACCESS_LAYER.md");
  const readme = readText("README.md");
  const manual = readText("docs/HUMAN_OPERATOR_MANUAL.md");
  const productVsProject = readText("docs/PRODUCT_VS_PROJECT_LAYER.md");
  const acceptance = readText("docs/PHASE_ACCEPTANCE.md");
  const sourceMap = readText("docs/SELF_HOSTING_PROCEDURE_SOURCE_MAP.md");
  const workflow = readText("docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md");
  const routingPolicy = readText("docs/SELF_HOSTING_OPERATOR_ROUTING_POLICY.md");
  const phase31Path = "tasks/PHASE_31_REVIEWED_RUNNER_EXECUTION_AND_PR_CI_REPAIR_LOOP.md";
  const phase31 = readText(phase31Path);
  const closeoutFormat = readText("skills/self-hosting/phase-closeout-review/references/output-format.md");
  const fixPassFormat = readText("skills/self-hosting/fix-pass-review/references/output-format.md");
  const reviewPrompt = readText("prompts/99-review-current-task.md");
  const planPrompt = readText("prompts/00-slash-plan-master.md");

  assert.match(task, /## Acceptance commands/);
  assert.match(task, /## Acceptance behavior/);
  assert.match(task, /## Step R — bounded prompt\/review prior-art audit/);
  assert.match(task, /https:\/\/openai\.com\/index\/harness-engineering\//);
  assert.match(task, /https:\/\/openai\.com\/index\/unlocking-the-codex-harness\//);
  assert.match(task, /https:\/\/developers\.openai\.com\/codex\/skills/);
  assert.match(task, /https:\/\/github\.com\/openai\/codex\/blob\/main\/AGENTS\.md/);
  assert.match(task, /registry metadata target/i);
  assert.match(task, /CLI remains the current baseline access surface/);
  assert.match(task, /App Server appears only as an advisory future candidate/);
  assert.match(task, /no role execution, provider\/model routing, App Server integration, MCP/);

  assert.match(roadmap, /## Phase 26 — Big Task Decomposer and Architect Planner/);
  assert.match(roadmap, /## Phase 27 — domain pack \/ skills architecture/);
  assert.match(roadmap, /## Phase 28 — Domain Ingestion and Schema Evolution Safety/);
  assert.match(roadmap, /## Phase 31 — Reviewed Runner Execution and PR\/CI Repair Loop/);
  assert.match(roadmap, new RegExp(phase31Path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(roadmap, /CLI remains the current baseline access surface/);
  assert.match(roadmap, /App Server is a future\s+candidate only/);

  assert.match(phase25, /CLI remains the current baseline access surface/);
  assert.match(phase25, /App Server is a future\s+candidate only/);
  assert.match(phase25, /Do not make API-key billing the default path/);

  for (const doc of [readme, manual, productVsProject]) {
    assert.match(doc, /node bin\/ch run start --task TASK\.md/);
    assert.match(doc, /node bin\/ch run status --operator/);
    assert.match(doc, /manual procedure execution/);
    assert.match(doc, /init \/ worktree \/ prompt \/ context inspect \/ review \/ check \/ report/);
  }

  assert.match(acceptance, /## Phase 23\.8 source-of-truth\/procedure-surface acceptance additions/);
  assert.match(acceptance, /App Server is presented as current-phase work or guaranteed Phase 25/);
  assert.match(acceptance, /registry execution, role execution,\s+provider\/model routing/);

  assert.match(sourceMap, /## 2\.5 Phase 23\.8 bounded Step R source trace/);
  assert.match(sourceMap, /source_url_or_doc/);
  assert.match(sourceMap, /accepted\/adapted\/rejected\/deferred/);
  assert.match(sourceMap, /## 4A\. Phase 23\.8 registry metadata extension/);
  assert.match(sourceMap, /canonical_skill_path: string/);
  assert.match(sourceMap, /source_status: authoritative \| advisory \| derived \| deprecated \| rejected/);
  assert.match(sourceMap, /## 4B\. Skill risk vetting/);
  assert.match(sourceMap, /BLOCKED_SKILL_RISK_UNCLEAR/);

  assert.match(workflow, /Source-of-Truth Refresh \/ Documentation Garbage Collection/);
  assert.match(workflow, /BLOCKED_REVIEW_SURFACE_UNCLEAR/);
  assert.match(workflow, /After `FIX_REQUIRED`, `ACCEPT_WITH_FIXES`, or any blocking implementation/);
  assert.match(workflow, /CLOSEOUT_ACCEPTED_WITH_DOC_FOLLOWUP/);
  assert.match(workflow, /CLOSEOUT_BLOCKED_READINESS/);

  assert.match(routingPolicy, /Phase 23\.8 may materialize procedure metadata and source trace/);
  assert.match(routingPolicy, /CLI remains the current baseline access\s+surface/);
  assert.match(routingPolicy, /App Server may be recorded as a future candidate only/);

  assert.match(phase31, /# Phase 31 - Reviewed Runner Execution and PR\/CI Repair Loop/);
  assert.match(phase31, /RunnerProfile/);
  assert.match(phase31, /ExecutionPolicy/);
  assert.match(phase31, /No self-approval/);
  const trackedPhase31 = runCommand("git", ["ls-files", phase31Path], { cwd: productRoot });
  assertSuccess(trackedPhase31, "git ls-files Phase 31 task");
  assert.equal(trackedPhase31.stdout.trim(), phase31Path, "Phase 31 task must be checked-in repo-owned source");

  assert.match(planPrompt, /SOURCE_OF_TRUTH_CHECKS:/);
  assert.match(planPrompt, /cost_access_boundary:/);
  assert.match(reviewPrompt, /BLOCKED_SOURCE_TRACE_UNCLEAR/);
  assert.match(reviewPrompt, /BLOCKED_SKILL_RISK_UNCLEAR/);

  assert.match(fixPassFormat, /## Fix-pass Scope/);
  assert.match(closeoutFormat, /## Docs Freshness/);
  assert.match(closeoutFormat, /CLOSEOUT_BLOCKED_READINESS/);
  assert.match(closeoutFormat, /CLOSEOUT_BLOCKED_SOURCE_OF_TRUTH_STALE/);
});
