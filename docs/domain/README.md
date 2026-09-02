# Domain documentation

This directory explains Movie Match business concepts independently from implementation workflow. All documents in this directory are written in English.

## Contents

- [Database schema](database-schema.md) — tables, fields, relationships, constraints, and the purpose of the current data model.
- [Idempotency and participant sessions](idempotency-and-participant-sessions.md) — request identifiers, participant credentials, secure storage, and retry behavior.

## Sources of truth

These guides explain the model but do not replace executable sources. When they disagree, use the active product specification for behavior and `lib/db/schema.ts` together with committed Drizzle migrations for the deployed database structure, then correct the stale guide.
