import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { productRoot } from "../helpers/cli-test-utils.mjs";

test("phase 6 agent docs exist and define the required contract", () => {
  const docs = {
    orchestration: path.join(productRoot, "docs", "AGENT_ORCHESTRATION.md"),
    matrix: path.join(productRoot, "docs", "AGENT_CAPABILITY_MATRIX.md"),
    boundaries: path.join(productRoot, "docs", "AGENT_BOUNDARIES_AND_ADAPTERS.md")
  };

  for (const docPath of Object.values(docs)) {
    assert.ok(fs.existsSync(docPath), `expected doc to exist: ${docPath}`);
  }

  const orchestration = fs.readFileSync(docs.orchestration, "utf8");
  const matrix = fs.readFileSync(docs.matrix, "utf8");
  const boundaries = fs.readFileSync(docs.boundaries, "utf8");
  const combined = `${orchestration}\n${matrix}\n${boundaries}`;

  for (const role of ["controller", "architect", "scout", "builder", "verifier", "integrator"]) {
    assert.match(combined, new RegExp(`\\b${role}\\b`));
  }

  assert.match(combined, /External agents are disabled by default\./);
  assert.match(combined, /External agents are read-only by default\./);
  assert.match(combined, /No agent output is trusted without verification\./);
  assert.match(combined, /Write-capable agents require explicit task worktree boundaries\./);
  assert.match(combined, /API is optional, not required\./);
  assert.match(combined, /Codex-first does not mean Codex-only\./);
  assert.match(combined, /read_only/);
  assert.match(combined, /write_worktree/);
  assert.match(combined, /review_only/);
  assert.match(combined, /repo_root/);
  assert.match(combined, /task_worktree/);
  assert.match(combined, /explicit_path/);

  for (const agentFamily of ["Codex", "Gemini CLI", "Cline/Roo-like", "Aider-like", "Custom agents"]) {
    assert.match(combined, new RegExp(agentFamily.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(combined, /implemented external-agent execution/i);
});
