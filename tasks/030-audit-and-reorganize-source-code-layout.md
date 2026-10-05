# 030 — Audit and reorganize source-code layout

## Goal

Review how application source files are grouped and placed across the repository, then make only the moves or directory splits that improve ownership and navigation. Keep runtime behavior and product scope unchanged.

## Dependencies

- [019 — Audit and refactor shared application code](019-refactor-shared-participant-access-and-ui-layouts.md): complete its decisions about shared components, hooks, and repositories first so this task can organize the resulting modules without duplicating that refactor.
- [Active specification](../docs/v0.1.md), [technology stack](../docs/stack.md), and `AGENTS.md` define the runtime boundaries and module organization rules to preserve.

## Context

- `app/join/[roomCode]` currently contains a large number of route-specific files. Determine whether focused subdirectories would make its responsibilities easier to navigate while keeping Next.js route entry points in their required locations.
- Inspect other code-bearing directories too, including `app/`, `lib/`, `scripts/`, and any additional source or test directories discovered during the audit. Do not assume that the busiest folder is the only one that needs attention.
- Task 019 focuses on shared logic and UI abstractions. This task focuses on file and directory ownership, grouping, and placement; do not repeat its semantic refactoring work.

## Scope / Requirements

### Discovery

- Inventory the main responsibilities and file roles in the code-bearing source directories, starting with `app/join/[roomCode]` and checking other relevant feature, domain, shared UI, script, and test folders.
- For each candidate group, choose and record one outcome: keep its current layout, group files in a focused subdirectory, move them to an existing feature/domain owner, or split an oversized module. Give a short reason based on responsibility, ownership, imports, or route semantics.
- Use directory and file counts only as signals for inspection. Do not move files or create directories solely to meet an arbitrary size threshold.

### Focused reorganization

- Apply only moves or directory splits that have a clear ownership or navigation benefit. Keep feature-specific files near their feature unless another existing module has clear ownership or actual reuse.
- Preserve Next.js route structure and special-file conventions. Read the installed Next.js guide for the affected routing behavior before moving route files.
- Preserve the repository's established module boundaries: do not add barrel exports merely to shorten imports, do not create generic `utils`, `types`, or `components` folders without a cohesive responsibility, and avoid dependency cycles.
- Update imports, tests, and references for every moved file. Keep tests organized consistently with their defining modules.
- Do not change game behavior, public contracts, database schema, browser/server trust boundaries, dependencies, styling, or product copy as part of this task. Split any necessary behavioral change into its own task.

## Acceptance Criteria

- A concise audit records the directories reviewed, candidate groups, and a keep/move/group/split decision with rationale for each candidate.
- The applied directory layout has clear ownership and is easier to navigate; no files were moved solely because a folder exceeded a chosen count.
- Next.js routes and server/client boundaries remain correct, with no unintended route changes, dependency cycles, duplicate definitions, or unresolved imports.
- Application behavior and public contracts are unchanged; any justified behavior change is deferred to a separate task.
- Relevant tests pass and `pnpm verify` succeeds.

## Verification

- Review the complete rename-aware diff and search imports, route entry points, tests, and references for every moved file.
- Run `pnpm verify` and any focused tests associated with moved modules.
- Smoke the existing `/tv`, `/tv/{roomCode}`, and `/join/{roomCode}` routes if route-related files moved; confirm route behavior is unchanged.

## Out of Scope

- Shared-logic, shared-hook, or shared-UI extraction covered by task 019, except a file move required to place a module in its established owner.
- Product behavior, visual redesign, a new design system, broad renaming, dependency changes, or mechanical relocation of every file.

## References

- Sources of truth: [active specification](../docs/v0.1.md), [technology stack](../docs/stack.md), [task 019](019-refactor-shared-participant-access-and-ui-layouts.md), and `AGENTS.md`.
