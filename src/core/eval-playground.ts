import * as fs from "node:fs";
import * as path from "node:path";
import { getEvalCorpus, validateEvalCorpus } from "./eval-corpus";
import { runGitCommand } from "./git";
import { PLAYGROUND_CORPUS_FILE, PLAYGROUND_MARKER_FILE, PLAYGROUND_SMOKE_RESULTS_FILE } from "./paths";

export type PlaygroundProjectName = "python-app" | "ts-app";

interface PlaygroundMarker {
  managed_by: "codex-harness";
  kind: "playground";
  created_from: string;
}

export interface PlaygroundRoot {
  productRoot: string;
  rootPath: string;
}

export interface PlaygroundInitResult extends PlaygroundRoot {
  markerPath: string;
  corpusPath: string;
  seededProjects: PlaygroundProjectName[];
  status: "initialized" | "reinitialized";
}

export interface PlaygroundCleanResult extends PlaygroundRoot {
  removed: boolean;
}

function getProductRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

function normalizePath(targetPath: string): string {
  let resolved: string;

  try {
    resolved = fs.realpathSync.native(targetPath);
  } catch {
    resolved = path.resolve(targetPath);
  }

  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(normalizePath(parentPath), normalizePath(childPath));
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function requireProductRootCwd(cwd: string): string {
  const productRoot = getProductRoot();

  if (!samePath(cwd, productRoot)) {
    throw new Error("Phase 15 eval commands must run from the codex-harness product repository root.");
  }

  return productRoot;
}

function getMarkerPath(rootPath: string): string {
  return path.join(rootPath, PLAYGROUND_MARKER_FILE);
}

function getCorpusPath(rootPath: string): string {
  return path.join(rootPath, PLAYGROUND_CORPUS_FILE);
}

function getSmokeResultsPath(rootPath: string): string {
  return path.join(rootPath, PLAYGROUND_SMOKE_RESULTS_FILE);
}

function getManagedMarker(productRoot: string): PlaygroundMarker {
  return {
    managed_by: "codex-harness",
    kind: "playground",
    created_from: path.basename(productRoot)
  };
}

function readManagedMarker(rootPath: string): PlaygroundMarker | undefined {
  const markerPath = getMarkerPath(rootPath);

  if (!fs.existsSync(markerPath) || !fs.statSync(markerPath).isFile()) {
    return undefined;
  }

  const parsed = JSON.parse(fs.readFileSync(markerPath, "utf8")) as Partial<PlaygroundMarker>;

  if (
    parsed.managed_by !== "codex-harness" ||
    parsed.kind !== "playground" ||
    typeof parsed.created_from !== "string" ||
    parsed.created_from.trim().length === 0
  ) {
    throw new Error(`Invalid playground marker: ${markerPath}`);
  }

  return {
    managed_by: parsed.managed_by,
    kind: parsed.kind,
    created_from: parsed.created_from
  };
}

function isDirectoryEmpty(targetPath: string): boolean {
  return fs.readdirSync(targetPath).length === 0;
}

function ensureSafePlaygroundLocation(productRoot: string, rootPath: string): void {
  const productParent = path.resolve(productRoot, "..");
  const parsedRoot = path.parse(rootPath).root;

  if (samePath(rootPath, productRoot)) {
    throw new Error(`Refusing to manage the product repository as a playground: ${rootPath}`);
  }

  if (isPathInside(productRoot, rootPath)) {
    throw new Error(`Refusing to manage a playground inside the product repository: ${rootPath}`);
  }

  if (samePath(rootPath, productParent)) {
    throw new Error(`Refusing to manage the parent directory as a playground: ${rootPath}`);
  }

  if (samePath(rootPath, parsedRoot)) {
    throw new Error(`Refusing to manage a filesystem root as a playground: ${rootPath}`);
  }
}

function ensureSafeCleanTarget(productRoot: string, rootPath: string): void {
  const productParent = path.resolve(productRoot, "..");
  const parsedRoot = path.parse(rootPath).root;

  if (samePath(rootPath, productRoot)) {
    throw new Error(`Refusing to clean the product repository: ${rootPath}`);
  }

  if (samePath(rootPath, productParent)) {
    throw new Error(`Refusing to clean the product repository parent: ${rootPath}`);
  }

  if (isPathInside(productRoot, rootPath)) {
    throw new Error(`Refusing to clean a playground inside the product repository: ${rootPath}`);
  }

  if (samePath(rootPath, parsedRoot)) {
    throw new Error(`Refusing to clean a filesystem root: ${rootPath}`);
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function removeIfExists(targetPath: string): void {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function getSampleProjectFiles(projectName: PlaygroundProjectName): Array<{ relativePath: string; content: string }> {
  if (projectName === "python-app") {
    return [
      {
        relativePath: "README.md",
        content: "# python-app\n\nDisposable playground sample.\n"
      },
      {
        relativePath: "app.py",
        content: [
          "def greet(name):",
          '    return "Helo, " + name',
          ""
        ].join("\n")
      },
      {
        relativePath: "verify.mjs",
        content: [
          'import fs from "node:fs";',
          "",
          "const mode = process.argv[2];",
          'const app = fs.readFileSync(new URL("./app.py", import.meta.url), "utf8");',
          "",
          'if (mode !== "bugfix") {',
          '  console.error(`Unsupported python-app verify mode: ${mode ?? ""}`);',
          "  process.exit(1);",
          "}",
          "",
          'if (!app.includes(\'return "Hello, " + name\')) {',
          '  console.error("Expected bugfix to update the greeting.");',
          "  process.exit(1);",
          "}",
          "",
          'process.stdout.write("python-app bugfix verified\\n");',
          ""
        ].join("\n")
      }
    ];
  }

  return [
    {
      relativePath: "README.md",
      content: "# ts-app\n\nDisposable playground sample.\n"
    },
    {
      relativePath: path.join("src", "main.ts"),
      content: [
        "export function greet(name: string): string {",
        "  return `Hello, ${name}`;",
        "}",
        ""
      ].join("\n")
    },
    {
      relativePath: "verify.mjs",
      content: [
        'import fs from "node:fs";',
        "",
        "const mode = process.argv[2];",
        'const readme = fs.readFileSync(new URL("./README.md", import.meta.url), "utf8");',
        'const featurePath = new URL("./src/feature.ts", import.meta.url);',
        "",
        'if (mode === "feature") {',
        "  if (!fs.existsSync(featurePath)) {",
        '    console.error("Expected feature.ts to exist.");',
        "    process.exit(1);",
        "  }",
        "",
        '  const feature = fs.readFileSync(featurePath, "utf8");',
        '  if (!feature.includes("export function buildGreeting(name: string): string")) {',
        '    console.error("Expected feature.ts to contain buildGreeting.");',
        "    process.exit(1);",
        "  }",
        "",
        '  process.stdout.write("ts-app feature verified\\n");',
        "  process.exit(0);",
        "}",
        "",
        'if (mode === "docs") {',
        '  if (!readme.includes("## Usage")) {',
        '    console.error("Expected README to include a Usage section.");',
        "    process.exit(1);",
        "  }",
        "",
        '  process.stdout.write("ts-app docs verified\\n");',
        "  process.exit(0);",
        "}",
        "",
        'console.error(`Unsupported ts-app verify mode: ${mode ?? ""}`);',
        "process.exit(1);",
        ""
      ].join("\n")
    }
  ];
}

function writeSampleProject(projectRoot: string, projectName: PlaygroundProjectName): void {
  fs.mkdirSync(projectRoot, { recursive: true });

  for (const file of getSampleProjectFiles(projectName)) {
    const targetPath = path.join(projectRoot, file.relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.content, "utf8");
  }
}

function runGitOrThrow(cwd: string, args: string[]): void {
  const result = runGitCommand(cwd, args);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
}

function resetSampleProject(rootPath: string, projectName: PlaygroundProjectName): void {
  const projectRoot = path.join(rootPath, projectName);
  const worktreeRoot = path.join(rootPath, ".codex-harness-worktrees", projectName);

  removeIfExists(projectRoot);
  removeIfExists(worktreeRoot);
  writeSampleProject(projectRoot, projectName);
  runGitOrThrow(projectRoot, ["init"]);
  runGitOrThrow(projectRoot, ["config", "user.email", "playground@example.com"]);
  runGitOrThrow(projectRoot, ["config", "user.name", "Playground User"]);
  runGitOrThrow(projectRoot, ["add", "."]);
  runGitOrThrow(projectRoot, ["commit", "-m", "init"]);
}

export function resolvePlaygroundRoot(cwd: string, explicitRoot?: string): PlaygroundRoot {
  const productRoot = requireProductRootCwd(cwd);
  const rootPath = explicitRoot
    ? path.resolve(productRoot, explicitRoot)
    : path.resolve(productRoot, "..", "codex-harness-playground");

  return {
    productRoot,
    rootPath
  };
}

export function initializePlayground(cwd: string, explicitRoot?: string): PlaygroundInitResult {
  const { productRoot, rootPath } = resolvePlaygroundRoot(cwd, explicitRoot);
  ensureSafePlaygroundLocation(productRoot, rootPath);

  let status: "initialized" | "reinitialized" = "initialized";

  if (fs.existsSync(rootPath)) {
    if (!fs.statSync(rootPath).isDirectory()) {
      throw new Error(`Playground root exists but is not a directory: ${rootPath}`);
    }

    const marker = readManagedMarker(rootPath);

    if (!marker) {
      if (!isDirectoryEmpty(rootPath)) {
        throw new Error(`Refusing to initialize a non-empty unmanaged playground target: ${rootPath}`);
      }
    } else {
      status = "reinitialized";
    }
  } else {
    fs.mkdirSync(rootPath, { recursive: true });
  }

  writeJsonFile(getMarkerPath(rootPath), getManagedMarker(productRoot));
  validateEvalCorpus(getEvalCorpus());
  writeJsonFile(getCorpusPath(rootPath), { tasks: getEvalCorpus() });
  removeIfExists(getSmokeResultsPath(rootPath));
  resetSampleProject(rootPath, "python-app");
  resetSampleProject(rootPath, "ts-app");

  return {
    productRoot,
    rootPath,
    markerPath: getMarkerPath(rootPath),
    corpusPath: getCorpusPath(rootPath),
    seededProjects: ["python-app", "ts-app"],
    status
  };
}

export function cleanPlayground(cwd: string, explicitRoot?: string): PlaygroundCleanResult {
  const { productRoot, rootPath } = resolvePlaygroundRoot(cwd, explicitRoot);
  ensureSafeCleanTarget(productRoot, rootPath);

  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    throw new Error(`Managed playground root not found: ${rootPath}`);
  }

  if (!readManagedMarker(rootPath)) {
    throw new Error(`Refusing to clean an unmanaged playground root: ${rootPath}`);
  }

  fs.rmSync(rootPath, { recursive: true, force: true });

  return {
    productRoot,
    rootPath,
    removed: true
  };
}

export function requireManagedPlayground(cwd: string, explicitRoot?: string): PlaygroundRoot {
  const resolved = resolvePlaygroundRoot(cwd, explicitRoot);

  if (!fs.existsSync(resolved.rootPath) || !fs.statSync(resolved.rootPath).isDirectory()) {
    throw new Error(`Managed playground root not found: ${resolved.rootPath}`);
  }

  if (!readManagedMarker(resolved.rootPath)) {
    throw new Error(`Managed playground marker not found: ${resolved.rootPath}`);
  }

  const corpusPath = getCorpusPath(resolved.rootPath);

  if (!fs.existsSync(corpusPath) || !fs.statSync(corpusPath).isFile()) {
    throw new Error(`Eval corpus not found: ${corpusPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(corpusPath, "utf8")) as { tasks?: unknown };

  if (!Array.isArray(parsed.tasks)) {
    throw new Error(`Eval corpus is invalid: ${corpusPath}`);
  }

  validateEvalCorpus(parsed.tasks as ReturnType<typeof getEvalCorpus>);

  return resolved;
}

export function getPlaygroundProjectPath(rootPath: string, projectName: PlaygroundProjectName): string {
  return path.join(rootPath, projectName);
}
