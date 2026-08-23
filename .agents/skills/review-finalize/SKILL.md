---
name: review-finalize
description: "Finalize a solo Movie Match pull request by reading its durable review log, proposing reusable conventions, planning or applying an approved logical commit history, and checking merge readiness. Use only when explicitly invoked after review notes are resolved."
---

# Finalize a solo pull request

Respond in Ukrainian. Treat the durable pull request review log, the repository sources of truth, and Git history as the context; never depend on chat memory. Never merge the pull request.

## Modes and approval boundary

- Default mode is `plan`. It is read-only: inspect, propose, and report without changing files, Git history, the remote branch, or GitHub comments.
- `apply` mode is destructive because it may rewrite published commit history. Enter it only after the user explicitly approves the exact convention candidate IDs and exact commit grouping from a current plan.
- If an `apply` request lacks those approvals, if the plan was generated against another head SHA, or if the requested mapping is ambiguous, recompute the plan and stop for approval.

State the selected mode and pull request head SHA before proceeding.

## Resolve and preflight

1. Verify that `gh` is authenticated and that the current repository is the intended GitHub repository.
2. Resolve the pull request from the number or URL in the request. Otherwise use the pull request for the current branch. Fetch the base and remote head without switching branches.
3. Confirm that the checked-out branch is the pull request head branch. In `apply` mode require a clean working tree and stop if the remote head changed since the approved plan.
4. Resolve the current GitHub viewer. Find all of that viewer's `PENDING` reviews for the pull request. Any remaining pending review is a blocker for `apply` because `$review-notes` has not safely completed.
5. Find the viewer-authored PR conversation comment marked `<!-- movie-match-review-log:v1 -->` and any numbered continuation parts. Parse every batch and note. If no log exists, continue but state that there is no durable human-review history from which to derive conventions.
6. Read `docs/README.md`, the active specification, applicable `docs/stack.md` sections, the relevant task file, `tasks/README.md`, `AGENTS.md`, and applicable nested instruction files.
7. Revalidate every review-log note and confirmed changed-line sibling against the current pull request head and current files. Never trust a historical `applied locally`, `answered`, `already satisfied`, or `declined` label as proof that the current pull request still satisfies it. Treat a missing fix or regression as unresolved.

## Propose reusable conventions

Mine the durable review log, not deleted review threads and not the current chat.

1. Keep feedback that expresses a reusable rule about how future code should be designed, implemented, tested, or reviewed.
2. Extract a general rule from a concrete incident only when it would prevent the same class of problem elsewhere.
3. Drop one-off bugs, wrong values, local omissions, stale text, and questions that did not reveal a reusable invariant. When uncertain, drop the proposal.
4. Deduplicate against existing instructions. Mark a candidate as a refinement when it materially narrows or extends an existing rule.
5. Prefer consequential, non-obvious invariants. Recommend deterministic formatting, syntax, or dependency checks for tooling instead of `AGENTS.md`.
6. Recommend repository-wide rules for the root `AGENTS.md` and narrowly scoped rules for the closest applicable nested instruction file.

Assign stable IDs `C1`, `C2`, and so on within the plan. For each candidate show the exact imperative rule, target instruction file, supporting review-log note IDs, and whether it is new or a refinement. Do not edit instructions until the user approves the exact IDs.

## Plan a meaningful commit history

Inspect every commit and the complete `base...HEAD` diff. Classify commits by purpose and identify review-fix, fixup, typo, formatting-only, and "fix the previous commit" commits.

- Prefer one commit for a focused task or feature pull request.
- Keep multiple commits only when each is independently coherent, has a meaningful purpose, and does not merely repair an earlier commit in the same pull request.
- Fold review fixes and mechanical follow-ups into the logical commit they complete.
- Preserve genuinely separate changes as separate commits with repository-compliant messages.
- Never rewrite the base branch or commits outside the pull request range.

Assign plan IDs `H1`, `H2`, and so on. For each proposed final commit, list its message, purpose, and source commits. If history is already meaningful, propose no rewrite.

## Check merge readiness

Report these gates in both modes:

1. The complete diff stays within the active task and product specification.
2. The task acceptance criteria are satisfied, and `tasks/README.md` has the correct status only if they are satisfied.
3. No secrets, local environment files, disposable build artifacts, or unrelated changes are included.
4. Schema changes include Drizzle migrations and metadata plus required RLS and least-privilege grants.
5. A fresh evidence-based pass over the complete current diff finds no unresolved `P0` or `P1` issue; every `P2` issue is fixed or explicitly accepted with a reason.
6. `pnpm verify` and task-specific checks pass for the current content.
7. The pull request title and body accurately describe the final behavior and verification.
8. No pending private review remains and revalidation of the durable review log finds no unresolved changed-line issue.
9. GitHub checks are green for the current remote head. A history rewrite makes previous check results stale.

## Apply an approved plan safely

Only in `apply` mode, after all approval and preflight conditions hold:

1. Record the exact old head with a recoverable local ref under `refs/backup/review-finalize/` and report the ref name.
2. Apply only the approved convention candidates. Do not add rejected or unapproved rules.
3. Rewrite only `base..HEAD` according to the approved `H*` grouping. Preserve the final tree content except for the approved convention edits.
4. Use repository-compliant commit messages. Do not leave fixup, temporary, or "address review" commits in the final sequence.
5. Compare the resulting complete diff with the pre-rewrite content and approved convention edits. Stop before pushing if anything else changed.
6. Run `pnpm verify` and every relevant task-specific check.
7. Fetch the remote head again. Push rewritten history only with `--force-with-lease` against the exact expected remote SHA; never use an unconditional force push.
8. Wait for fresh GitHub checks on the new head and report failures. Do not reuse checks from the old head.
9. Append a compact finalization record to the durable review log: new head SHA, applied convention IDs, final commit list, verification, and check status. Never delete the review log.

## Report

In `plan` mode return, in order:

1. Blockers.
2. Convention candidates `C*`, or none.
3. Proposed final commit history `H*`, or confirmation that no rewrite is needed.
4. Merge-readiness checklist.
5. The exact approvals needed for `apply`.

In `apply` mode return, in order:

1. Applied conventions.
2. Final commit list.
3. Backup ref and pushed head SHA.
4. Local verification and fresh GitHub check results.
5. Remaining human action: inspect the final PR diff and merge manually when satisfied.
