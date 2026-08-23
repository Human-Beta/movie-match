# Review workflow

This is a solo-development workflow: the same person authors and reviews every change, with AI assistance. The workflow separates four responsibilities:

1. `/review` is a read-only AI first pass over the diff.
2. A private pending GitHub review is the human's line-anchored prompt queue.
3. `$review-notes` consumes that queue, automatically scans for sibling instances, applies safe fixes, and records durable outcomes.
4. `$review-finalize` proposes conventions, cleans commit history after explicit approval, and checks merge readiness.

GitHub pull requests provide the stable diff, CI, and durable review history. Codex chat history is never a source of truth for finalization.

## Why the review history is a PR comment

Deleting a private pending review would otherwise erase the only durable copy of the human prompts. `$review-notes` therefore maintains one ordinary pull request conversation comment marked with:

```html
<!-- movie-match-review-log:v1 -->
```

The visible comment is a compact, collapsed **Movie Match review log**. Each entry records the source note ID and anchor, the normalized problem class, confirmed sibling instances, the decision, the locally applied change or answer, and verification. Entries are upserted by source comment ID, so rerunning the skill is idempotent. If the comment becomes too large, the root remains part 1 and links numbered continuation comments starting at part 2. Every later run loads and validates that entire ordered chain, updates an existing note in its original part, and appends a new note to the last part or a newly created continuation. It never treats the root as the complete history after continuations exist.

This log is not a submitted review and does not pretend that another developer must act. It exists so a new Codex task can reconstruct what was reviewed after the private notes are gone. The comment follows the repository's visibility, so never put credentials, tokens, personal data, or other secrets in review notes.

## Review gates

Before a change is merged:

1. The implementation satisfies the relevant task acceptance criteria without expanding the active product scope.
2. `pnpm verify` passes locally. Run any additional checks named by the task, such as applying database migrations to a clean local PostgreSQL instance or exercising a UI flow in a browser.
3. The GitHub `Verify` check passes on the pull request's current head.
4. A Codex review has no unresolved high-impact findings. Medium-impact findings are fixed or explicitly accepted with a reason.
5. No private pending review remains, and the durable review log has no unresolved finding on pull-request-added or modified code.
6. The final commits are logical units rather than a sequence of implementation commits followed by commits that only repair them.
7. The human author has inspected the complete final pull request diff in the IDE.

## Fast local checks

Use the cheaper command while iterating:

```bash
pnpm check
```

It runs formatting validation, ESLint, and TypeScript. Before handing work off, pushing the final revision, consuming pending review notes, or finalizing the pull request, run:

```bash
pnpm verify
```

It adds the production build. The existing pre-commit hook continues to format and lint staged files; it is a convenience, not a substitute for these full checks or CI.

## Complete solo review flow

### 1. Implement, verify, and publish

Implement one task or focused change on its short-lived branch. If work starts on `main`, create the branch before editing. Keep the implementation in its Codex task and run `pnpm verify` plus the task-specific checks. After every completed, verified AI change batch, create a repository-compliant checkpoint commit and push it. If the branch has no open pull request, create one against `main` with an accurate title and body; otherwise verify that its remote head equals the pushed commit. This applies to feature implementation, fixes accepted from `/review`, refactors, and `$review-notes` fixes. A read-only answer or failed, unresolved, explicitly local experiment is not published.

### 2. Run the AI first pass

In the implementation task, run `/review` and choose **Review against a base branch**, using `main` as the base. The command uses a dedicated reviewer and does not modify the working tree. Keep review delivery in the current task so accepted findings can be fixed without copying them between tasks.

The initial response is deliberately compact and in Ukrainian:

```text
1. [P1] path/to/file.ts:42 — <problem and concrete impact>
2. [P2] path/to/other.ts:18 — <problem and concrete impact>
```

It is sorted from highest to lowest impact and contains no solutions or code examples. This lets the human scan the complete result quickly.

To inspect a subset, ask, for example:

```text
Давай обговоримо перші 5.
```

Codex keeps the original numbering and expands only those findings. Each expansion uses `Проблема`, `Доказ і вплив`, and `Рішення`. It includes a minimal `Приклад` only for a small fix. A large fix gets a `Високорівневий план` with the affected modules, classes, functions, or methods and their responsibilities, not a full implementation dump.

Tell Codex which finding numbers to fix. After the fixes pass verification, Codex commits and pushes that batch before `/review` runs again. `/review` findings are working analysis; the durable log is reserved for the human-selected notes from the IDE, which keeps it useful rather than recording every AI hypothesis.

### 3. Confirm the pull request

The first published AI change batch creates the pull request, so this is normally only a confirmation step. Verify that the pull request title and body describe the current scope and that its head equals the pushed local commit. Human review may begin while CI runs, but the current-head `Verify` check must pass before merge.

### 4. Review the pull request in the IDE

Open the pull request diff in the IDE and create a pending review. Add short comments directly to the relevant lines. These comments are private prompts for Codex, so they may be terse questions or directives. Do not submit the review.

Examples:

- `Why is this nullable?`
- `Use the existing helper here.`
- `This seems to bypass the server boundary; verify.`

### 5. Process all notes and sibling instances

Return to the implementation task or open any new Codex task on the same pull-request branch and invoke:

```text
$review-notes
```

The skill resolves the pull request and pending review from GitHub, so it does not need the old chat context. For every note it:

1. verifies the claim against the current code and task scope;
2. classifies it as a question, clear request, already satisfied, or unresolved;
3. derives a checkable problem class when the note reveals a real issue;
4. scans every changed pull-request file for sibling instances and adversarially removes false positives;
5. applies the original fix and confirmed in-scope sibling fixes on added or modified lines;
6. runs `pnpm verify` and task-specific checks;
7. creates one checkpoint commit for the verified fixes and pushes it without rewriting history;
8. verifies that the pull request remote head equals the pushed commit;
9. creates or updates the durable PR review log with that pushed SHA;
10. verifies that every source note ID is in the log;
11. only then deletes the private pending review.

Confirmed pre-existing occurrences are recorded separately and are not changed merely as cleanup. An ambiguous changed-line occurrence, an unresolved note, a failed check, or a failed log update keeps the entire pending review intact.

Use `$review-notes preview` for a completely read-only classification and similar scan. Preview mode changes neither code nor GitHub state.

The skill commits and pushes every successfully verified fix batch automatically. It keeps the pending review intact if verification, commit, push, remote-head confirmation, or durable-log verification fails. The resulting checkpoint commit may be temporary: `$review-finalize` later folds it into the approved logical history.

### 6. Re-review and repeat

Refresh the pull request in the IDE and inspect the updated diff. If more work is needed, create another private pending review and repeat `$review-notes`. Each batch is appended to the same durable log, so later tasks retain the complete decision history. After consequential review fixes are pushed, run `/review` again before finalization.

### 7. Plan finalization

When the human review is complete, invoke this from the pull-request branch, in the current or a new Codex task:

```text
$review-finalize
```

The default `plan` mode is read-only. It reads the durable PR log and current Git history, revalidates every historical outcome against the current PR head, and then reports:

- blockers such as remaining pending notes, unresolved log entries, scope drift, failing checks, or inaccurate PR metadata;
- genuine reusable convention candidates with IDs such as `C1` and their target instruction files;
- a proposed logical final commit history with IDs such as `H1`;
- the remaining merge-readiness gates.

Convention candidates are deliberately conservative. One-off bugs are dropped, existing rules are deduplicated, and deterministic checks are directed to tooling instead of `AGENTS.md`.

For commits, one focused task normally becomes one final commit. Multiple commits remain only when each is independently coherent and meaningful. Review-fix, typo, formatting, and "fix the previous commit" commits are folded into the logical commit they complete.

### 8. Approve and apply the exact finalization plan

Review the proposed convention text and commit mapping. In the same task, approve the exact IDs and grouping, for example:

```text
$review-finalize apply conventions C1; history H1 exactly as proposed
```

If finalization is started in another task or the branch head changed, run `$review-finalize` again before approving. The skill must bind approval to the head SHA it inspected; it never relies on an earlier chat's plan.

In `apply` mode the skill:

1. creates a recoverable local backup ref for the old head;
2. adds only the approved conventions;
3. rewrites only the pull request commit range according to the approved grouping;
4. proves the final tree is unchanged except for approved convention edits;
5. runs local verification;
6. pushes only with `--force-with-lease` against the expected remote SHA;
7. waits for fresh GitHub checks on the new head;
8. appends the finalization result to the durable review log.

It never merges the pull request.

### 9. Perform the final human gate and merge

Inspect the complete final diff and final commit list in the IDE. Confirm that the pull request title and body match the result and that CI is green for the current head. Merge manually only when satisfied.

## Repository setting

Configure the repository ruleset so the `Verify` status check is required before merging. Keep the final human diff inspection as the last gate even when automated review reports no findings.
