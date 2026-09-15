# 019 — Audit and refactor shared application code

> Draft: perform the discovery pass before deciding which abstractions belong in production code. Do not turn every repeated line into a shared utility.

## Goal

Знайти та усунути справжні повтори в client hooks, server-side repositories/services і page-level UI layouts, не розширюючи продуктову поведінку й не створюючи абстракцій без чіткої відповідальності.

## Context

Під час review task 010 виявлено схожу логіку доступу до `participants` у `game-rounds` і `room-filters`, а також повторювані Tailwind page shells у TV та join screens. Додатково, ручне спостереження за застосунком виявило, що в нових PR зростає обсяг локальної client-side логіки; потрібно перевірити, чи є повторювані життєві цикли, async states або взаємодія зі Server Actions, які доречно оформити у вузькі `use*` hooks. Ця задача навмисно відокремлена від feature tasks, щоб локальні review-зауваження не перетворилися на неперевірений великий рефакторинг.

## Scope

### Discovery

- Пройтися по всіх repositories і services та скласти короткий перелік дубльованої або дуже схожої логіки.
- Окремо перевірити repositories, що працюють із таблицями поза своєю предметною назвою; почати з доступу до `participants` у `game-rounds` і `room-filters`.
- Перевірити повторювані HTML/Tailwind layout patterns, включно з `<main>` shells у TV та join екранах.
- Перевірити client components на повторювані `useEffect`, `useState`, request-id persistence, loading/error/retry lifecycle та взаємодію зі Server Actions.
- Для кожного кандидата визначити одне рішення: залишити локально, спростити локально або винести в спільний модуль чи компонент.

### Refactoring

- Виносити participant-oriented queries у окремий repository лише якщо після discovery він матиме одну чітку відповідальність, реальне повторне використання та не створюватиме циклічних залежностей.
- Виносити shared UI component лише для семантично однакових layout elements із кількома реальними call sites; не створювати primitive тільки заради скорочення `className`.
- Виносити `use*` hook лише коли він інкапсулює один чіткий client-side lifecycle та має щонайменше два доречні call sites; не приховувати product-specific state machine за generic hook.
- Зберегти наявні server/browser trust boundaries: browser mutations залишаються у validated Next.js server boundary з Drizzle.
- Не змінювати product flow, database schema або public client contracts, окрім змін, які є необхідним наслідком обраного рефакторингу.

## Acceptance Criteria

- Є задокументований список перевірених кандидатів і рішення для кожного з них.
- Кожен новий repository, service helper, React component або `use*` hook має конкретну відповідальність і щонайменше два доречні call sites, якщо це shared abstraction.
- Немає dependency cycles, дубльованих database loaders або послаблення browser-access/RLS меж.
- Поведінка існуючих game, participant і UI flows не змінюється; відповідні unit, integration або UI tests оновлені.
- `pnpm verify` і всі цільові перевірки змінених меж проходять.

## Out of Scope

- Нова продуктова функціональність.
- Заміна всіх Tailwind class strings на універсальний дизайн-системний шар.
- Створення repository/service abstraction без підтвердженого reuse case.

## References

- Source: review of PR #17 for task 010.
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, relevant task files, and `AGENTS.md`.
