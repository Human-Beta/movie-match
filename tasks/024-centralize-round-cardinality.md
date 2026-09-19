# 024 — Centralize round-card cardinality

> Draft: consolidate the product-fixed three-card contract without changing the current game rules.

## Goal

Визначити один доменний source of truth для фіксованої кількості карток у раунді та прибрати розпорошені production-константи, перевірки й повідомлення, які незалежно кодують значення `3`.

## Context

Поточний MVP завжди показує три фільми в позиціях 1–3. Це правило одночасно присутнє у schema constraints, генерації раунду, ballot validation, browser storage, snapshot tuples і match calculation. Локальне виправлення лише одного місця створило б ризик розходження контрактів, тому потрібен окремий наскрізний audit і сфокусований рефакторинг.

## Scope

### Discovery

- Зібрати всі production-використання, де число `3`, позиції 1–3 або tuple з трьох елементів представляють саме кардинальність раунду.
- Відокремити доменне правило від не повʼязаних числових значень: retry limits, UI spacing, test identifiers та інших локальних констант.
- Перевірити узгодженість TypeScript contracts, runtime validation, database constraints і повідомлень про помилки.

### Refactoring

- Додати компактний pure domain contract для кількості карток і допустимих позицій, придатний для server та browser code.
- Використати цей контракт у генерації раунду, ballot validation, request storage, snapshot validation і match calculation там, де це зменшує ризик розходження.
- Узгодити database constraint із доменним контрактом; якщо schema зміниться, додати Drizzle migration і metadata та оновити `docs/domain/database-schema.md`.
- Зберегти readonly tuple на boundaries, де порядок і точна довжина є частиною публічного контракту; runtime validation має передувати побудові tuple.
- Оновити unit та database integration coverage для коректної й некоректної кардинальності.

## Acceptance Criteria

- Production-код має один явний source of truth для трьох карток і позицій 1–3.
- Runtime boundaries відхиляють неповні, надлишкові, дубльовані або неправильно впорядковані набори карток і голосів.
- TypeScript public contracts зберігають точну readonly tuple-форму там, де порядок є частиною поведінки.
- Database constraint і доменні перевірки не суперечать одне одному.
- Не повʼязані значення `3` не замінені спільною доменною константою.
- `pnpm verify` і цільові database integration checks проходять.

## Out of Scope

- Зміна кількості карток у раунді або додавання configurable round size.
- Зміна алгоритму match calculation чи ballot scoring.
- Великий рефакторинг UI або repositories поза місцями, що безпосередньо кодують кардинальність раунду.

## References

- Source: review of PR #33 for task 012.
- Related task: [012 — Match calculation](012-match-calculation.md).
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, and `AGENTS.md`.
