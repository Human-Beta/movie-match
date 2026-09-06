# 010 — Start game and generate round

## Goal

Дати хосту змогу запустити Three Cards Mode зі збереженими фільтрами та показати TV і двом телефонам один атомарно створений раунд із трьома різними фільмами.

## Dependencies

- Задачі 005–007: TV room, participant sessions і Realtime invalidation/resync.
- [008 — Host filters](008-host-filters.md): збережений filter contract та серіалізація host commands.
- [009 — Movie seed data](009-movie-seed-data.md): готовий каталог; автоматизовані перевірки використовують окремі детерміновані fixtures.

## Scope / Requirements

### Старт та генерація

- Додати host-only кнопку початку гри на телефоні. Початковий старт дозволений тільки для не простроченої кімнати `waiting` із двома persisted учасниками; disconnect не змінює membership. Guest очікує, TV не отримує controls.
- Старт використовує лише збережені фільтри задачі 008. За незбережених змін форма має вимагати їх збереження перед стартом, щоб видимий вибір не розходився з параметрами гри. Значення за замовчуванням є валідними без окремої ready-команди.
- Валідувати input через Zod і повторювати server-side room, participant, role та expiration checks у Next.js server boundary/Drizzle flow. Не приймати client-provided набір фільмів, роль або результат генерації як авторитетні дані.
- Під room lock прочитати актуальні фільтри й учасників, виключити фільми з `round_movies` усієї поточної історії кімнати та випадково вибрати рівно три різні movie IDs. Жанри застосовувати через OR без дублікатів кандидатів від many-to-many join; між типами фільтрів використовувати AND.
- У межах однієї transaction створити `rounds` зі статусом `voting`, три `round_movies` із позиціями `1–3` та перевести кімнату в `playing`. Початковий номер — `1`, наступний — наступний у поточній послідовності кімнати. Не залишати round із нулем, одним або двома фільмами при помилці.
- Зберігати вибраний порядок у БД: reload і кожен клієнт читають той самий round та позиції, а не повторюють випадковий вибір. Підготувати одну cohesive server-side операцію генерації для подальших задач 013 і 015, без публічної довільної команди «наступний раунд» у цій задачі.
- Серіалізувати start зі збереженням фільтрів. Забезпечити persisted idempotency key до запиту, server-side uniqueness і retry recovery відповідно до `AGENTS.md`: double click, concurrent requests і втрата response повертають committed outcome без другого раунду. Старий retry не запускає новий раунд після подальшої зміни game state; повторне використання key з іншим payload відхиляти.

### Вичерпання та Restart the list

- Якщо лишилося `0`, `1` або `2` eligible unseen movies, перевести кімнату в `exhausted` без часткового раунду. TV і телефони показують українське повідомлення, що за цими фільтрами фільмів більше немає.
- Реалізувати мінімальну дію v0.1 «Почати список заново» для хоста в `exhausted`. Після повторної авторизації та перевірки expiration атомарно видалити rounds цієї кімнати разом із movie positions і votes через cascades та створити новий раунд `1` за тими самими фільтрами. Room, participants, filters, catalog і первинний `expiresAt` зберігаються.
- Якщо навіть увесь каталог після застосування фільтрів має менш як три фільми, залишити зрозумілий `exhausted` state без часткового раунду та без автоматичного циклу restart. Для успішного restart перевіряти достатність кандидатів до видалення історії; помилка transaction не повинна втратити попередню історію.
- Restart також використовує persisted idempotency key: повторний запит після втрати response не видаляє щойно створений раунд. Зміна фільтрів у `exhausted` не потрібна для мінімального v0.1; close room належить задачі 015.

### Спільний стан і картки

- Розширити server-side snapshot потрібними room/round/movie полями через явний public allowlist. TV і приєднані телефони отримують title, optional poster, year, runtime, genres і стабільні positions; snapshot не містить credentials або чужих голосів.
- На TV та телефонах показувати ті самі три фільми в однаковому порядку. Додати українські loading/error states та fallback для відсутнього або недоступного постера. Controls голосування зʼявляться в задачі 011.
- Після commit надсилати non-sensitive invalidation через наявний room Broadcast topic; клієнти повторно читають авторитетний snapshot через Next.js. Не передавати product rows через Broadcast і не відкривати browser Data API reads/writes.
- Розширити наявний subscription flow без другого незалежного channel на тому самому екрані. Resync потрібний після subscribe, reconnect і reload; bounded retry та low-frequency fallback під час очікування старту мають доставити перехід навіть за пропущеного Broadcast. Наявний participant fallback зупиняється на `2/2`, тому сам по собі не покриває очікування старту.
- Failed Broadcast не відкочує committed round. Повторні чи підроблені події можуть спричинити лише bounded authoritative refetch, а не створення раунду або підміну карток.
- Schema changes для command idempotency супроводжувати migration, metadata, RLS і оновленням `docs/domain/database-schema.md`; lifecycle нових ключів описати в `docs/domain/idempotency-and-participant-sessions.md`. Hosted verification path оновити в `docs/database.md`.

## Acceptance Criteria

- Host із двома учасниками запускає гру; TV, host і guest без ручного reload показують один round `1` із тими самими трьома різними фільмами в позиціях `1–3`.
- За одного учасника, без чинної host session, з чужою cookie, у закритій/простроченій кімнаті або неприпустимому state новий старт відхиляється без writes.
- Вибір задовольняє Netflix, `< 120`, `2010/2011` та OR-жанрові межі, не містить дублікатів від join і не повторює жодного movie з поточної історії кімнати.
- Одночасні start/start і save/start не створюють зайвого voting round, часткових позицій або змішаного набору фільтрів; повтор після втрати response відновлює committed outcome.
- За `0/1/2` кандидатів кімната стає `exhausted`; за рівно `3` створюється повний раунд. Помилка під час вставлення позицій відкочує весь перехід.
- Restart після вичерпання history за достатнього каталогу видаляє лише room-owned rounds/positions/votes, повертає номер `1` і дозволяє повторно показувати раніше показані фільми. Інші кімнати, учасники, фільтри та expiration не змінюються.
- Повторний restart не стирає новий раунд; недостатній повний каталог залишає `exhausted` без нескінченного запиту або автоматичного reset.
- Reload/reconnect відновлює той самий раунд; втрачена start invalidation при `2/2` компенсується fallback без ручного reload. На mounted screen залишається один room channel із cleanup.
- `pnpm verify`, цільові PostgreSQL integration tests та hosted TV + два телефони smoke test проходять.

## Verification

- Unit/service tests: host authorization, state/expiration guards, idempotency, всі filter combinations і межі. Не перевіряти випадковість flaky статистичними assertions; перевіряти належність кандидатам, унікальність і розмір результату.
- PostgreSQL integration: start transaction/rollback, конкурентні команди, history exclusion, multi-genre duplicates, `0/1/2/3` candidates, restart cascades й ізоляція кімнат. Для history/restart використовувати fixtures завершених раундів, не реалізовувати голосування завчасно.
- Реальний браузер із hosted Supabase: start на host, синхронні картки на трьох екранах, втрата Broadcast, reconnect/reload, exhausted і restart; перевірити subscription cleanup та відсутність render/action loop.

## Out of Scope

- Надсилання голосів і їхня приватність у voting flow — задача 011; match calculation — задача 012.
- Автоматичний перехід після no-match — задача 013; final match screen — задача 014; Search again і Close room — задача 015.
- Expiration transition та periodic cleanup — задача 016; перевірка `expiresAt` обовʼязкова вже тут.
- Фільтри поза v0.1, зміна фільтрів у грі, solo mode, Presence, нові game modes або загальний event bus.

## References / Notes

- Джерела істини: [active specification](../docs/v0.1.md), [stack](../docs/stack.md), [schema](../docs/domain/database-schema.md), [007 — Realtime room participants](007-realtime-room-participants.md) і `AGENTS.md`.
- Використовувати наявні constraints `rounds_one_voting_per_room_unique`, `round_movies_room_movie_unique` та унікальні round positions як остаточний database guard; рівно три movie positions забезпечує transaction.
