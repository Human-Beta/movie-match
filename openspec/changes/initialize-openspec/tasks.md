# Tasks

## 1. Local tooling and Codex integration

- [x] 1.1 Pin OpenSpec 1.14.1 and generate the six Codex core skills; verify the local CLI version and generated skill metadata.
- [x] 1.2 Configure English artifacts and project guidance; verify `openspec instructions` exposes the configured context and artifact rules.

## 2. Ownership and verification integration

- [x] 2.1 Document incremental adoption and backlog ownership, update repository entry points, and preserve product scope and review gates; verify links resolve and the diff contains no runtime changes or duplicated product specs.
- [x] 2.2 Add strict active/spec validation and archived-task checking to `pnpm verify`; verify `pnpm openspec:validate` and a deliberately invalid disposable delta prove the validation gate rejects malformed requirements.

- [x] 2.3 Preserve the agreed WF roadmap and WF-06 routing policy, link it from the documentation index and agent instructions, and verify its task IDs, links, and distinction between planned and active policies.

## 3. Repository verification

- [x] 3.1 Run `pnpm verify` and inspect the final diff for unintended files, secrets, scope expansion, or changes to legacy history.

## Workflow follow-up

- Publish the verified branch and pull request under `AGENTS.md`; report CI status on its current head.
- Complete `docs/review.md` gates before merging or archiving this tooling change.
- Archive after acceptance, then rerun `pnpm openspec:validate`.
