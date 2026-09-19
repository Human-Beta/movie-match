# 026 — Centralize database enum contracts

> Draft: audit every PostgreSQL enum and give each canonical value set one pure domain owner before changing production definitions.

## Goal

Перевірити всі PostgreSQL enum-контракти застосунку й усунути незалежне дублювання їхніх значень у Drizzle schema, domain types, runtime validators, services та UI.

## Context

Task 012 виніс `round_status` у pure domain module, з якого тепер походять і TypeScript types, і Drizzle enum values. Інші enum-и в `lib/db/schema.ts` досі переважно визначають values безпосередньо в schema, тоді як їхні unions або validators можуть окремо існувати в feature modules. Якщо один список зміниться без іншого, TypeScript може не виявити розходження на всіх boundaries.

## Scope

### Discovery

- Перевірити `room_status`, `participant_role`, `year_filter`, `round_status`, `vote_value`, `room_game_command` і `room_game_command_outcome`.
- Для кожного enum зібрати всі дубльовані string unions, const arrays/objects, Zod schemas, switch branches, defaults і persisted comparisons.
- Визначити canonical feature/domain owner та допустимий напрямок залежностей для кожного value set.
- Відрізнити database enum values від схожих UI/action states, які не є тим самим persisted contract.

### Refactoring

- Додати pure modules для canonical enum values лише там, де один persisted contract справді використовується в кількох шарах.
- Виводити TypeScript unions із canonical readonly values, а Drizzle `pgEnum` будувати з того самого source of truth.
- Повторно використовувати canonical values у Zod parsers, defaults і exhaustive domain handling без browser imports із `server-only` або Drizzle modules.
- Не експортувати Drizzle schema в client/domain code і не створювати один глобальний enum module для неповʼязаних feature domains.
- Якщо persisted enum values змінюються, додати Drizzle migration і metadata та оновити `docs/domain/database-schema.md`; суто структурне перевикористання незмінних values не потребує міграції.
- Оновити unit та database integration coverage для default values, parsing і persisted transitions.

## Acceptance Criteria

- Кожен перевірений PostgreSQL enum має задокументованого canonical owner або явну причину залишитися schema-local.
- Один persisted value set не визначається незалежно в кількох production modules.
- Drizzle schema, TypeScript types і runtime validation використовують узгоджені canonical values без dependency cycles.
- Browser code не імпортує `lib/db/schema.ts` чи інший server-only module заради enum values або types.
- UI-only states не обʼєднані з database enums лише через однакові string literals.
- Будь-яка фактична schema-зміна має migration, metadata й синхронне оновлення database documentation.
- `pnpm verify` і цільові database integration checks проходять.

## Out of Scope

- Додавання нових enum values або зміна product workflow без окремого продуктового рішення.
- Централізація всіх TypeScript contracts поза persisted enum value sets — це належить task 025.
- Створення code generation pipeline для enum-ів без підтвердженої потреби.

## References

- Source: review of PR #33 for task 012.
- Related task: [025 — audit and consolidate duplicate TypeScript contracts](025-audit-duplicate-types.md).
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, `docs/domain/database-schema.md`, and `AGENTS.md`.
