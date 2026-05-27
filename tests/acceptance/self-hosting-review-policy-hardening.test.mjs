import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { productRoot } from "../helpers/cli-test-utils.mjs";

function readText(relativePath) {
  return fs.readFileSync(path.join(productRoot, relativePath), "utf8");
}

test("global self-hosting review policy is consistent across task docs prompts and canonical skills", () => {
  const task = readText("tasks/PHASE_23_7_MINIMUM_SELF_HOSTING_OPERATOR_INTERPRETER.md");
  const reviewTierPolicy = readText("docs/SELF_HOSTING_REVIEW_TIER_POLICY.md");
  const workflow = readText("docs/SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md");
  const routingPolicy = readText("docs/SELF_HOSTING_OPERATOR_ROUTING_POLICY.md");
  const planPrompt = readText("prompts/00-slash-plan-master.md");
  const reviewPrompt = readText("prompts/99-review-current-task.md");
  const draftPlanSkill = readText("skills/self-hosting/draft-plan/SKILL.md");
  const draftPlanFormat = readText("skills/self-hosting/draft-plan/references/output-format.md");
  const planReviewSkill = readText("skills/self-hosting/plan-review/SKILL.md");
  const planReviewFormat = readText("skills/self-hosting/plan-review/references/output-format.md");
  const implementationReviewSkill = readText("skills/self-hosting/implementation-review/SKILL.md");
  const implementationReviewFormat = readText("skills/self-hosting/implementation-review/references/output-format.md");

  assert.match(task, /Phase 23\.7 first delivers the global self-hosting review-policy hardening/i);
  assert.match(task, /Phase 23\.7 uses that global policy before runtime\/operator work/i);
  assert.match(task, /Runtime\/operator implementation remains separate and is not done/i);
  assert.match(task, /## Acceptance commands/);
  assert.match(task, /node --test tests\/acceptance\/phase23-6-self-hosting-skills-plan-review-bootstrap\.test\.mjs tests\/acceptance\/self-hosting-review-policy-hardening\.test\.mjs/);

  assert.match(reviewTierPolicy, /apply to self-hosting `draft-plan`, `plan-review`, and\s+`implementation-review` flows generally, not only to Phase 23\.7/i);
  for (const marker of [
    /`anti_slop`/,
    /`design_invariant`/,
    /`scope_legality`/,
    /`evidence_gap`/,
    /`docs_consistency`/,
    /`future_phase_leakage`/,
    /`review_tier_controls`/
  ]) {
    assert.match(reviewTierPolicy, marker);
  }

  assert.match(workflow, /must explicitly\s+check `anti_slop`, `design_invariant`, `scope_legality`, `evidence_gap`,\s+`docs_consistency`, `future_phase_leakage`, and `review_tier_controls`/i);
  assert.match(workflow, /Global reviewer posture:/);
  assert.match(workflow, /reconcile those surfaces before\s+implementation or review continues when authoritative behavior changed/i);
  assert.match(workflow, /## Review surface discovery/);
  assert.match(workflow, /BLOCKED_REVIEW_SURFACE_UNCLEAR/);
  assert.match(workflow, /## Fix-pass and re-review protocol/);
  assert.match(workflow, /## Closeout freshness requirement/);
  assert.match(workflow, /CLOSEOUT_BLOCKED_SOURCE_OF_TRUTH_STALE/);

  assert.match(routingPolicy, /may surface the globally defined\s+`review_tier_controls` and related policy notes through `notes`/i);
  assert.match(routingPolicy, /Phase 23\.7\s+reports those controls; it does not define them/i);
  assert.doesNotMatch(routingPolicy, /required_controls:/i);

  assert.match(planPrompt, /REVIEWER_POLICY_CHECKS:/);
  assert.match(planPrompt, /SOURCE_OF_TRUTH_CHECKS:/);
  assert.match(planPrompt, /runtime_operator_entrypoint:/);
  assert.match(planPrompt, /source_trace:/);
  assert.match(planPrompt, /prompt_procedure_impact:/);
  assert.match(planPrompt, /cost_access_boundary:/);
  for (const marker of [
    /anti_slop:/,
    /design_invariant:/,
    /scope_legality:/,
    /evidence_gap:/,
    /docs_consistency:/,
    /future_phase_leakage:/,
    /review_tier_controls:/
  ]) {
    assert.match(planPrompt, marker);
  }

  for (const marker of [
    /Derive the review surface from:/,
    /BLOCKED_REVIEW_SURFACE_UNCLEAR/,
    /BLOCKED_SOURCE_TRACE_UNCLEAR/,
    /BLOCKED_SKILL_RISK_UNCLEAR/,
    /Review surface:/,
    /Policy findings:/,
    /anti_slop: \.\.\./,
    /design_invariant: \.\.\./,
    /scope_legality: \.\.\./,
    /evidence_gap: \.\.\./,
    /docs_consistency: \.\.\./,
    /future_phase_leakage: \.\.\./,
    /review_tier_controls: \.\.\./,
    /source_trace: \.\.\./,
    /skill_risk: \.\.\./,
    /docs_freshness: \.\.\./
  ]) {
    assert.match(reviewPrompt, marker);
  }

  assert.match(draftPlanSkill, /Check task\/docs\/prompt\/skill consistency when authoritative behavior\s+changes\./i);
  assert.match(draftPlanSkill, /reject future-phase leakage/i);
  assert.match(draftPlanSkill, /`docs_consistency`/);
  assert.match(draftPlanFormat, /## Reviewer Policy Checks/);
  for (const marker of [
    /anti_slop:/,
    /design_invariant:/,
    /scope_legality:/,
    /evidence_gap:/,
    /docs_consistency:/,
    /future_phase_leakage:/,
    /review_tier_controls:/
  ]) {
    assert.match(draftPlanFormat, marker);
  }

  assert.match(planReviewSkill, /Check `anti_slop`, `design_invariant`, `scope_legality`, `evidence_gap`,\s+`docs_consistency`, and `future_phase_leakage` explicitly\./i);
  assert.match(planReviewSkill, /Confirm `review_tier_controls` are named/i);
  assert.match(planReviewFormat, /## Policy Control Check/);
  for (const marker of [
    /anti_slop:/,
    /design_invariant:/,
    /scope_legality:/,
    /evidence_gap:/,
    /docs_consistency:/,
    /future_phase_leakage:/,
    /review_tier_controls:/
  ]) {
    assert.match(planReviewFormat, marker);
  }

  assert.match(implementationReviewSkill, /Check `anti_slop`, `design_invariant`, `scope_legality`, `evidence_gap`,\s+`docs_consistency`, and `future_phase_leakage` explicitly\./i);
  assert.match(implementationReviewSkill, /Confirm `review_tier_controls` are named/i);
  assert.match(implementationReviewFormat, /## Policy Findings/);
  for (const marker of [
    /anti_slop:/,
    /design_invariant:/,
    /scope_legality:/,
    /evidence_gap:/,
    /docs_consistency:/,
    /future_phase_leakage:/,
    /review_tier_controls:/
  ]) {
    assert.match(implementationReviewFormat, marker);
  }

  for (const fileText of [
    reviewTierPolicy,
    workflow,
    routingPolicy,
    planPrompt,
    reviewPrompt,
    draftPlanSkill,
    draftPlanFormat,
    planReviewSkill,
    planReviewFormat,
    implementationReviewSkill,
    implementationReviewFormat
  ]) {
    assert.doesNotMatch(fileText, /Phase 23\.7 pre-runtime/i);
    assert.doesNotMatch(fileText, /pre-runtime consistency checkpoint/i);
    assert.doesNotMatch(fileText, /this checkpoint only/i);
    assert.doesNotMatch(fileText, /for this checkpoint only/i);
    assert.doesNotMatch(fileText, /23\.7-only/i);
    assert.doesNotMatch(fileText, /phase23-7-pre-runtime/i);
  }
});
