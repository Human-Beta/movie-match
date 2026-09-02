# 018 — Automated browser, Server Action, and database integration coverage

> Draft: keep this task open for newly discovered high-value integration and regression scenarios. Refine priorities and implementation details before starting it.

## Goal

Додати автоматизоване покриття реальних меж між браузером, React, Next.js Server Actions і PostgreSQL, де unit-тести окремих service та helper модулів не можуть виявити помилки життєвого циклу, cookies, повторних render або framework integration.

## Initial Scope / Test Inventory

### P1 — Regression: automatic Server Action render loop

- Відкрити `/tv` у реальному браузері та перевірити, що автоматична підготовка кімнати завершується, створює або відновлює одну кімнату й не запускає необмежену послідовність Server Action requests після cookie refresh або React rerender.
- Відкрити `/join/{roomCode}` і перевірити, що `prepareJoinRoomAction` виконується лише для передбачених стабільних inputs, loading state завершується, а форма стає доступною без render/action loop.
- Порахувати або перехопити відповідні Server Action requests і перевірити bounded call count. Не покладатися лише на те, що UI зрештою став видимим.
- Запустити сценарії в development-compatible React Strict Mode та в production build, якщо їхня поведінка відрізняється.

Це regression coverage для дефекту, знайденого в PR #7: залежність Effect від referentially unstable translation function спричиняла Server Action, cookie-triggered tree refresh, новий render і повторний Effect без завершення.

### P1 — Join flow through the real browser and Server Action boundary

- Створити кімнату на TV, приєднати перший телефон як `host`, другий як `guest` і перевірити українські UI states.
- Перезавантажити joined phone page та перевірити відновлення тієї самої participant identity без нового row або зміни role.
- Повторно submit-нути форму й змоделювати retry або втрату response; idempotency token не повинен займати додатковий slot.
- Спробувати третє приєднання та перевірити стан room full, відсутність нового participant row і відсутність participant session cookie.
- Перевірити некоректний, неіснуючий, закритий і прострочений room code через реальні route та Server Action responses.

### P1 — Server Action cookie lifecycle

- Перевірити створення та повторне використання pending join cookie до terminal outcome.
- Після успішного join перевірити promotion того самого token у participant cookie та видалення pending cookie.
- Для terminal `room full` або `room unavailable` перевірити видалення pending cookie без створення participant cookie.
- Для неочікуваної transport або server failure перевірити, що pending idempotency token не втрачається перед безпечним retry.
- Перевірити `HttpOnly`, `SameSite=Lax`, room-scoped path, production `Secure` і expiration не пізніше `rooms.expiresAt`.
- Переконатися, що raw token не зʼявляється в URL, DOM, browser-readable storage, serialized action state або логах тестового сервера.

### P2 — Repository integration against PostgreSQL

- Покрити `ParticipantRepository.inspectRoom` реальною БД: room snapshot, participant lookup за token hash, participant count і нормалізацію відсутнього participant до `null`.
- Зберегти concurrency coverage для одночасних другого і третього join та перевіряти не лише result, а й остаточні rows, унікальні roles і token hashes.
- Перевірити rollback: помилка в locked transaction не залишає частково створеного participant.
- Додавати repository integration tests для майбутніх migrations, constraints, cascade cleanup і RLS/browser-access boundaries, коли відповідні задачі реалізують ці можливості.

### P2 — General browser lifecycle candidates

- Reload, back/forward navigation і повторний mount не створюють дубльованих mutations або subscriptions.
- Два незалежні browser contexts не ділять cookies, localStorage або participant identity.
- Loading і disabled states повертаються до terminal UI після validation, application, transport і framework failures.
- Майбутній Realtime flow перевіряє `0/2 → 1/2 → 2/2`, reconnect/resync, cleanup subscription і відсутність дублікатів у Strict Mode.
- Майбутнє expiration cleanup перевіряє логічне блокування простроченої кімнати та фізичне cascading deletion окремими інтеграційними сценаріями.

## Implementation Notes To Decide

- Обрати browser runner, який запускає справжній Next.js застосунок і підтримує ізольовані browser contexts, network inspection та production-build mode. Не додавати залежність до початку реалізації task.
- Визначити детермінований спосіб отримувати кількість Server Action requests без привʼязки до нестабільного внутрішнього wire format Next.js.
- Запускати PostgreSQL integration tests проти ізольованої test database зі свіжими migrations і гарантованим cleanup.
- Розділити швидкий обовʼязковий CI suite та повніші browser/database scenarios, якщо runtime стане суттєвим.
- Нові сценарії, знайдені під час review або ручного тестування, додавати до цього inventory з priority і посиланням на дефект або задачу.

## Draft Acceptance Criteria

- Регресійний тест відтворює нескінченний render/action loop на відомій дефектній реалізації та проходить на виправленій.
- Основний TV → host → guest → reload flow проходить через реальний Next.js runtime і PostgreSQL без mock service boundary.
- Cookie та idempotency assertions перевіряють як browser-visible behavior, так і остаточний database state.
- Test suite має bounded timeouts і завершується з корисною діагностикою замість зависання при render/action loop.
- Тести ізольовані, не залежать від порядку запуску та не залишають кімнати, учасників, cookies або server processes після завершення.
- Команди локального й CI запуску задокументовані англійською в актуальній tooling документації після вибору runner.
- `pnpm verify` та всі нові browser/database test commands проходять.

## Out of Scope For The Draft

- Реалізація нової продуктової поведінки лише для полегшення тестів.
- Перевірка зовнішнього Supabase Realtime до реалізації task 007.
- Вибір hosted CI provider або придбання стороннього test service без окремого рішення.

## References / Notes

- Початковий regression case знайдено під час ручної перевірки PR #7 для task 006.
- Джерела істини: `docs/README.md`, активна специфікація, `docs/stack.md`, `docs/database.md`, відповідні task-файли й `AGENTS.md`.
- Цей inventory навмисно є доповнюваним: перед реалізацією потрібно переглянути актуальні feature tasks і додати їхні material browser, Server Action та database boundaries.
