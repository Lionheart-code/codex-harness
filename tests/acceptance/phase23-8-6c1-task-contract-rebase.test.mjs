import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { productRoot } from "../helpers/cli-test-utils.mjs";
import {
  assertNearTermProgressionMatchesRoadmap,
  roadmapPhaseSection
} from "../helpers/phase-authority.mjs";

function readText(relativePath) {
  return fs.readFileSync(path.join(productRoot, relativePath), "utf8");
}

function taskContractForPhase(phase) {
  const matches = fs.readdirSync(path.join(productRoot, "tasks"))
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => ({ entry, markdown: readText(path.join("tasks", entry)) }))
    .filter(({ markdown }) => markdown.startsWith(`# Phase ${phase} -`));
  assert.equal(matches.length, 1, `expected exactly one task contract for Phase ${phase}`);
  return matches[0].markdown;
}

function statusSection(markdown) {
  const startMatch = /^## Status\s*$/mu.exec(markdown);
  assert.ok(startMatch, "task contract must contain a Status section");
  const start = startMatch.index + startMatch[0].length;
  const nextHeading = /^## /gmu;
  nextHeading.lastIndex = start;
  const end = nextHeading.exec(markdown)?.index ?? markdown.length;
  return markdown.slice(start, end);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

test("phase 23.8.6C1 preserves a decision-complete C2 bootstrap authority task", () => {
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

test("phase 23.8.6C1 preserves the near-term authority order", () => {
  const roadmap = readText("docs/IMPLEMENTATION_ROADMAP.md");
  const operations = readText("docs/OPERATIONS_PLAN.md");
  const progression = assertNearTermProgressionMatchesRoadmap(operations, roadmap);
  for (const phase of ["23.8.6C", "23.8.6C1", "23.8.6C1A", "23.8.6C2", "23.8.6C2A", "23.8.6D", "23.8.6E", "23.8.6F", "23.8.7", "23.9"]) {
    assert.ok(progression.includes(phase), `near-term progression must retain Phase ${phase}`);
  }

  const cSection = roadmapPhaseSection(roadmap, "23.8.6C");
  const c1Section = roadmapPhaseSection(roadmap, "23.8.6C1");
  const c1aSection = roadmapPhaseSection(roadmap, "23.8.6C1A");
  const c2Section = roadmapPhaseSection(roadmap, "23.8.6C2");
  const c2aSection = roadmapPhaseSection(roadmap, "23.8.6C2A");
  const dSection = roadmapPhaseSection(roadmap, "23.8.6D");
  const eSection = roadmapPhaseSection(roadmap, "23.8.6E");
  const fSection = roadmapPhaseSection(roadmap, "23.8.6F");
  const stageSection = roadmapPhaseSection(roadmap, "23.8.7");
  assert.match(cSection, /Complete, reviewed, accepted, and merged/);
  assert.match(c1Section, /Complete, reviewed, accepted, and merged/);
  assert.match(c1aSection, /Complete, reviewed, accepted, and merged/);
  assert.match(c2Section, /tasks\/PHASE_23_8_6C2_BOOTSTRAP_AUTHORITY_CORRECTNESS\.md/);
  assert.match(c2Section, /Complete, reviewed, accepted, and merged/);
  assert.match(c2Section, /configured-upstream merge-base authority/);
  assert.match(c2Section, /preserves the lightweight single-loop operator model/);
  assert.match(c2aSection, /COMMIT_BACKED_TASK_MATERIALIZATION_AND_ENVIRONMENT_BOOTSTRAP/);
  assert.match(c2aSection, /Complete, reviewed, accepted, and merged/);
  assert.match(c2aSection, /Codex Desktop-managed existing worktree/);
  assert.match(dSection, /Complete, reviewed, accepted, and merged/);
  assert.match(eSection, /Complete\. Independently reviewed, accepted, merged, closed out, and harvested/);
  assert.match(fSection, /Complete\./);
  assert.match(stageSection, /Complete, independently reviewed, accepted, merged, closed out, and harvested/);
});

test("phase 23.8.6C1 derives immediate future dependencies from published authority", () => {
  const progression = assertNearTermProgressionMatchesRoadmap(
    readText("docs/OPERATIONS_PLAN.md"),
    readText("docs/IMPLEMENTATION_ROADMAP.md")
  );
  const activeIndex = progression.indexOf("23.9");
  assert.notEqual(activeIndex, -1, "active Phase 23.9 must appear in near-term progression");

  for (let index = activeIndex + 1; index < progression.length; index += 1) {
    const phase = progression[index];
    const predecessor = progression[index - 1];
    assert.match(
      statusSection(taskContractForPhase(phase)),
      new RegExp(`\\bPhase\\s+${escapeRegExp(predecessor)}\\b`, "u"),
      `Phase ${phase} status must name immediate predecessor Phase ${predecessor}`
    );
  }
});

test("phase 23.8.6C1 keeps downstream ownership distinct and lightweight", () => {
  const phaseD = readText("tasks/PHASE_23_8_6D_PROCEDURE_ARTIFACT_PAYLOAD_STORAGE_AND_WORKTREE_RETENTION.md");
  const phaseE = readText("tasks/PHASE_23_8_6E_AUTHORITY_SURFACE_FRESHNESS_AND_DOWNSTREAM_TASK_REVALIDATION.md");
  const phase7 = readText("tasks/PHASE_23_8_7_HOOKLESS_STAGE_LEVEL_OPERATOR_PACKET_AUTOMATION.md");

  assert.match(phaseD, /Complete, reviewed, accepted, and merged[\s\S]*precedes Phase\s+23\.8\.6E freshness revalidation/i);
  assert.match(phaseD, /canonical procedure ID/);
  assert.match(phaseD, /stable recorded timestamp and content hash/);
  assert.match(phaseD, /exact immutable plan\s+or evidence artifact identity/);
  assert.match(phaseD, /No reimplementation of Phase 23\.8\.6C2 current-bootstrap/);

  assert.match(phaseE, /Complete\. Independently reviewed, accepted, merged, closed out, and harvested/);
  assert.match(phaseE, /model\/profile registry defaults versus manual invocation guidance/);
  assert.match(phaseE, /context-budget, compaction, and handoff guidance/);
  assert.match(phaseE, /stale present-tense phase status claims/);

  assert.match(phase7, /Phase 23\.8\.6C1A[\s\S]*Phase 23\.8\.6C2 Bootstrap Authority\s+Correctness[\s\S]*23\.8\.6C2A[\s\S]*Phase 23\.8\.6F/);
  assert.match(phase7, /Extend and normalize the existing Phase 23\.8\.6C `RunIssue` and/);
  assert.match(phase7, /consume the approved Phase 23\.8\.6F provider-neutral route decision/i);
  assert.match(phase7, /promotion of a currently manual procedure/);
  assert.match(phase7, /No Codex execution from operator/);
  assert.match(phase7, /No external runner adapter/);
});
