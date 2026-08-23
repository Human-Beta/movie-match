---
name: ticket-stack
description: "Implement, inspect, or restack an ordered series of dependent Movie Match tasks as isolated Git worktrees and stacked pull requests, with repository verification and an independent Ukrainian review for every task. Use only when explicitly invoked for multiple tasks in this repository."
---

# Coordinate a Movie Match task stack

Run from one visible orchestrator task and delegate every implementation and review to isolated child contexts. The orchestrator owns the dependency graph, worktrees, gates, and final report; it must not implement all tasks in its own checkout.

Read [references/workflow.md](references/workflow.md) before creating branches, worktrees, workers, commits, or pull requests.

## Invocation

The invocation is the complete prompt. Do not require the user to repeat the workflow, add `/goal`, or write completion criteria.

- `$ticket-stack 005 006 007` implements those tasks in the proposed order.
- `$ticket-stack 005-007` is equivalent.
- `$ticket-stack next 3` selects the next three detailed unchecked tasks from `tasks/README.md`.
- `$ticket-stack status` inspects the current declared stack without writes.
- `$ticket-stack restack` updates proven downstream branches after an upstream rewrite or merge.

Default to `implement` when task IDs or `next N` are supplied. Treat implement mode as the user's explicit request for a durable, long-running objective. When a goal mechanism is available, create the goal from the selected task IDs and this skill's completion contract; do not require a separate `/goal` command or set a token budget.

Treat the supplied order as proposed, not proven. Read the task files and derive the actual dependency graph before creating lanes. If selected tasks are independent, use sibling branches and pull requests against `main` rather than inventing dependencies.

## Fixed boundaries

- Keep one task per implementation worker, branch, worktree, and pull request. Reviewer child contexts are read-only.
- Do not let two workers modify the same checkout or branch.
- Follow `AGENTS.md`, the active product specification, task acceptance criteria, and `docs/review.md`.
- Never merge pull requests, submit the user's pending review, invoke `$review-notes`, approve `$review-finalize`, or rewrite an upstream branch.
- Do not automatically accept or fix formal review findings. Return them for the user's decision unless a later invocation explicitly authorizes selected fixes.
- Preserve unrelated working-tree content and existing branches. Do not delete worktrees or branches merely because orchestration finished.
- Stop the affected lane on failed verification, ambiguous dependency, unsafe restack, ownership mismatch, or missing authority. Continue only independent work that cannot be invalidated by the blocker.

## Completion contract

Return one self-contained Ukrainian report containing:

- the dependency and pull-request base chain;
- branch, worktree, pull-request URL, and head SHA for every task;
- local checks, task-specific checks, and GitHub `Verify` status;
- the exact independent review result for every pull request;
- restacks performed and descendants that are still stale;
- blockers and the exact human review, finalization, and merge order.

A lane is ready for human review only when its intended changes are committed and pushed, its pull request targets the correct current base, required local checks pass, GitHub's current-head `Verify` check passes, and local, remote, and pull-request head SHAs agree. Review findings may remain, but must be surfaced explicitly rather than hidden behind a success label.

Complete implement mode when every selected lane is either ready for human review with a reported review result or explicitly blocked with the evidence and next decision needed. Do not wait for the human to review or merge the pull requests.
