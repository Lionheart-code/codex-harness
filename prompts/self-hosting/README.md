# Self-hosting Procedure Wrappers

This directory contains repo-owned manual invocation wrappers for self-hosting
procedures.

These files are derived, non-authoritative surfaces. Canonical procedure
authority remains in:

```text
skills/self-hosting/<procedure-id>/SKILL.md
skills/self-hosting/<procedure-id>/references/output-format.md
skills/self-hosting/<procedure-id>/references/source-notes.md
```

Each `procedure_id` in `skills/self-hosting/procedure-registry.json` must have
exactly one wrapper at:

```text
prompts/self-hosting/<procedure-id>.md
```

No extra Markdown files are allowed here except this `README.md`.

These checked-in wrappers are different from generated product prompts created
by `node bin/ch prompt ...`. Product prompts are task-local generated artifacts;
these wrappers are stable repo-owned procedure invocation helpers.

Wrappers must not grant runtime authority, launch agents, edit `run.json`, start
runs, create worktrees, bypass hooks, or replace formal product commands and
documented ingestion paths.
