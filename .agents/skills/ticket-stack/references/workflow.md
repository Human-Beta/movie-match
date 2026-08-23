# Movie Match stacked-task workflow

## Preflight and task selection

1. Verify `gh` authentication and `Human-Beta/movie-match`, fetch remote state, and identify `main` as the integration branch.
2. Inspect the current working tree, all worktrees, relevant local and remote branches, and open pull requests without changing them.
3. Read `AGENTS.md`, `docs/README.md`, its active specification, applicable `docs/stack.md` and `docs/database.md` sections, `docs/review.md`, `tasks/README.md`, and every selected `tasks/<id>-*.md` file.
4. For `next N`, select only detailed unchecked tasks listed before the Backlog section. Stop if fewer than `N` detailed tasks are available; do not implement an undescribed backlog item.
5. Confirm that every selected task definition and shared prerequisite is committed on the intended starting branch. Do not base implementation on unreviewed local changes or an open specification pull request.
6. Derive dependencies from required contracts and overlapping modules. Record the graph and starting SHA for every lane.
7. Before reusing any branch, worktree, or pull request, prove its task identity, ownership, worktree path, local head, remote head, and pull-request base. On incomplete provenance or any conflict, stop that lane rather than checking it out, rewriting it, or pushing to it.

## Topology and scheduling

For a proven linear dependency series `005 -> 006 -> 007`:

```text
main
└── codex/005-<slug>
    └── codex/006-<slug>
        └── codex/007-<slug>
```

The first pull request targets `main`; each descendant targets its immediate predecessor. Use `codex/` branch names and one dedicated Git worktree per branch.

Use staggered parallelism:

1. Start the first implementation lane.
2. After it has a stable, verified, pushed checkpoint defining the required downstream contract, start the next lane from that exact head while the parent enters independent review.
3. Repeat for later lanes. Do not ask a downstream worker to duplicate unfinished upstream code merely to start everything simultaneously.

A stable checkpoint is committed, locally verified, pushed, and confirmed as the remote head. If its later review reveals a finding, report it; do not silently mutate that lane or start work that depends on a disputed contract.

## Implementation worker contract

Give each worker:

- its task file and acceptance criteria;
- absolute worktree path and exclusive branch ownership;
- exact base branch and SHA;
- upstream contracts it may rely on;
- the repository sources and relevant Next.js documentation it must read;
- permission to edit only its lane, run checks, commit intended changes with `[<task-id>]`, push, and create or update its pull request;
- a requirement to report changed files, verification, head SHA, pull request, and blockers.

Workers must implement the smallest complete task scope. Product mutations stay behind validated Next.js server boundaries and Drizzle; database access, RLS, grants, and migrations follow `AGENTS.md`. Update `tasks/README.md` only after that lane's acceptance criteria and required checks are satisfied.

Use `pnpm check` while iterating. Before publishing a completed lane, run `pnpm verify` plus every task-specific check. If a hook changes committed content, rerun the required checks on the committed tree. Fetch and prove local, remote, and pull-request heads match.

## Pull requests and review

Create or update each pull request with an accurate task-specific title, scope, dependency note, and verification evidence. Wait for the GitHub `Verify` check on the current head.

After a lane publishes a verified head, use a separate read-only reviewer child context. Review the complete `base...head` diff against the pull request's actual base and apply the Ukrainian actionable-findings format in `AGENTS.md`. Relay the exact result to the orchestrator; do not write automated hypotheses into the durable human review log.

Do not fix the formal findings during the initial stack run. A parent finding makes every dependent descendant potentially stale; mark that explicitly for the human.

## Restack mode

Invoking `restack` authorizes rewriting only proven descendant branches in the resolved Movie Match stack. Process them nearest to farthest.

Before each rewrite:

1. Fetch and verify the expected local and remote heads.
2. Resolve the old parent tip, new parent tip, pull-request base, and descendant-owned commit range with read-only Git and GitHub checks. Never guess a rebase boundary.
3. Create a recoverable local backup ref.
4. Rebase only descendant-owned commits. Stop if conflict resolution requires product judgment or upstream changes.
5. Run `pnpm verify` and task-specific checks.
6. Push only with `--force-with-lease` against the previously observed remote SHA.
7. Retarget the pull request after its predecessor merges, wait for fresh `Verify`, and rerun independent review against the new base.

Never restack an unproven, unrelated, or shared branch.

## Orchestrator state

Maintain a compact lane table with task, worker, worktree, branch, base, head, pull request, local checks, GitHub check, review, freshness, and blocker. Send user updates at meaningful gates without replaying worker logs.

Before completing, reconcile worker reports against Git and GitHub. A returned worker or green check from an older SHA is not completion evidence.
