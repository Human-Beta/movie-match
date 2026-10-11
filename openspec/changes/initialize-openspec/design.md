# Design

## Context

`docs/README.md` points to `docs/v0.1.md` for product scope. `docs/stack.md` defines one Next.js app; `tasks/README.md` and numbered task files retain backlog and acceptance criteria. `.agents/skills/` already contains review and ticket-stack skills. `docs/review.md` requires verified PRs and human review. `.github/workflows/ci.yml` runs `pnpm verify`, while `.github/workflows/production-release.yml` already owns production deployment.

## Goals / Non-Goals

**Goals:** Local reproducible CLI, Codex integration, English artifacts, explicit document ownership, and CI artifact validation.

**Non-Goals:** Runtime changes, wholesale specification/backlog migration, translated history, changed review gates, agent orchestration, Claude setup, templates, or deployment.

## Decisions

- Pin `@fission-ai/openspec` 1.14.1 as a dev dependency. The installed Node version satisfies its engine requirement. Use `pnpm exec` so a global CLI cannot silently select another version.
- Generate only Codex core skills. Keep project rules in `AGENTS.md` and `openspec/config.yaml` so regeneration does not erase custom behavior.
- Leave accepted product specs empty until the first capability adoption. Add no artificial tooling spec: this change explicitly skips deltas. Adopt existing behavior and proposed deltas separately during future capability work; replace overlapping detail with references when accepting it.
- Preserve legacy tickets and current review skills. New OpenSpec changes own their own checklist, while a migrated ticket becomes a link and retains its backlog ID/status.
- Add strict active/spec validation plus archived-task completion checking to `pnpm verify`; the existing CI job picks it up without a second workflow. Artifact linting complements implementation tests and does not prove scenario correctness.
- No new modules or abstractions are needed. This change affects tooling and docs only, so runtime boundaries, database migrations, and browser verification do not change.

## Risks / Trade-offs

- Partial adoption could produce competing descriptions: `docs/openspec.md` assigns ownership and requires removing duplicated detailed requirements during capability adoption.
- Generated skills may be absent from an already open Codex session: document selecting them in the sidebar and reloading the project/session if necessary.
- The core profile does not configure independent QA or automatic review. Those remain later tasks; preserve existing review gates and archive only after acceptance.

## Open Questions

None for WF-01.
