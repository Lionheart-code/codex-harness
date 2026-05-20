import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  assertSuccess,
  createTempDirectory,
  ensureBuiltCli,
  getGitStatus,
  productRoot,
  removeDirectory,
  runCli
} from "../helpers/cli-test-utils.mjs";

const tempDirectories = [];

after(() => {
  for (const targetPath of tempDirectories) {
    removeDirectory(targetPath);
  }
});

test("phase 1 help output includes the supported commands", () => {
  ensureBuiltCli();

  const result = runCli(["--help"], { cwd: productRoot });
  assertSuccess(result, "node bin/ch --help");

  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /node bin\/ch doctor/);
  assert.match(result.stdout, /node bin\/ch eval playground init/);
  assert.match(result.stdout, /node bin\/ch governance --help/);
  assert.match(result.stdout, /node bin\/ch parallel --help/);
  assert.match(result.stdout, /node bin\/ch install/);
  assert.match(result.stdout, /node bin\/ch init "task title" --dry-run/);
  assert.match(result.stdout, /node bin\/ch agent prompt codex --role tests/);
  assert.match(result.stdout, /node bin\/ch agent run codex --role tests/);
  assert.match(result.stdout, /node bin\/ch capture/);
  assert.match(result.stdout, /node bin\/ch check/);
  assert.match(result.stdout, /node bin\/ch report/);
  assert.match(result.stdout, /node bin\/ch schema --help/);
  assert.match(result.stdout, /node bin\/ch schema validate/);
  assert.match(result.stdout, /node bin\/ch schema migrate --dry-run/);
  assert.match(result.stdout, /node bin\/ch memory status/);
  assert.match(result.stdout, /node bin\/ch debt list/);
  assert.match(result.stdout, /node bin\/ch decisions list/);
  assert.match(result.stdout, /node bin\/ch doctor --help/);
  assert.match(result.stdout, /node bin\/ch doctor --all/);
  assert.match(result.stdout, /node bin\/ch doctor platform/);
  assert.match(result.stdout, /node bin\/ch doctor commands/);
  assert.match(result.stdout, /node bin\/ch security --help/);
  assert.match(result.stdout, /node bin\/ch security doctor/);
  assert.match(result.stdout, /node bin\/ch context --help/);
  assert.match(result.stdout, /node bin\/ch context inspect plan/);
  assert.match(result.stdout, /node bin\/ch eval$/m);
  assert.match(result.stdout, /node bin\/ch upgrade --help/);
  assert.match(result.stdout, /node bin\/ch upgrade --dry-run/);
});

test("phase 1 doctor reports git repository and installed-layer status text", () => {
  ensureBuiltCli();

  const result = runCli(["doctor"], { cwd: productRoot });
  assertSuccess(result, "node bin/ch doctor");

  assert.match(result.stdout, /repository: inside git work tree/);
  assert.match(result.stdout, /installed layer:/);
});

test("phase 1 install dry-run does not change product-repo git status", () => {
  ensureBuiltCli();

  const beforeStatus = getGitStatus(productRoot);
  const result = runCli(["install", "--dry-run"], { cwd: productRoot });
  const afterStatus = getGitStatus(productRoot);

  assertSuccess(result, "node bin/ch install --dry-run");
  assert.equal(afterStatus, beforeStatus, "install --dry-run changed product-repo git status");
  assert.match(result.stdout, /codex-harness install \(dry-run\)/);
  assert.match(result.stdout, /status: no files were written/);
});

test("phase 1 init dry-run succeeds without an installed harness layer and does not mutate the repo", () => {
  ensureBuiltCli();

  const beforeStatus = getGitStatus(productRoot);
  const result = runCli(["init", "test task", "--dry-run"], { cwd: productRoot });
  const afterStatus = getGitStatus(productRoot);

  assertSuccess(result, "node bin/ch init \"test task\" --dry-run");
  assert.equal(afterStatus, beforeStatus, "init --dry-run changed product-repo git status");
  assert.match(result.stdout, /codex-harness init \(dry-run\)/);
  assert.match(result.stdout, /task id: task-test-task/);
  assert.match(result.stdout, /Planned Phase 3 task paths:/);
});

test("phase 1 doctor reports when the current directory is outside git", () => {
  ensureBuiltCli();

  const tempDir = createTempDirectory();
  tempDirectories.push(tempDir);

  const result = runCli(["doctor"], { cwd: tempDir });
  assertSuccess(result, "node bin/ch doctor outside git");

  assert.match(result.stdout, /repository: not inside a git work tree/);
  assert.match(result.stdout, /installed layer: unavailable/);
});
