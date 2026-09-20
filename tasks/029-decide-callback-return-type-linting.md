# 029 — Decide callback return-type linting

> Draft: decide whether ESLint should require inferred return types for callbacks whose target type already defines the return contract.

## Goal

Зменшити зайві explicit `: void` у callback-функціях, коли return type уже точно задає surrounding typed contract, не послаблюючи явні module та public API boundaries.

## Context

Під час review task 012.3 callback-и, передані до typed options, повторювали return type у формі `(value): void =>`. Такий запис не додає інформації, коли contract параметра вже визначає return type. Водночас blanket-правило не має прибрати explicit return types із exported функцій або інших meaningful boundaries, де вони документують API й стабілізують implementation contract.

## Scope

- Оцінити `@typescript-eslint/explicit-function-return-type` та інші наявні ESLint options на предмет вузького enforcement для callback expressions і callback declarations.
- Перевірити rule configuration на representative production code, tests і React callbacks, включно з callbacks, які повертають cleanup function, promise або inferred value.
- Визначити, чи здатний lint точно виразити потрібне правило без широких false positives та без вимоги змінювати meaningful module/public API return types.
- Якщо конфігурація підходить, додати її, виправити лише порушення, які вона виявляє, і додати або оновити lint regression coverage, якщо tooling її підтримує.
- Якщо конфігурація не підходить, зафіксувати decision і коротку конвенцію в `AGENTS.md`; не додавати custom ESLint rule без окремого обґрунтування.

## Acceptance Criteria

- Є документоване рішення: focused ESLint rule, вузька repository convention або відмова від обох із поясненням trade-offs.
- Рішення зберігає explicit return types на exported/module/public API boundaries, де вони мають контрактну цінність.
- Callback-и з уже визначеним target return type не отримують дублюючу вимогу без конкретної користі.
- Конфігурація не створює непропорційних false positives для React effects, async callbacks, test callbacks або cleanup functions.
- `pnpm lint` і `pnpm verify` проходять.

## Out of Scope

- Масове переписування return types, не пов'язане з ухваленим rule.
- Створення custom ESLint plugin або rule без підтвердженої потреби.
- Зміна product behavior, Server Action boundaries або TypeScript compiler configuration.

## References

- Source: review note 4057897248 on PR #37 for task 012.3.
- Related task: [019 — Audit and refactor shared application code](019-refactor-shared-participant-access-and-ui-layouts.md).
- Sources of truth: `docs/README.md`, `docs/stack.md`, and `AGENTS.md`.
