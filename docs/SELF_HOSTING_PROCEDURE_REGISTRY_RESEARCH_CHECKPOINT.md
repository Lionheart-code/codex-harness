# Self-Hosting Procedure Registry Research Checkpoint

## Purpose

Record the external and repo-local inputs used to shape the Phase 23.8
procedure registry and skill-surface work.

## Binding repo-owned conclusions

- `skills/self-hosting/**` remains the canonical product-source location for
  self-hosting procedures.
- A checked-in registry may summarize those procedures, but it must point back
  to the canonical files and must not replace them as authority.
- Prompt wrappers and install/discovery targets are derivative surfaces only.
- Hooks remain guardrails only in this phase and do not become task, review,
  lifecycle, or memory authority.
- `plan-review` should preserve a durable operator/runtime-facing decision
  record in addition to a human-readable review report.
- `plan-amend` should yield one effective amended plan for implementation so
  amendment history does not need manual merging.

## Official Codex sources consulted

- OpenAI Developers Codex overview and workflow surface:
  [developers.openai.com/codex/explore](https://developers.openai.com/codex/explore)
- OpenAI Developers Codex Skills documentation:
  [developers.openai.com/codex/skills](https://developers.openai.com/codex/skills)
- OpenAI Developers Codex AGENTS.md documentation:
  [developers.openai.com/codex/guides/agents-md](https://developers.openai.com/codex/guides/agents-md)
- OpenAI Developers Codex Hooks documentation:
  [developers.openai.com/codex/hooks](https://developers.openai.com/codex/hooks)

## Advisory host-packaging source consulted

- gstack host packaging and Codex install behavior:
  [github.com/garrytan/gstack/tree/main/setup](https://github.com/garrytan/gstack/tree/main/setup)

## Adopted conclusions

- Official Codex materials support skills as durable reusable workflow
  instructions rather than one-off chat prompts.
- Official Codex materials support repo-owned AGENTS and hook boundaries as
  configuration and guardrail surfaces, not as replacements for the task
  contract or reviewed plan boundary.
- Repo-owned self-hosting procedures should therefore keep canonical behavior
  in checked-in skill contracts and docs.
- Advisory host-packaging patterns are useful for understanding install and
  discovery targets, but they do not justify promoting generated or
  host-installed locations into authority.

## Rejected conclusions

- No separate plugin framework is needed for Phase 23.8.
- No provider/host adapter work is pulled forward from Phase 25.
- No broad hook authority expansion is justified by the consulted sources.
- No repo-wide rewrite of every review procedure is needed in this phase.

## Deferred work

- Later operator-consumed review procedures may adopt the same
  human-report-plus-durable-record split as `plan-review`.
- Later phases may align more surfaces with outcome-aware procedure semantics
  where that becomes operationally necessary.
- Full report and packet materialization remains Phase 24 work.
- Provider and host adapter surfaces remain Phase 25 work.
