import * as fs from "node:fs";
import * as path from "node:path";
import {
  CODEX_HOOKS_CONFIG_PATH,
  CODEX_HOOKS_DIR,
  HOOK_TEMPLATES_DIR,
  PRE_TOOL_USE_HOOK_FILE,
  STOP_HOOK_FILE,
  USER_PROMPT_SUBMIT_HOOK_FILE
} from "./paths";
import { requireInstalledTargetRoot } from "./tasks";

type FileAction = "create" | "unchanged";
type DirectoryAction = "create" | "unchanged";

interface DirectoryPlan {
  relativePath: string;
  absolutePath: string;
  action: DirectoryAction;
}

interface FilePlan {
  relativePath: string;
  absolutePath: string;
  action: FileAction;
  content?: string;
}

export interface HooksInstallResult {
  ok: boolean;
  targetRoot: string;
  created: string[];
  unchanged: string[];
  conflicts: string[];
}

function toPortablePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function toRelativePath(targetRoot: string, absolutePath: string): string {
  return toPortablePath(path.relative(targetRoot, absolutePath) || ".");
}

function buildHooksConfig(): string {
  return `${JSON.stringify({
    hooks: [
      {
        event: "UserPromptSubmit",
        command: ["node", ".codex/hooks/user-prompt-submit.cjs"]
      },
      {
        event: "PreToolUse",
        command: ["node", ".codex/hooks/pre-tool-use.cjs"]
      },
      {
        event: "Stop",
        command: ["node", ".codex/hooks/stop.cjs"]
      }
    ]
  }, null, 2)}\n`;
}

function buildUserPromptSubmitHook(): string {
  return [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "",
    "function listTaskStates(tasksDir) {",
    "  if (!fs.existsSync(tasksDir) || !fs.statSync(tasksDir).isDirectory()) {",
    "    return [];",
    "  }",
    "",
    "  return fs.readdirSync(tasksDir, { withFileTypes: true })",
    "    .filter((entry) => entry.isDirectory())",
    "    .map((entry) => path.join(tasksDir, entry.name, 'state.json'))",
    "    .filter((statePath) => fs.existsSync(statePath) && fs.statSync(statePath).isFile())",
    "    .flatMap((statePath) => {",
    "      try {",
    "        return [JSON.parse(fs.readFileSync(statePath, 'utf8'))];",
    "      } catch {",
    "        return [];",
    "      }",
    "    });",
    "}",
    "",
    "const repoRoot = process.cwd();",
    "const tasksDir = path.join(repoRoot, '.harness', 'tasks');",
    "const tasks = listTaskStates(tasksDir).filter((task) => typeof task.worktree === 'string' && task.worktree.length > 0);",
    "",
    "if (tasks.length !== 1) {",
    "  process.stderr.write('codex-harness hook: active task context is required before coding work. Run node bin/ch init and node bin/ch worktree.\\n');",
    "  process.exit(1);",
    "}",
    "",
    "process.stdout.write(`codex-harness hook: task context active for ${tasks[0].task_id}.\\n`);",
    ""
  ].join("\n");
}

function buildPreToolUseHook(): string {
  return [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "",
    "function readInput() {",
    "  try {",
    "    return fs.readFileSync(0, 'utf8');",
    "  } catch {",
    "    return '';",
    "  }",
    "}",
    "",
    "function listTaskStates(tasksDir) {",
    "  if (!fs.existsSync(tasksDir) || !fs.statSync(tasksDir).isDirectory()) {",
    "    return [];",
    "  }",
    "",
    "  return fs.readdirSync(tasksDir, { withFileTypes: true })",
    "    .filter((entry) => entry.isDirectory())",
    "    .map((entry) => path.join(tasksDir, entry.name, 'state.json'))",
    "    .filter((statePath) => fs.existsSync(statePath) && fs.statSync(statePath).isFile())",
    "    .flatMap((statePath) => {",
    "      try {",
    "        return [JSON.parse(fs.readFileSync(statePath, 'utf8'))];",
    "      } catch {",
    "        return [];",
    "      }",
    "    });",
    "}",
    "",
    "function normalize(value) {",
    "  const normalized = value.replace(/[\\\\/]+/g, '/');",
    "  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;",
    "}",
    "",
    "function isInside(parentPath, childPath) {",
    "  const relativePath = path.relative(parentPath, childPath);",
    "  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);",
    "}",
    "",
    "function findStringValues(value, results = []) {",
    "  if (typeof value === 'string') {",
    "    results.push(value);",
    "    return results;",
    "  }",
    "",
    "  if (Array.isArray(value)) {",
    "    for (const entry of value) {",
    "      findStringValues(entry, results);",
    "    }",
    "    return results;",
    "  }",
    "",
    "  if (value && typeof value === 'object') {",
    "    for (const entry of Object.values(value)) {",
    "      findStringValues(entry, results);",
    "    }",
    "  }",
    "",
    "  return results;",
    "}",
    "",
    "function looksLikeDangerousCommand(commandText) {",
    "  const value = commandText.toLowerCase();",
    "  return [",
    "    'git reset --hard',",
    "    'git checkout --',",
    "    'git clean -fd',",
    "    'git clean -fdx',",
    "    'rm -rf',",
    "    'remove-item -recurse -force',",
    "    'del /f /s /q',",
    "    'rmdir /s /q'",
    "  ].some((pattern) => value.includes(pattern));",
    "}",
    "",
    "const repoRoot = process.cwd();",
    "const tasks = listTaskStates(path.join(repoRoot, '.harness', 'tasks')).filter((task) => typeof task.worktree === 'string' && task.worktree.length > 0);",
    "const rawInput = readInput();",
    "const payload = rawInput.trim().length > 0 ? (() => {",
    "  try {",
    "    return JSON.parse(rawInput);",
    "  } catch {",
    "    return {};",
    "  }",
    "})() : {};",
    "",
    "const stringValues = findStringValues(payload).map((value) => String(value));",
    "const dangerous = stringValues.find((value) => looksLikeDangerousCommand(value));",
    "",
    "if (dangerous) {",
    "  process.stderr.write(`codex-harness hook: blocked dangerous shell/git command: ${dangerous}\\n`);",
    "  process.exit(1);",
    "}",
    "",
    "if (tasks.length === 1) {",
    "  const worktreePath = path.resolve(tasks[0].worktree);",
    "  const candidatePaths = stringValues",
    "    .filter((value) => value.includes('/') || value.includes('\\\\') || value.endsWith('.ts') || value.endsWith('.js') || value.endsWith('.md') || value.endsWith('.json'))",
    "    .map((value) => path.resolve(repoRoot, value));",
    "",
    "  for (const candidatePath of candidatePaths) {",
    "    if (normalize(candidatePath) === normalize(worktreePath)) {",
    "      continue;",
    "    }",
    "",
    "    if (!isInside(worktreePath, candidatePath)) {",
    "      process.stderr.write(`codex-harness hook: blocked edit/write outside the current task worktree where detectable: ${candidatePath}\\n`);",
    "      process.exit(1);",
    "    }",
    "  }",
    "}",
    "",
    "process.stdout.write('codex-harness hook: pre-tool guard passed. Boundary enforcement applies only where detectable.\\n');",
    ""
  ].join("\n");
}

function buildStopHook(): string {
  return [
    "process.stdout.write('codex-harness hook: before stopping, run node bin/ch check and node bin/ch report.\\n');",
    ""
  ].join("\n");
}

function ensureDirectoryPlan(targetRoot: string, relativePath: string, conflicts: string[]): DirectoryPlan {
  const absolutePath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      relativePath,
      absolutePath,
      action: "create"
    };
  }

  if (!fs.statSync(absolutePath).isDirectory()) {
    conflicts.push(`${relativePath} exists but is not a directory.`);
  }

  return {
    relativePath,
    absolutePath,
    action: "unchanged"
  };
}

function planManagedFile(targetRoot: string, relativePath: string, desiredContent: string, conflicts: string[]): FilePlan {
  const absolutePath = path.join(targetRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      relativePath,
      absolutePath,
      action: "create",
      content: desiredContent
    };
  }

  if (!fs.statSync(absolutePath).isFile()) {
    conflicts.push(`${relativePath} exists but is not a file.`);
    return {
      relativePath,
      absolutePath,
      action: "unchanged"
    };
  }

  const currentContent = fs.readFileSync(absolutePath, "utf8");

  if (currentContent === desiredContent) {
    return {
      relativePath,
      absolutePath,
      action: "unchanged"
    };
  }

  conflicts.push(`${relativePath} differs from the Phase 13 managed content.`);

  return {
    relativePath,
    absolutePath,
    action: "unchanged"
  };
}

function applyDirectoryPlan(plan: DirectoryPlan): void {
  if (plan.action === "create") {
    fs.mkdirSync(plan.absolutePath, { recursive: true });
  }
}

function applyFilePlan(plan: FilePlan): void {
  if (plan.action === "create") {
    if (plan.content === undefined) {
      throw new Error(`Missing content for ${plan.relativePath}.`);
    }

    fs.mkdirSync(path.dirname(plan.absolutePath), { recursive: true });
    fs.writeFileSync(plan.absolutePath, plan.content, "utf8");
  }
}

export function installHooks(cwd: string): HooksInstallResult {
  const targetRoot = requireInstalledTargetRoot(cwd);
  const conflicts: string[] = [];
  const directories = [
    ensureDirectoryPlan(targetRoot, CODEX_HOOKS_DIR, conflicts),
    ensureDirectoryPlan(targetRoot, HOOK_TEMPLATES_DIR, conflicts)
  ];
  const managedFiles = [
    planManagedFile(targetRoot, CODEX_HOOKS_CONFIG_PATH, buildHooksConfig(), conflicts),
    planManagedFile(targetRoot, path.join(CODEX_HOOKS_DIR, USER_PROMPT_SUBMIT_HOOK_FILE), buildUserPromptSubmitHook(), conflicts),
    planManagedFile(targetRoot, path.join(CODEX_HOOKS_DIR, PRE_TOOL_USE_HOOK_FILE), buildPreToolUseHook(), conflicts),
    planManagedFile(targetRoot, path.join(CODEX_HOOKS_DIR, STOP_HOOK_FILE), buildStopHook(), conflicts),
    planManagedFile(targetRoot, path.join(HOOK_TEMPLATES_DIR, "hooks.json"), buildHooksConfig(), conflicts),
    planManagedFile(targetRoot, path.join(HOOK_TEMPLATES_DIR, USER_PROMPT_SUBMIT_HOOK_FILE), buildUserPromptSubmitHook(), conflicts),
    planManagedFile(targetRoot, path.join(HOOK_TEMPLATES_DIR, PRE_TOOL_USE_HOOK_FILE), buildPreToolUseHook(), conflicts),
    planManagedFile(targetRoot, path.join(HOOK_TEMPLATES_DIR, STOP_HOOK_FILE), buildStopHook(), conflicts)
  ];

  if (conflicts.length > 0) {
    return {
      ok: false,
      targetRoot,
      created: [],
      unchanged: [],
      conflicts
    };
  }

  for (const directory of directories) {
    applyDirectoryPlan(directory);
  }

  for (const managedFile of managedFiles) {
    applyFilePlan(managedFile);
  }

  return {
    ok: true,
    targetRoot,
    created: [
      ...directories.filter((directory) => directory.action === "create").map((directory) => directory.relativePath),
      ...managedFiles.filter((file) => file.action === "create").map((file) => file.relativePath)
    ],
    unchanged: [
      ...directories.filter((directory) => directory.action === "unchanged").map((directory) => directory.relativePath),
      ...managedFiles.filter((file) => file.action === "unchanged").map((file) => file.relativePath)
    ],
    conflicts: []
  };
}

export function formatHookPathsForOutput(result: HooksInstallResult, paths: string[]): string[] {
  return paths.map((targetPath) => {
    const absolutePath = path.join(result.targetRoot, targetPath);
    return toRelativePath(result.targetRoot, absolutePath);
  });
}
