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

### P1 — Task 010 hosted game-round synchronization

- Проти hosted Supabase відкрити TV і два ізольовані phone contexts, приєднати host та guest, зберегти фільтри й запустити гру через реальний Next.js Server Action.
- Перевірити на всіх трьох екранах один persisted round `1` з тими самими трьома movie IDs, metadata та positions без ручного reload; TV і guest не отримують host controls.
- Відтворити незбережений draft, duplicate click, втрачений action response, пропущений `room_changed` Broadcast, reconnect і reload. Перевірити один committed outcome, recovery через пʼятисекундний fallback при `2/2`, один room channel і cleanup без render/action loop.
- Покрити перший start із `0/1/2` eligible movies: host отримує українську insufficient-catalog instruction без створення round або partial positions; це не є `list_exhausted` і не пропонує restart.
- Покрити рівно три eligible movies, а також `list_exhausted` після історії: останній лишається persisted room state з host-only restart; restart або зберігає history за недостатнього повного каталогу, або атомарно створює round `1` лише для своєї room.
- За двох participants у `waiting` TV показує, що очікує налаштування filters і start від host; повідомлення оновлюється після успішного переходу до `playing` без ручного reload.
- Не фіксувати hosted credentials, room topics, browser artifacts або product rows у Broadcast payloads. Цей сценарій закриває відкладений acceptance criterion task 010.

### P1 — Task 011 hosted private-voting synchronization

- Проти hosted Supabase відкрити TV і два ізольовані phone contexts, створити та запустити round, а потім надіслати повний ballot з кожного телефона.
- Підтвердити реальний `room_changed` Broadcast і reconnect: TV та другий телефон переходять `0/2 → 1/2 → 2/2` без ручного reload, а пропущена invalidation відновлюється bounded active-voting fallback polling без duplicate channel або write.
- Перевірити Network responses на TV і другому телефоні: вони містять лише aggregate progress, а не vote values, receipts, request IDs, participant credentials чи Broadcast payload. Reload першого телефона відновлює тільки його власні submitted values.

### P1 — Task 013 no-match next-round readiness

- На ізольованій PostgreSQL перевірити `DrizzleNoMatchNextRoundRepository`: room lock, дві distinct readiness rows, concurrent confirmations, рівно один successor round із трьома unseen positions, request replay/conflict, rollback другого confirmation та `exhausted` без partial round.
- Додати component/Server Action coverage для `NoMatchNextRoundControl`: request ID persist-иться до mutation, reload і response loss безпечно відновлюють той самий request, corrupt/unavailable storage не надсилає mutation, а first/second confirmation показують waiting/transition states без auto-advance.
- У трьох ізольованих hosted browser contexts (TV, host, guest) перевірити no-match message, розкриті votes, question, readiness progress, missed Broadcast fallback, reconnect/reload, two tabs, exhausted catalog і `prefers-reduced-motion`. Це закриває відкладені integration/browser acceptance criteria task 013.

### P1 — Tasks 010.1/010.2 insufficient-catalog recovery

- У трьох ізольованих browser contexts (host, guest, TV) відтворити insufficient catalog. Перевірити, що error/instruction бачить лише host, вона має error styling, лишається поряд із filters та disable-ить повторний start для того самого contract.
- Перевірити, що `catalog_insufficient` не змінює `rooms.status`, public snapshot, round/history або Broadcast для guest і TV; обидва екрани зберігають waiting presentation.
- Перевірити reload host після terminal response: `room_game_commands.filter_hash` пов'язує поточний нормалізований contract із `startEligible: false`, тому помилка й disabled start відновлюються без повторної мутації.
- Зберегти нормалізовано однакові filters і перевірити, що form не remount-иться й не показує loading, room rows/genres/public snapshot не змінюються, а guest і TV не отримують transition. Потім зберегти інший valid contract і перевірити доступність рівно однієї нової start-спроби.
- Перевірити Server Action boundary: `catalog_insufficient` не викликає `notifyRoomChanged`, а `started` і `list_exhausted` надсилають лише мінімальну invalidation. Додати unit або інтеграційний test для цього розгалуження.

### P2 — Repository integration against PostgreSQL

- Покрити `ParticipantRepository.inspectRoom` реальною БД: room snapshot, participant lookup за token hash, participant count і нормалізацію відсутнього participant до `null`.
- Зберегти concurrency coverage для одночасних другого і третього join та перевіряти не лише result, а й остаточні rows, унікальні roles і token hashes.
- Перевірити rollback: помилка в locked transaction не залишає частково створеного participant.
- Додавати repository integration tests для майбутніх migrations, constraints, cascade cleanup і RLS/browser-access boundaries, коли відповідні задачі реалізують ці можливості.
- Для tasks 010.1/010.2 на ізольованій PostgreSQL перевірити upgrade migrations: існуючі `catalog_insufficient` room rows переходять у `waiting`, застарілий тип і колонка `room_exhaustion_reason` видаляються, а попередні game-command receipts отримують сумісний `filter_hash` default.
- На реальній Drizzle repository створити insufficient start і потім прочитати filters: assertion має покрити запис/читання одного canonical `filter_hash`, `startEligible: false`, повторний request ID, однакове збереження filters та зміну contract. Не обмежуватися memory repository.

### P2 — Task 010 game-command Server Action and UI boundary

- У реальному Next.js runtime перевірити `startGameAction` і `restartMovieListAction`: room-scoped host cookie читається server-side, forged або missing session не створює writes, а terminal response викликає лише non-sensitive invalidation.
- Перевірити React controls для start і restart: request ID persisted before submission, disabled/retry/terminal states коректні, а storage failure не надсилає mutation.
- Підтвердити, що action response та DOM не містять participant credentials, receipt rows, client-provided movie selections або Broadcast payload data.

### P2 — Task 011 ballot Server Action and UI boundary

- У реальному Next.js runtime перевірити `submitBallotAction` і `useVotingBallot`: pending request ID та три вибори persist-яться до mutation, incomplete ballot не викликає write, а double click не створює другого submit.
- Змоделювати transport failure і response loss: pending ballot лишається для safe retry, exact retry повертає committed outcome, а terminal unavailable, validation або conflict state очищає лише відповідний pending request.
- Підтвердити, що DOM і action responses не серіалізують чужі vote values, receipts, request IDs або participant credentials.

### P2 — Movie catalog seed lifecycle

- Цей розділ містить автоматизоване PostgreSQL coverage, перенесене під час закриття задачі 009; каталог і seed workflow задачі 009 вважаються завершеними незалежно від цього follow-up coverage.
- На ізольованій PostgreSQL перевірити `migrations → seed → повторний seed`: кількість фільмів, жанрів і звʼязків не змінюється, а їхні identities зберігаються.
- Перевірити контрольоване оновлення того самого `seedKey`, конфлікт із не-seed movie identity та rollback після помилки всередині transaction.
- Додати сторонні movie, room filter і round fixtures та підтвердити, що seed не видаляє і не перепривʼязує їх.

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
