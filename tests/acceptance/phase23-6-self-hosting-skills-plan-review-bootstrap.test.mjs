import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ensureBuiltCli, productRoot, runCli, runCommand, assertSuccess, readJson } from "../helpers/cli-test-utils.mjs";

const requiredProcedures = [
  "feature-decomposition",
  "task-intake",
  "task-prompt-writer",
  "draft-plan",
  "plan-review",
  "plan-amend",
  "architecture-review",
  "db-storage-review",
  "implementation-review",
  "fix-pass-review",
  "verification-review",
  "delivery-facts-review",
  "phase-closeout-review",
  "docs-consistency-review",
  "harness-audit"
];

const requiredSkillMarkers = [
  "## procedure_id",
  "## title",
  "## purpose",
  "## when_to_use",
  "## required_inputs",
  "## preconditions",
  "## forbidden_scope",
  "## checklist",
  "## expected_output_format",
  "## blocker_conditions",
  "## evidence_to_record",
  "## phase_23_5_dependencies",
  "## phase_24_packet_dependencies",
  "## source_adaptation_notes",
  "## authority_level"
];

const requiredAdaptationMarkers = [
  "### internal_sources",
  "### official_codex_sources",
  "### external_advisory_sources",
  "### community_pattern_sources",
  "### adopted",
  "### adapted",
  "### rejected"
];

function readText(relativePath) {
  return fs.readFileSync(path.join(productRoot, relativePath), "utf8");
}

test("phase 23.6 self-hosting procedures, docs, and boundaries exist", () => {
  const sourceMapPath = path.join(productRoot, "docs", "SELF_HOSTING_PROCEDURE_SOURCE_MAP.md");
  const workflowPath = path.join(productRoot, "docs", "SELF_HOSTING_PLAN_REVIEW_WORKFLOW.md");
  const policyPath = path.join(productRoot, "docs", "SELF_HOSTING_AGENT_OPERATING_POLICY.md");
  const discoveryPath = path.join(productRoot, "docs", "SELF_HOSTING_SKILL_DISCOVERY.md");
  const skillsRoot = path.join(productRoot, "skills", "self-hosting");

  for (const docPath of [sourceMapPath, workflowPath, policyPath, discoveryPath, skillsRoot]) {
    assert.ok(fs.existsSync(docPath), `expected Phase 23.6 artifact to exist: ${docPath}`);
  }

  const sourceMap = fs.readFileSync(sourceMapPath, "utf8");
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const policy = fs.readFileSync(policyPath, "utf8");
  const discovery = fs.readFileSync(discoveryPath, "utf8");
  const readme = readText("skills/self-hosting/README.md");
  const packageJson = readJson(path.join(productRoot, "package.json"));

  assert.deepEqual(packageJson.files, ["bin", "dist", "schemas", "README.md"]);

  assert.match(sourceMap, /Canonical source-of-truth:/);
  assert.match(sourceMap, /skills\/self-hosting\/\*\*/);
  assert.match(sourceMap, /\.agents\/skills\/\*\*/);
  assert.match(sourceMap, /\$HOME\/\.agents\/skills\/\*\*/);
  assert.match(sourceMap, /self-hosting-agent-operating-policy/);
  assert.match(sourceMap, /planner packet:/);
  assert.match(sourceMap, /plan-review packet:/);
  assert.match(sourceMap, /implementation-review packet:/);
  assert.match(sourceMap, /closeout-review packet:/);
  assert.doesNotMatch(sourceMap, /\/Users\//);

  assert.match(workflow, /feature-decomposition/);
  assert.match(workflow, /human approval/i);
  assert.match(workflow, /standard:/);
  assert.match(workflow, /high:/);
  assert.match(workflow, /extra-high:/);

  assert.match(policy, /Task files remain the binding implementation contract\./);
  assert.match(policy, /Hooks remain guardrails and reminders only\./);
  assert.match(policy, /Phase 24 owns packet and report materialization\./);
  assert.match(policy, /Phase 25 owns provider-specific access layers/);
  assert.match(policy, /Phase 27 owns domain-pack architecture and must keep domain logic out of\s+core/);
  assert.match(policy, /Phase 28 owns domain ingestion and schema-evolution safety/);
  assert.match(policy, /does not introduce runtime supervision/i);

  assert.match(discovery, /Codex does not auto-discover arbitrary `skills\/self-hosting\/\*\*` paths\./);
  assert.match(discovery, /\.agents\/skills\/\*\*/);
  assert.match(discovery, /\$HOME\/\.agents\/skills\/\*\*/);
  assert.match(discovery, /must not become hidden source-of-truth/);

  assert.match(readme, /canonical product-source location/i);
  assert.match(readme, /Prompt wrappers, if added later, are derived invocation helpers and not authority\./);

  assert.equal(fs.existsSync(path.join(productRoot, "prompts", "self-hosting")), false);

  const trackedAgents = runCommand("git", ["ls-files", ".agents"], { cwd: productRoot });
  assertSuccess(trackedAgents, "git ls-files .agents");
  assert.equal(trackedAgents.stdout.trim(), "", ".agents should not be tracked source");

  for (const procedureId of requiredProcedures) {
    const procedureRoot = path.join(skillsRoot, procedureId);
    const skillPath = path.join(procedureRoot, "SKILL.md");
    const sourceNotesPath = path.join(procedureRoot, "references", "source-notes.md");
    const outputFormatPath = path.join(procedureRoot, "references", "output-format.md");

    for (const expectedPath of [procedureRoot, skillPath, sourceNotesPath, outputFormatPath]) {
      assert.ok(fs.existsSync(expectedPath), `expected Phase 23.6 procedure artifact to exist: ${expectedPath}`);
    }

    const skillContent = fs.readFileSync(skillPath, "utf8");
    const sourceNotesContent = fs.readFileSync(sourceNotesPath, "utf8");
    const outputFormatContent = fs.readFileSync(outputFormatPath, "utf8");

    assert.match(skillContent, /^---\nname: codex-harness-[a-z0-9-]+\ndescription: .+\n---\n/m);
    assert.match(skillContent, new RegExp(`## procedure_id\\n\`${procedureId}\``));

    for (const marker of requiredSkillMarkers) {
      assert.match(skillContent, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    for (const marker of requiredAdaptationMarkers) {
      assert.match(skillContent, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      const sourceNotesMarker = marker.replace("### ", "## ");
      assert.match(sourceNotesContent, new RegExp(sourceNotesMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    assert.match(sourceNotesContent, /Source map authority: `docs\/SELF_HOSTING_PROCEDURE_SOURCE_MAP\.md`/);
    assert.match(outputFormatContent, /Return Markdown with these sections in this order:/);
    assert.match(sourceMap, new RegExp(`\`procedure_id\`: \`${procedureId}\``));
  }
});

test("phase 23.6 does not introduce new self-hosting or future-phase CLI surface", () => {
  ensureBuiltCli();

  const help = runCli(["--help"], { cwd: productRoot });
  assertSuccess(help, "top-level help");

  assert.doesNotMatch(help.stdout, /node bin\/ch self-hosting\b/);
  assert.doesNotMatch(help.stdout, /node bin\/ch skills\b/);
  assert.doesNotMatch(help.stdout, /node bin\/ch plan\b/);
  assert.doesNotMatch(help.stdout, /node bin\/ch pack\b/);

  for (const unexpectedPath of [
    path.join(productRoot, "src", "cli", "self-hosting.ts"),
    path.join(productRoot, "src", "cli", "skills.ts"),
    path.join(productRoot, "src", "cli", "plan.ts"),
    path.join(productRoot, "src", "cli", "pack.ts")
  ]) {
    assert.equal(fs.existsSync(unexpectedPath), false, `unexpected future-scope CLI file exists: ${unexpectedPath}`);
  }
});
