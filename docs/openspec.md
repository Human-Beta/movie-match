# OpenSpec workflow

Movie Match uses the pinned local OpenSpec CLI with the Codex core profile. Run `pnpm install` after checkout, then use `pnpm exec openspec` for every CLI command. A global installation is unnecessary. Planning artifacts and new task files are written in English; chat language is independent.

## Artifact ownership

| Location                                               | Owns                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `docs/README.md` and its active specification          | Product scope and the behavior not yet adopted into capability specs               |
| `openspec/specs/<capability>/spec.md`                  | Accepted requirements and scenarios for an adopted capability                      |
| `openspec/changes/<change>/proposal.md`                | Proposed outcome, scope, and affected capabilities                                 |
| `openspec/changes/<change>/specs/<capability>/spec.md` | Requirement deltas awaiting acceptance; these do not describe the shipped baseline |
| `openspec/changes/<change>/design.md`                  | Implementation decisions grounded in the existing code and tests                   |
| `openspec/changes/<change>/tasks.md`                   | The change's implementation and verification checklist                             |
| `tasks/README.md`                                      | Existing backlog order and task status, including links to migrated changes        |
| Unmigrated `tasks/<id>-*.md`                           | Legacy ticket scope and acceptance criteria                                        |
| `docs/stack.md`, domain guides, and `docs/review.md`   | Architectural boundaries, model explanations, and review/release gates             |

The active product specification remains the authority for product scope. Accepted OpenSpec requirements refine that scope; a proposal cannot silently expand it. Resolve a contradiction before implementation rather than choosing whichever document is more convenient.

Adopt capabilities when working on their next change. First capture the relevant existing behavior as the baseline, then distinguish the proposed delta. When accepting that capability, replace overlapping detailed requirements in the active document with a link to its accepted spec in the same change. Retain the product-level scope there. Do not create an independent second copy of the same behavior.

No product capabilities are bulk-imported during WF-01. `openspec/specs/` starts empty intentionally. The tooling-only `initialize-openspec` change has `skip_specs: true` because it changes development tooling rather than product behavior.

## Backlog migration

Keep existing ticket IDs and ordering. Until a ticket is migrated, implement it against its existing task file. When selecting a ticket for OpenSpec, move its operative scope and acceptance criteria into the change artifacts, retain a short legacy ticket containing its ID and a link, and replace any detailed legacy implementation checklist with that link. Keep status only in the backlog index and implementation progress only in OpenSpec tasks. Preserve completed Ukrainian task history.

After archive, update the ticket's link to `openspec/changes/archive/<date>-<change>/`. Do not generate new numbered task files for work already owned by an OpenSpec change. Existing `ticket-stack` and review skills continue to serve their current workflows; changing orchestration is separate work.

## Codex workflow

The generated skills live in `.agents/skills/openspec-*`. In Codex desktop, select a skill from the Skills sidebar; where skill references are supported, use its `$` name. Reload the project/session if newly installed skills are not yet listed.

1. Use `$openspec-explore` for read-only investigation when requirements are unclear.
2. Use `$openspec-propose` to create a proposal, requirement deltas, design, and tasks. Review these artifacts before requesting implementation.
3. Ask to apply the approved change with `$openspec-apply-change`. The agent uses the checklist, runs `pnpm verify` and any task-specific checks, and publishes a pull request under `AGENTS.md`.
4. Use `$openspec-update-change` when the agreed plan needs revision. Material scope or behavior changes need an explicit user decision.
5. Complete the review gates in [Review workflow](review.md). OpenSpec does not replace AI review, human review, CI, or the existing release workflow.
6. Use `$openspec-archive-change` after acceptance to synchronize deltas and archive the completed change. `$openspec-sync-specs` is available when synchronization is needed before archive. Update any linked ticket and run `pnpm openspec:validate` afterward.

For a tooling, documentation, or pure refactor change with no behavior changes, set `skip_specs: true` in its `.openspec.yaml` and create no delta specs. Explain that choice in the proposal. Do not fabricate a requirement to make validation pass.

Useful inspection commands:

```bash
pnpm exec openspec list
pnpm exec openspec list --specs
pnpm exec openspec status --change <change-name>
pnpm exec openspec instructions apply --change <change-name> --json
pnpm openspec:validate
pnpm verify
```

`pnpm openspec:validate` strictly validates active changes and accepted specs, then checks archived task completion. It is included in `pnpm verify`, so the existing GitHub `Verify` job runs it too. It checks artifact structure, not whether the implementation satisfies the scenarios; tests and review provide that evidence.

## Maintenance

`package.json` and `pnpm-lock.yaml` pin the CLI version; generated skill metadata records its generator version. Repository-specific guidance belongs in `AGENTS.md`, this guide, and `openspec/config.yaml`, not in generated skills.

For an intentional upgrade, update the exact dependency version, regenerate the Codex integration, format the generated files, and verify the diff:

```bash
pnpm add -D -E @fission-ai/openspec@<approved-version>
pnpm exec openspec update
pnpm exec prettier --write .agents/skills/openspec-*/SKILL.md
pnpm verify
```

For recovery of the current Codex integration, use `pnpm exec openspec init --tools codex --profile core --language English --no-animation`. Review changes to `openspec/config.yaml`; preserve its project-specific guidance. Claude integration, model routing, automatic review/fix loops, and deployment commands are not configured by WF-01. Their agreed follow-up work, including automatic request routing in WF-06, is recorded in the [Agent workflow roadmap](workflow-roadmap.md).
