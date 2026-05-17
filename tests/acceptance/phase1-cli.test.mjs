import assert from "node:assert/strict";
import test from "node:test";
import { assertSuccess, ensureBuiltCli, getGitStatus, productRoot, runCli } from "../helpers/cli-test-utils.mjs";

test("phase 1 help output includes the supported commands", () => {
  ensureBuiltCli();

  const result = runCli(["--help"], { cwd: productRoot });
  assertSuccess(result, "node bin/ch --help");

  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /node bin\/ch doctor/);
  assert.match(result.stdout, /node bin\/ch install/);
  assert.match(result.stdout, /node bin\/ch init "task title" --dry-run/);
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
