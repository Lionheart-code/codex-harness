export type EvalCategory = "bugfix" | "feature" | "refactor" | "docs" | "deployment";

export interface EvalCorpusEntry {
  task_id: string;
  title: string;
  project: "python-app" | "ts-app" | "playground";
  category: EvalCategory;
  local_smoke: boolean;
}

export const LOCAL_SMOKE_TASK_IDS = [
  "task-fix-greeting-bug",
  "task-add-greeting-feature",
  "task-document-ts-usage",
  "task-playground-safety-lifecycle"
] as const;

const EVAL_CORPUS: EvalCorpusEntry[] = [
  {
    task_id: "task-fix-greeting-bug",
    title: "Fix greeting bug",
    project: "python-app",
    category: "bugfix",
    local_smoke: true
  },
  {
    task_id: "task-fix-python-readme-typo",
    title: "Fix python README typo",
    project: "python-app",
    category: "bugfix",
    local_smoke: false
  },
  {
    task_id: "task-fix-python-example-output",
    title: "Fix python example output",
    project: "python-app",
    category: "bugfix",
    local_smoke: false
  },
  {
    task_id: "task-fix-ts-comment-bug",
    title: "Fix ts comment bug",
    project: "ts-app",
    category: "bugfix",
    local_smoke: false
  },
  {
    task_id: "task-fix-ts-readme-link",
    title: "Fix ts README link",
    project: "ts-app",
    category: "bugfix",
    local_smoke: false
  },
  {
    task_id: "task-add-greeting-feature",
    title: "Add greeting feature",
    project: "ts-app",
    category: "feature",
    local_smoke: true
  },
  {
    task_id: "task-add-python-example-flag",
    title: "Add python example flag",
    project: "python-app",
    category: "feature",
    local_smoke: false
  },
  {
    task_id: "task-add-ts-cli-note",
    title: "Add ts CLI note",
    project: "ts-app",
    category: "feature",
    local_smoke: false
  },
  {
    task_id: "task-add-python-usage-snippet",
    title: "Add python usage snippet",
    project: "python-app",
    category: "feature",
    local_smoke: false
  },
  {
    task_id: "task-add-ts-api-snippet",
    title: "Add ts API snippet",
    project: "ts-app",
    category: "feature",
    local_smoke: false
  },
  {
    task_id: "task-refactor-python-spacing",
    title: "Refactor python spacing",
    project: "python-app",
    category: "refactor",
    local_smoke: false
  },
  {
    task_id: "task-refactor-python-comments",
    title: "Refactor python comments",
    project: "python-app",
    category: "refactor",
    local_smoke: false
  },
  {
    task_id: "task-refactor-ts-layout",
    title: "Refactor ts layout",
    project: "ts-app",
    category: "refactor",
    local_smoke: false
  },
  {
    task_id: "task-refactor-ts-names",
    title: "Refactor ts names",
    project: "ts-app",
    category: "refactor",
    local_smoke: false
  },
  {
    task_id: "task-refactor-shared-sample-copy",
    title: "Refactor shared sample copy",
    project: "playground",
    category: "refactor",
    local_smoke: false
  },
  {
    task_id: "task-document-ts-usage",
    title: "Document ts usage",
    project: "ts-app",
    category: "docs",
    local_smoke: true
  },
  {
    task_id: "task-document-python-usage",
    title: "Document python usage",
    project: "python-app",
    category: "docs",
    local_smoke: false
  },
  {
    task_id: "task-document-playground-lifecycle",
    title: "Document playground lifecycle",
    project: "playground",
    category: "docs",
    local_smoke: false
  },
  {
    task_id: "task-playground-safety-lifecycle",
    title: "Playground safety lifecycle",
    project: "playground",
    category: "deployment",
    local_smoke: true
  },
  {
    task_id: "task-release-smoke-template",
    title: "Release smoke template",
    project: "playground",
    category: "deployment",
    local_smoke: false
  }
];

export function getEvalCorpus(): EvalCorpusEntry[] {
  return EVAL_CORPUS.map((entry) => ({ ...entry }));
}

export function getLocalSmokeEntries(): EvalCorpusEntry[] {
  const corpusByTaskId = new Map(getEvalCorpus().map((entry) => [entry.task_id, entry] as const));

  return LOCAL_SMOKE_TASK_IDS.map((taskId) => {
    const entry = corpusByTaskId.get(taskId);

    if (!entry) {
      throw new Error(`Eval corpus is missing required local smoke task: ${taskId}.`);
    }

    if (!entry.local_smoke) {
      throw new Error(`Eval corpus task is required for local smoke but not marked local_smoke: ${taskId}.`);
    }

    return entry;
  });
}

export function validateEvalCorpus(entries: EvalCorpusEntry[]): void {
  if (entries.length !== 20) {
    throw new Error(`Eval corpus must contain exactly 20 tasks. Received: ${entries.length}.`);
  }

  const counts = {
    bugfix: 0,
    feature: 0,
    refactor: 0,
    docs: 0,
    deployment: 0,
    localSmoke: 0
  };
  const seenTaskIds = new Set<string>();

  for (const entry of entries) {
    if (seenTaskIds.has(entry.task_id)) {
      throw new Error(`Eval corpus contains a duplicate task_id: ${entry.task_id}.`);
    }

    seenTaskIds.add(entry.task_id);
    counts[entry.category] += 1;

    if (entry.local_smoke) {
      counts.localSmoke += 1;
    }
  }

  if (counts.bugfix !== 5) {
    throw new Error(`Eval corpus must contain 5 bugfix tasks. Received: ${counts.bugfix}.`);
  }

  if (counts.feature !== 5) {
    throw new Error(`Eval corpus must contain 5 feature tasks. Received: ${counts.feature}.`);
  }

  if (counts.refactor !== 5) {
    throw new Error(`Eval corpus must contain 5 refactor tasks. Received: ${counts.refactor}.`);
  }

  if (counts.docs !== 3) {
    throw new Error(`Eval corpus must contain 3 docs tasks. Received: ${counts.docs}.`);
  }

  if (counts.deployment !== 2) {
    throw new Error(`Eval corpus must contain 2 deployment tasks. Received: ${counts.deployment}.`);
  }

  if (counts.localSmoke !== 4) {
    throw new Error(`Eval corpus must contain exactly 4 local smoke tasks. Received: ${counts.localSmoke}.`);
  }
}
