# 022 — Investigate and reduce room-screen request latency

> Draft: establish a production-like performance baseline and identify the cause before selecting a remediation. Do not introduce caching, polling, or infrastructure solely because a request appears slow.

## Goal

Зрозуміти та усунути причину повільних і потенційно повторюваних запитів на room screens, зокрема `/tv/{roomCode}`, щоб малий payload не спричиняв приблизно секундну затримку або зайві fetch requests.

## Evidence

Під час ручної перевірки production deployment у DevTools Network помічено багато `fetch` requests до TV room route. Більшість response має розмір близько `0.3 kB`, але займає приблизно `1.0–1.1 s`; один request тривав `2.52 s`. Це лише спостереження, а не встановлена причина: до вимірювання потрібно відокремити server processing, network latency, cold start, React/Next.js refresh, Realtime fallback і browser-side повторні запити.

![DevTools Network: repeated TV room requests with approximately one-second latency](assets/network-request-latency-2026-09-15.png)

## Scope

### Baseline and diagnosis

- Відтворити сценарій на production-like deployment і локально, зафіксувавши route, initiator, статус, response size, TTFB, загальну тривалість та кількість requests для одного user action.
- Порівняти initial load, idle state, participant join, filter save, game start, reconnect і reload у TV та phone contexts.
- Визначити, чи requests є очікуваними Next.js/React refreshes, Realtime resync/fallback, Server Action rerenders, browser retries або дефектом lifecycle/subscription cleanup.
- Інструментувати лише потрібні server/client boundaries або використати deployment observability, не логуючи credentials, cookies, participant tokens чи room payloads.
- Виміряти database-query time окремо від application/render/network time; перевірити query plans лише для підтверджено повільних database queries.

### Remediation

- Виправити підтверджену першопричину найменшою зміною в межах чинної архітектури.
- Якщо причиною є дубльований lifecycle, стабілізувати inputs і cleanup без приховування проблеми штучним debounce або cache.
- Якщо причиною є database access, оптимізувати конкретний query/selection/index тільки після вимірювання та зберегти чинні RLS, Drizzle і server/browser trust boundaries.
- Після зміни повторити ті самі сценарії й порівняти request count та latency з baseline.

## Acceptance Criteria

- Є відтворюваний baseline з описаними сценаріями, request count і розкладом latency за етапами.
- Для кожного неочікуваного request або затримки задокументовано підтверджену першопричину або обґрунтовано, чому це очікувана framework/network поведінка.
- Підтверджена дефектна причина усунута без зміни product flow та без додавання непотрібної інфраструктури.
- One user action не створює зайвих повторних requests, subscriptions або Server Action mutations.
- Додано чи оновлено автоматизоване regression coverage там, де дефект можна надійно відтворити; за потреби доповнено inventory у task 018.
- До/після вимірювання показує покращення для виправленого сценарію або містить чітке обмеження, яке не контролює застосунок.
- `pnpm verify` і цільові перевірки змінених меж проходять.

## Out of Scope

- Додавання Redis, CDN cache, queue, окремого backend або іншої інфраструктури без підтвердженої потреби.
- Зміна product flow або Realtime product behavior заради метрик.
- Оптимізація всіх routes без baseline і конкретного evidence.

## References

- Evidence captured 2026-09-15: `tasks/assets/network-request-latency-2026-09-15.png`.
- Related tasks: [018 — automated integration coverage](018-automated-integration-coverage.md) and [019 — shared-code audit and refactoring](019-refactor-shared-participant-access-and-ui-layouts.md).
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, and `AGENTS.md`.
