# Proposal

## Why

Movie Match needs a repeatable specification and implementation workflow before continuing feature development. WF-01 establishes OpenSpec without duplicating the existing product specification or losing backlog history.

## What Changes

- Pin OpenSpec locally and generate the Codex core skills.
- Configure English artifacts and project-specific discovery, scope, and verification guidance.
- Define ownership and incremental migration between product docs, capability specs, changes, and legacy tickets.
- Include artifact validation in the existing local and CI verification command.
- Preserve the agreed WF roadmap and subsequent request-routing decision in repository documentation so future chats can pick up individual tasks without this conversation.

## Capabilities

### New Capabilities

None. This is a tooling/documentation change with `skip_specs: true`; no product behavior contract changes.

### Modified Capabilities

None. Existing product behavior and scope remain in force.

## Impact

Development dependency and lockfile, generated `.agents/skills/openspec-*`, `openspec/config.yaml`, repository instructions, documentation, and package verification scripts. No application code, database schema, product UI, deployment configuration, or review gates change. Claude support, template repositories, model routing, automatic review loops, and deployment skills are deferred to later workflow tasks.
