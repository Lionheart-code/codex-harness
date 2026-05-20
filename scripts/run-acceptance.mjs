import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const productRoot = path.resolve(scriptsDir, "..");
const acceptanceDir = path.join(productRoot, "tests", "acceptance");

function listAcceptanceTests() {
  return fs
    .readdirSync(acceptanceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => path.join("tests", "acceptance", entry.name))
    .sort((left, right) => left.localeCompare(right));
}

const testFiles = listAcceptanceTests();
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...testFiles], {
  cwd: productRoot,
  stdio: "inherit",
  env: process.env,
  shell: false
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
