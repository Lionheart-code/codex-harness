# Risk Review Checklist

Use this checklist in `/plan` before implementation.

## Scope risks

- Does current task accidentally include later phases?
- Does implementation require files not listed in the task?
- Does the plan add framework/platform complexity too early?

## Architecture risks

- Does it preserve harness/process separation?
- Does it avoid proof-loop runtime dependency?
- Does it keep hooks as sidecar?
- Does it avoid making `AGENTS.md` huge?

## Safety risks

- Can dry-run commands write files?
- Can install overwrite user files?
- Can worktree operations destroy local changes?
- Are dangerous shell/git commands blocked later by design?

## Verification risks

- Are acceptance criteria testable?
- Are commands explicit?
- Does review check diff against current task only?

## Cost/complexity risks

- Does the plan require API, database, dashboard, or subagents before MVP proves the lifecycle?
- Does the plan require `codex exec` before manual flow works?


## External agent risks

- Are external CLI agents read-only by default?
- Are external CLI commands allowlisted?
- Does every external agent run write an artifact to the task folder?
- Is API optional rather than required?
- Is write-mode blocked until worktree isolation and verifier are implemented?


## Per-agent boundary risks

- Does every external agent have an adapter profile?
- Is the working directory explicit?
- Is the agent read-only unless write_worktree is intentionally enabled?
- Is the output path inside `.harness/tasks/<task-id>/`?
- Is the command allowlisted?
- Are agent-specific instruction differences documented?
- Is there a timeout and log path?
- Is no agent output trusted without verification?


## Project memory and debt risks

- Does every agent run leave a durable artifact?
- Is there a distinction between raw logs and accepted project memory?
- Are done and not-done items explicitly tracked?
- Is debt recorded with severity, reason, location, and paydown condition?
- Can stale or superseded agent outputs be marked?
- Does final reporting surface unresolved debt and follow-ups?
- Is memory compaction planned without deleting raw evidence?


## Harness governance risks

- Does maintainer review produce proposals rather than silent changes?
- Does every proposal include evidence, risk, rollback, and acceptance criteria?
- Are daily/weekly/deep review modes separated?
- Does governance avoid requiring internet/API for deterministic local acceptance?
- Can a harness change be evaluated for regression before promotion?
- Are prompt or permission changes explicitly reviewed?


## Product/project layer risks

- Does a change affect the product repository or an installed project layer?
- Is install metadata versioned?
- Does upgrade dry-run show changes before writing?
- Are local installed-file modifications detected?
- Are product debt and project debt kept separate?
- Is the optional registry not treated as the source of truth?


## Hardening risks

- Does every machine-readable artifact have or plan a schema?
- Is migration explicit and dry-run capable?
- Are secrets and protected paths defined?
- Are external capabilities disabled unless explicitly configured?
- Do deterministic evals avoid API/internet dependency?
- Does prompt context have size and relevance control?
- Can a human operator safely decide when to implement or stop?


## Platform and release risks

- Does command execution avoid Bash-only assumptions?
- Are Windows, macOS, and Linux considered?
- Are paths normalized and stored consistently?
- Are external CLI agents launched through structured command definitions?
- Is shell mode opt-in and documented?
- Is package release protected by dry-run package contents review?
- Are trusted publishing/provenance, dependency minimization, and rollback policy documented before public release?
