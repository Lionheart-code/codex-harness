import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { productRoot } from "../helpers/cli-test-utils.mjs";

function readText(relativePath) {
  return fs.readFileSync(path.join(productRoot, relativePath), "utf8");
}

function section(markdown, heading, nextHeading) {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const end = nextHeading ? markdown.indexOf(nextHeading, start + heading.length) : markdown.length;
  assert.notEqual(end, -1, `missing next section: ${nextHeading}`);
  return markdown.slice(start, end);
}

test("phase 23.8.6C1 publishes a decision-complete C2 bootstrap authority task", () => {
  const c2 = readText("tasks/PHASE_23_8_6C2_BOOTSTRAP_AUTHORITY_CORRECTNESS.md");

  assert.match(c2, /^# Phase 23\.8\.6C2 - Bootstrap Authority Correctness/m);
  assert.match(c2, /## Acceptance commands/);
  assert.match(c2, /## Acceptance behavior/);
  assert.match(c2, /referenced task file is absent/);
  assert.match(c2, /(?:multiple|several) installed task records exist and none matches/);
  assert.match(c2, /configured upstream/);
  assert.match(c2, /Never guess `main`, `origin\/main`/);
  assert.match(c2, /Deep-validate persisted current-bootstrap records/);
  assert.match(c2, /`RunIssue` and `RepairPacket` current-phase-specific/);
  assert.match(c2, /No new broad orchestrator or workflow command/);
  assert.match(c2, /No `StagePacket`, `StageResult`/);
  assert.match(c2, /No external runner launch/);
});

test("phase 23.8.6C1 publishes the corrected near-term authority order", () => {
  const roadmap = readText("docs/IMPLEMENTATION_ROADMAP.md");
  const operations = readText("docs/OPERATIONS_PLAN.md");
  const headings = [
    "## Phase 23.8.6C \u2014",
    "## Phase 23.8.6C1 \u2014",
    "## Phase 23.8.6C1A \u2014",
    "## Phase 23.8.6C2 \u2014",
    "## Phase 23.8.6D \u2014",
    "## Phase 23.8.6E \u2014",
    "## Phase 23.8.7 \u2014",
    "## Phase 23.9 \u2014"
  ];
  const indexes = headings.map((heading) => roadmap.indexOf(heading));

  assert.equal(indexes.every((index) => index >= 0), true, "every near-term phase must have a roadmap section");
  assert.deepEqual([...indexes].sort((left, right) => left - right), indexes, "near-term roadmap phases must be ordered");
  assert.match(
    operations,
    /23\.8\.6C ->\s*23\.8\.6C1 -> 23\.8\.6C1A -> 23\.8\.6C2 -> 23\.8\.6D -> 23\.8\.6E -> 23\.8\.7 -> 23\.9/
  );

  const cSection = section(roadmap, headings[0], headings[1]);
  const c1Section = section(roadmap, headings[1], headings[2]);
  const c1aSection = section(roadmap, headings[2], headings[3]);
  const c2Section = section(roadmap, headings[3], headings[4]);
  assert.match(cSection, /Complete, reviewed, accepted, and merged/);
  assert.match(c1Section, /Complete, reviewed, accepted, and merged/);
  assert.match(c1aSection, /Active\. Owns source authority/);
  assert.match(c2Section, /tasks\/PHASE_23_8_6C2_BOOTSTRAP_AUTHORITY_CORRECTNESS\.md/);
  assert.match(c2Section, /configured-upstream merge-base authority/);
  assert.match(c2Section, /preserves the lightweight single-loop operator model/);
});

test("phase 23.8.6C1 keeps downstream ownership distinct and lightweight", () => {
  const phaseD = readText("tasks/PHASE_23_8_6D_PROCEDURE_ARTIFACT_PAYLOAD_STORAGE_AND_WORKTREE_RETENTION.md");
  const phaseE = readText("tasks/PHASE_23_8_6E_AUTHORITY_SURFACE_FRESHNESS_AND_DOWNSTREAM_TASK_REVALIDATION.md");
  const phase7 = readText("tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md");

  assert.match(phaseD, /after Phase 23\.8\.6C2 Bootstrap Authority Correctness/);
  assert.match(phaseD, /canonical procedure ID/);
  assert.match(phaseD, /stable recorded timestamp and content hash/);
  assert.match(phaseD, /exact immutable plan\s+or evidence artifact identity/);
  assert.match(phaseD, /No reimplementation of Phase 23\.8\.6C2 current-bootstrap/);

  assert.match(phaseE, /after Phase 23\.8\.6C2 Bootstrap Authority Correctness and/);
  assert.match(phaseE, /model\/profile registry defaults versus manual invocation guidance/);
  assert.match(phaseE, /context-budget, compaction, and handoff guidance/);
  assert.match(phaseE, /stale present-tense phase status claims/);

  assert.match(phase7, /Phase 23\.8\.6C1A[\s\S]*Phase 23\.8\.6C2 Bootstrap Authority\s+Correctness/);
  assert.match(phase7, /Extend and normalize the existing Phase 23\.8\.6C `RunIssue` and/);
  assert.match(phase7, /required review procedures from the review tier and changed-surface/);
  assert.match(phase7, /promotion of a currently manual procedure/);
  assert.match(phase7, /No Codex execution from operator/);
  assert.match(phase7, /No external runner adapter/);
});
