import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import {
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  readText,
  removeDirectory,
  runCli,
  runCommand,
  writeText
} from "../helpers/cli-test-utils.mjs";

const tempDirectories = [];
const implementationDisciplineBlock = [
  "Implementation discipline:",
  "- Surface ambiguity before choosing an implementation path.",
  "- Prefer the smallest implementation that satisfies the active task acceptance criteria.",
  "- Make surgical changes only; do not refactor unrelated code.",
  "- Do not add speculative flexibility, future features, or abstractions.",
  "- Verify with the required acceptance commands before reporting completion."
].join("\n");

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

test("phase 5 prompt builder generates concise task prompts and preserves AGENTS.md discipline policy", () => {
  ensureBuiltCli();

  const tempRepo = createTempDirectory();
  tempDirectories.push(tempRepo);

  assertSuccess(runCommand("git", ["init"], { cwd: tempRepo }), `git init in ${tempRepo}`);
  assertSuccess(runCommand("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo }), "git config user.email");
  assertSuccess(runCommand("git", ["config", "user.name", "Test User"], { cwd: tempRepo }), "git config user.name");

  writeText(path.join(tempRepo, "README.md"), "# test\n");
  assertSuccess(runCommand("git", ["add", "README.md"], { cwd: tempRepo }), "git add README.md");
  assertSuccess(runCommand("git", ["commit", "-m", "init"], { cwd: tempRepo }), "git commit init");

  assertSuccess(runCli(["install"], { cwd: tempRepo }), "install");
  assertSuccess(runCli(["init", "test task"], { cwd: tempRepo }), "init");
  assertSuccess(runCli(["worktree"], { cwd: tempRepo }), "worktree");

  const planResult = runCli(["prompt", "plan"], { cwd: tempRepo });
  const workResult = runCli(["prompt", "work"], { cwd: tempRepo });
  const reviewResult = runCli(["prompt", "review"], { cwd: tempRepo });
  assertSuccess(planResult, "prompt plan");
  assertSuccess(workResult, "prompt work");
  assertSuccess(reviewResult, "prompt review");

  const taskRoot = path.join(tempRepo, ".harness", "tasks", "task-test-task");
  const promptPlanPath = path.join(taskRoot, "prompt-plan.md");
  const promptWorkPath = path.join(taskRoot, "prompt-work.md");
  const promptReviewPath = path.join(taskRoot, "prompt-review.md");

  for (const promptPath of [promptPlanPath, promptWorkPath, promptReviewPath]) {
    assert.ok(fs.existsSync(promptPath), `expected prompt file to exist: ${promptPath}`);
    assert.ok(fs.statSync(promptPath).size < 8 * 1024, `expected concise prompt file: ${promptPath}`);

    const content = readText(promptPath);
    assert.match(content, /spec\.md/);
    assert.match(content, /acceptance\.md/);
    assert.match(content, /state\.json/);
    assert.match(content, /branch\.txt/);
    assert.match(content, /worktree\.txt/);
    assert.match(content, /AGENTS\.md/);
    assert.match(content, /Allowed scope:/);
    assert.match(content, /Verification:/);
    assert.match(content, /Expected output:/);
    assert.match(content, /Implementation discipline:/);
    assert.match(content, new RegExp(implementationDisciplineBlock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(content, /TODO: describe the task details\./);
    assert.doesNotMatch(content, /Define acceptance criteria\./);
  }

  assert.match(readText(promptPlanPath), /scoped implementation plan/i);
  assert.match(readText(promptWorkPath), /Changed files and verification results\./);
  assert.match(readText(promptReviewPath), /Findings-first review output\./);

  const agentsPath = path.join(tempRepo, "AGENTS.md");
  const agentsContent = readText(agentsPath);
  assert.match(agentsContent, /## Implementation discipline/);
  assert.doesNotMatch(agentsContent, /Karpathy/i);
  assert.ok(agentsContent.split(/\r?\n/).length <= 40, "expected target AGENTS.md to remain short");

  const originalPlanContent = readText(promptPlanPath);
  const originalWorkContent = readText(promptWorkPath);
  const originalReviewContent = readText(promptReviewPath);

  const secondWorkResult = runCli(["prompt", "work"], { cwd: tempRepo });
  assertSuccess(secondWorkResult, "prompt work second run");
  assert.match(secondWorkResult.stdout, /prompt status: unchanged/);
  assert.equal(readText(promptPlanPath), originalPlanContent);
  assert.equal(readText(promptWorkPath), originalWorkContent);
  assert.equal(readText(promptReviewPath), originalReviewContent);
});
