# Self-hosting Skill Discovery

## Canonical source

Phase 23.6 uses this repo-owned source-of-truth:

```text
skills/self-hosting/**
```

This directory is product-source procedure material for developing
`codex-harness` itself.

## Discovery targets

Codex does not auto-discover arbitrary `skills/self-hosting/**` paths.

Documented Phase 23.6 discovery or install targets:

```text
.agents/skills/**      optional repo-local discovery or sync target
$HOME/.agents/skills/** optional user-level install target
```

Codex also supports other official/admin-managed skill locations, but Phase
23.6 relies only on the repo-local and user-level targets above.

## Boundary rules

- `skills/self-hosting/**` is the canonical source-of-truth.
- `.agents/skills/**` is a generated or local discovery target only in this
  repo unless a future reviewed boundary change says otherwise.
- `$HOME/.agents/skills/**` is a user-level install target only.
- Generated or local discovery targets must not become hidden source-of-truth.
- Prompt wrappers, if added later, remain derived invocation helpers and not
  authority.

## Packaging and release boundary

Phase 23.6 keeps self-hosting procedures in the product repository but outside
the packaged runtime allowlist. They are repo-owned operating artifacts, not
runtime files shipped by the current npm package.
