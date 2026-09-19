# 028 — Audit participant name and role presentation

> Draft: use participant display names where they make a shared game state understandable, while retaining roles where they convey authority or room structure.

## Goal

Визначити послідовне правило, де UI має показувати display name учасника, а де `Ведучий`/`Гість`, і застосувати його без зміни authorization, privacy або server-side contracts.

## Context

Ролі необхідні для room ownership, host-only controls і пояснення slot-ів у waiting state. Водночас у round result підпис `Ведучий`/`Гість` біля голосів не допомагає повʼязати реакцію з конкретною людиною. Snapshot уже безпечно містить обидва display names і roles, але кожен screen має різний контекст.

## Scope

### Discovery

- Зібрати всі presentation call sites для `participant.name`, `participant.role`, `Common.participantRole` та role-based labels у TV, joined-phone, voting, round-result, filters і future-result flows.
- Для кожного call site визначити, чи потрібна людині identity, responsibility/permission, slot structure або обидва сигнали.
- Перевірити snapshots і UI mapping на наявність потрібного display name поруч із vote/result data, не додаючи participant ID, access token, receipt або інших internal fields.
- Врахувати однакові display names, дуже довгі names, один підключений participant і unavailable/expired states.

### Refactoring

- У персональних та shared-result contexts показувати display names, коли вони однозначно пояснюють, чий це голос, status або дія.
- Зберігати `Ведучий`/`Гість` там, де роль описує permission, who can act, room slot або важливу product responsibility; за потреби поєднувати name і role без дублювання в одному короткому label.
- Визначити canonical presentation helper або component тільки якщо кілька семантично однакових call sites мають спільний data contract; не створювати глобальний participant UI abstraction заради одного result screen.
- Оновити Ukrainian messages, accessible labels і narrow/wide layouts без розширення localization scope.
- Не змінювати persisted `participant_role`, server authorization, RLS, public allowlists або Broadcast payloads.

## Acceptance Criteria

- У round result та інших audited shared-state contexts користувач може зрозуміти, чия реакція показана, за display name.
- Host-only actions і room ownership лишаються однозначними через role labels там, де це потрібно.
- Однакові або довгі names не призводять до неоднозначного, зламаного чи недоступного layout; fallback/role context визначені явно.
- UI не отримує нових sensitive/internal participant fields і не розкриває приватні votes до terminal round snapshot.
- TV, phone, waiting, voting, terminal-result і exhausted/unavailable presentations не мають missing-message або responsive regressions.
- `pnpm verify` і targeted browser checks проходять.

## Out of Scope

- Зміна participant naming policy, редагування name, справжні акаунти чи profiles.
- Зміна host authorization, participant-role enum, room capacity або privacy policy.
- Повний redesign match screen чи voting flow поза audited labels.

## References

- Source: hosted verification follow-up for PR #33.
- Related tasks: task 014 — Match screen, [027 — Audit shared translations and message namespaces](027-audit-shared-translations.md).
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, `docs/domain/database-schema.md`, and `AGENTS.md`.
