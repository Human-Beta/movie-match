---
name: review-notes
description: "Process the current GitHub user's private pending PR review comments as line-anchored prompts, scan the PR for sibling instances, apply clear fixes locally, and persist the outcomes in the PR review log. Use only when explicitly invoked during the solo Movie Match review loop."
---

# Process private review notes

Treat the current GitHub user's pending review as a temporary prompt queue for the local AI, not as feedback to publish. Respond in Ukrainian. The pull request review log is the durable memory that later Codex tasks use after the pending review is deleted.

## Modes

- Default mode is `fix`: answer questions, apply clear change requests, and verify the result.
- If the request includes `preview`, inspect and classify the notes without modifying code or GitHub state.

State the selected mode before processing.

## Resolve and capture

1. Verify that `gh` is authenticated and that the current repository is the intended GitHub repository.
2. Resolve the pull request from the number or URL in the request. Otherwise use the pull request for the current branch. If none can be resolved, ask for its number and stop.
3. In `fix` mode, confirm that the checked-out local branch is the pull request head branch. Preserve unrelated working-tree changes and stop if the intended edit target is uncertain.
4. Resolve the current GitHub viewer and find that user's `PENDING` review. If none exists, report that there are no notes to process and stop.
5. Capture every comment before any destructive action: review ID, comment ID, path, best available current or original line, body, and diff context. Pending comments may have a null current line, so use the original line and `diff_hunk` to recover the intended anchor.
6. Fetch all pull request issue comments through the paginated `repos/{owner}/{repo}/issues/{number}/comments` endpoint. Find root comments whose body contains the exact marker `<!-- movie-match-review-log:v1 -->` and continuation comments whose markers match `<!-- movie-match-review-log:v1:part-N -->`. The root is part 1; continuations start at `part-2`. If no marked comments exist, initialize an empty chain that may receive a new root later. Otherwise require exactly one root owned by the current viewer, require every continuation to have that owner and a unique contiguous positive integer part number, and require the root to link every continuation URL. Sort the parts numerically and load the complete ordered chain before processing any note. If the chain is duplicated, orphaned, has a numbering gap, has a foreign-owner part, or disagrees with the root links, stop without changing the log or deleting the pending review. These are normal PR conversation comments, not review bodies or inline review comments.
7. Report the pull request, pending review ID, comment count, and mode. If the comments look like final feedback intended for another developer rather than private prompts, stop without changing anything.

## Classify against current code

Read the current file and relevant task or specification context before accepting a note.

- **Question:** answer in chat with file-and-line evidence; do not change code solely because of a question.
- **Clear change request:** in `fix` mode, apply the smallest correct change. In `preview` mode, describe the proposed change only.
- **Ambiguous, disputed, unsafe, or out-of-scope note:** explain the concern and leave it unresolved; do not guess or edit.
- **Already satisfied note:** verify that the current code satisfies it and report it as a no-op.

Split mixed comments into their question and change-request parts. Do not broaden a local note into an unrelated refactor.

## Scan for sibling instances automatically

Do this for every captured note before editing or deleting anything; there is no separate similar-issues command.

1. When the note or the code analysis reveals a real issue, distill it into a crisp, checkable problem class. State how to detect it, what counts, and what does not. A pure information question may legitimately produce no problem class.
2. Read the complete pull request diff and the current content of every changed file. Scan all changed files for other instances of each problem class, skipping the original anchor.
3. Prefer lines added or modified by the pull request. Label relevant pre-existing instances separately.
4. Require a file-and-line location, explanation, severity, and confidence for every candidate. Adversarially verify candidates against the exclusions and surrounding code; discard unsupported matches.
5. In `fix` mode, treat each confirmed occurrence on a pull-request-added or modified line as part of the same accepted fix when it is unambiguous and within the active task scope. If a confirmed changed-line occurrence is ambiguous, unsafe, or out of scope, leave it unresolved and retain the pending review.
6. Do not expand the task merely to clean up pre-existing code. Record confirmed pre-existing occurrences separately and change them only when they are required for correctness, security, data integrity, or the task acceptance criteria.

## Maintain the durable pull request review log

In `fix` mode, create or update one compact PR conversation comment owned by the current viewer. Never publish the raw notes as inline review comments and never submit a GitHub review.

Use this shape:

```markdown
<!-- movie-match-review-log:v1 -->

## Movie Match review log

<details>
<summary>Batch <UTC timestamp> · head <code>&lt;sha&gt;</code> · pending review <code>&lt;review-id&gt;</code></summary>

### Batch <UTC timestamp> · head `<sha>` · pending review `<review-id>`

- Note `<comment-id>` — `<path>:<line>`
  - Prompt: <original note, with secrets redacted>
  - Classification: <question | change request | mixed | already satisfied | unresolved>
  - Problem class: <checkable class or none>
  - Similar scan: <confirmed changed-line and pre-existing locations, or none>
  - Outcome: <answer, locally applied changes awaiting an explicit commit and push, no-op reason, explicit decline, or unresolved reason>
  - Verification: <checks and result>

</details>
```

- Create the root log through `POST repos/{owner}/{repo}/issues/{number}/comments` or update a log part through `PATCH repos/{owner}/{repo}/issues/comments/{comment-id}`. Search the complete ordered chain for each pending-review comment ID. If an entry exists, update it in the part that already contains it; otherwise append it to the last part. Never recreate, move, or discard an earlier entry during an ordinary upsert.
- Keep entries concise but retain enough of the original prompt, normalized problem class, decision, and result for a new task to reconstruct why the code changed and to propose future conventions.
- Never claim that an applied change is present in the pull request head. Record it as locally applied and awaiting the separate explicit commit and push because this skill performs neither action.
- Redact credentials, tokens, personal data, and other secrets before writing to GitHub. Remember that a PR conversation comment follows the repository's visibility.
- Before updating a part, serialize its complete proposed body and leave a safe margin below GitHub's current comment-body limit. If a new entry would exceed that threshold, create the next contiguous continuation comment instead, beginning with `<!-- movie-match-review-log:v1:part-N -->`, then update the root with links to every continuation in numerical order. Never split one note entry across parts.
- After every write, fetch the root and every linked continuation again, reconstruct the ordered chain, and verify that each source note ID appears exactly once and that all previously stored note IDs remain present. Treat a failed verification as a failed log update.
- In `preview` mode, do not create or update the log.

## Finish safely

In `preview` mode, leave the pending review untouched and report the classification.

In `fix` mode:

1. Apply all unambiguous accepted changes.
2. Run `pnpm verify` plus any task-specific checks required by the affected code.
3. Upsert every note, its automatic sibling scan, its local outcome, and the verification result into the durable PR review-log chain. Fetch every part again and verify that every source comment ID appears exactly once and that no previously stored entry was lost.
4. Delete the pending review only when every note has been answered, applied, verified as already satisfied, or explicitly declined by the user; all required checks pass; and the durable log update has been verified.
5. If any note remains ambiguous, any required check fails, or the review log cannot be verified, keep the entire pending review intact so the raw prompts remain recoverable. The log may record the attempt as unresolved, but it never substitutes for the still-live raw notes.

Never create a replacement review, submit a review, write a review body, commit, push, or switch branches. Those are separate explicit actions.

## Report

Return, in order:

1. Answers to questions.
2. Applied changes with file-and-line locations.
3. Already-satisfied or declined notes with reasons.
4. Confirmed sibling occurrences and how each was handled.
5. Unresolved notes requiring a decision.
6. Verification results.
7. The durable review-log comment URL and whether it was created, updated, or left untouched.
8. Whether the pending review was deleted or deliberately retained.
