import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const productRoot = path.resolve(scriptsDir, "..");
const acceptanceDir = process.env.CODEX_HARNESS_ACCEPTANCE_DIR
  ? path.resolve(process.env.CODEX_HARNESS_ACCEPTANCE_DIR)
  : path.join(productRoot, "tests", "acceptance");
const ACCEPTANCE_TIMEOUT_MS = (() => {
  const raw = process.env.CODEX_HARNESS_ACCEPTANCE_TIMEOUT_MS;

  if (!raw) {
    return 45 * 60 * 1000;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`Invalid CODEX_HARNESS_ACCEPTANCE_TIMEOUT_MS: ${raw}`);
    process.exit(1);
  }

  return parsed;
})();

function listAcceptanceTests() {
  if (!fs.existsSync(acceptanceDir) || !fs.statSync(acceptanceDir).isDirectory()) {
    console.error(`Acceptance test directory not found: ${acceptanceDir}`);
    process.exit(1);
  }

  return fs
    .readdirSync(acceptanceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => path.join(acceptanceDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

const testFiles = listAcceptanceTests();
if (testFiles.length === 0) {
  console.error(`No acceptance tests found in: ${acceptanceDir}`);
  process.exit(1);
}

const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("NODE_TEST"))
);

const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...testFiles], {
  cwd: productRoot,
  stdio: "inherit",
  env: childEnv,
  shell: false,
  timeout: ACCEPTANCE_TIMEOUT_MS
});

if (result.error) {
  if ("code" in result.error && result.error.code === "ETIMEDOUT") {
    console.error(`Acceptance suite timed out after ${ACCEPTANCE_TIMEOUT_MS}ms.`);
  } else {
    console.error(result.error.message);
  }
  process.exit(1);
}

if (result.signal) {
  console.error(`Acceptance suite terminated by signal: ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
