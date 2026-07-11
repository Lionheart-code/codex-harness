# Agent Capability Matrix

## Purpose

This document defines the Phase 6 role matrix for permissions, working-directory policies, outputs, cost categories, and current availability.

## Matrix

| Role | Primary use | Allowed permission modes | Allowed working directory policies | Expected outputs | Typical cost/model category | Phase 6 availability |
| --- | --- | --- | --- | --- | --- | --- |
| `controller` | Task routing and boundary decisions | `read_only`, `review_only` | `repo_root`, `explicit_path` | plan notes, routing decisions, state guidance | expensive for complex coordination | documented only |
| `architect` | Architecture and decomposition | `read_only`, `review_only` | `repo_root`, `task_worktree`, `explicit_path` | design notes, plans, trade-off analysis | expensive | documented only |
| `scout` | Discovery and summarization | `read_only` | `repo_root`, `explicit_path` | findings, summaries, risk lists | cheaper | future external read-only role |
| `builder` | Scoped implementation | `write_worktree` | `task_worktree` | code changes, implementation summary | medium to expensive | Codex-first current default role |
| `verifier` | Review and acceptance analysis | `read_only`, `review_only` | `repo_root`, `task_worktree`, `explicit_path` | review findings, PASS/FIX_REQUIRED style output | expensive | documented only |
| `integrator` | Combine parallel outputs | `review_only`, `write_worktree` | `task_worktree`, `explicit_path` | integration notes, combined result | expensive | manual scaffold in Phase 16 |

## Role constraints

- External agents are disabled by default.
- External agents are read-only by default.
- No role implies trusted output without verification.
- Write-capable roles require explicit task worktree boundaries.
- API is optional, not required.
- App Server and provider-specific session mechanics are optional adapters, not
  mandatory core dependencies.
- Parallel leaves are opt-in and read-only by default; parallel writers must
  never share one worktree.
- Forked/subagent output is non-authoritative until a distinct review promotes
  it through repo-owned evidence contracts.

## Agent-family implications

- Codex is the primary builder and planner by default.
- Gemini CLI is a future read-only scout or summarizer.
- Cline/Roo-like agents require explicit workspace and approval boundaries.
- Aider-like agents require tight file scope and git-aware instructions.
- Custom agents must start as read-only until their boundaries are proven.
