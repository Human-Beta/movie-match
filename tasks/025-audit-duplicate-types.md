# 025 — Audit and consolidate duplicate TypeScript contracts

> Draft: identify semantic contract duplication before extracting shared types. The goal is one clear owner per domain concept, not one global types file.

## Goal

Перевірити TypeScript-код застосунку на дубльовані або незалежно повторені типи й обʼєднати лише ті контракти, які справді описують одну доменну сутність або один boundary.

## Context

У міру розвитку room, participant, round, ballot і match flows однакові string unions, result variants та object shapes можуть зʼявлятися в кількох modules. Структурна типізація TypeScript часто приховує таке дублювання: контракти залишаються сумісними, доки один із них не зміниться окремо. Водночас схожі за формою типи можуть навмисно представляти різні trust boundaries, тому механічне винесення всього у спільний файл створить сильніше coupling замість корисного reuse.

## Scope

### Discovery

- Зібрати inventory exported і суттєвих inline object types, string unions, discriminated unions, result types та tuple contracts у `app/` і `lib/`.
- Знайти точні дублікати й близькі за формою контракти; для кожного кандидата перевірити семантику, власника, runtime boundary і напрямок залежностей.
- Окремо перевірити дублювання canonical value sets між domain types, Drizzle schema, Zod parsers, repositories, services, Server Actions і public snapshots.
- Відрізнити справжній shared contract від навмисно різних persistence, service, public/client і UI representations.
- Для кожного кандидата задокументувати рішення: обʼєднати, вивести з canonical contract або залишити окремим із поясненням.

### Refactoring

- Визначити для кожного shared domain concept один модуль-власник і імпортувати тип із нього в consumers.
- Виводити discriminated unions і canonical scalar unions зі спільного контракту, якщо це не створює runtime dependency на server-only або framework-specific module.
- Зберегти окремі public/private та persistence/domain contracts, коли вони забезпечують allowlist, trust boundary або незалежну еволюцію.
- Залишити runtime validation на недовірених boundaries; спільний TypeScript type не замінює Zod parsing, database constraints чи exhaustive runtime checks.
- Видалити зайві leaf barrels і непрямі indexed/utility-derived типи, коли прямий імпорт named contract точніше показує власника.
- Не створювати глобальний `types.ts`, який змішує неповʼязані feature domains, і не додавати re-export layer без чіткої зовнішньої facade-відповідальності.
- Оновити unit, integration та compile-time coverage для змінених контрактів і exhaustive branches.

## Acceptance Criteria

- Є задокументований inventory кандидатів із рішенням та canonical owner для кожного справжнього дубліката.
- Кожна обʼєднана сутність має одне визначення, а consumers імпортують його без dependency cycles і без browser import із server-only modules.
- Навмисно окремі boundary contracts мають зафіксовану причину й не обʼєднані лише через однакову форму.
- Public payloads і надалі будуються через explicit allowlists та не отримують credential-bearing або internal fields.
- Runtime validation, database constraints і exhaustive handling залишаються узгодженими з TypeScript contracts.
- Немає нового catch-all types module, speculative generic abstractions або непрямих re-export chains.
- `pnpm verify` і всі цільові integration checks змінених boundaries проходять.

## Out of Scope

- Повний рефакторинг дубльованої runtime-логіки, React layouts або hooks — це належить task 019.
- Централізація правила про три картки та позиції 1–3 — це належить task 024.
- Зміна product behavior, API payloads або database schema без окремої потреби, виявленої audit.
- Перенесення локальних component props у shared modules без реального reuse case.

## References

- Source: follow-up after review of PR #33 for task 012.
- Related tasks: [019 — audit and refactor shared application code](019-refactor-shared-participant-access-and-ui-layouts.md) and [024 — centralize round-card cardinality](024-centralize-round-cardinality.md).
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, and `AGENTS.md`.
