# 008 — Host filters

## Goal

Дати хосту змогу налаштувати й зберегти фільтри перед стартом гри, щоб задача 010 створювала раунд за авторитетними налаштуваннями кімнати.

## Dependencies

- Задачі 004–007: схема фільтрів, participant session і синхронізація учасників уже доступні.
- Задача 009 наповнить каталог жанрів і фільмів. Задача 008 має працювати з порожнім каталогом; для перевірок використовувати ізольовані fixtures.

## Scope / Requirements

### Форма та контракт фільтрів

- На `/join/{roomCode}` показувати приєднаному `host` форму в активній кімнаті зі статусом `waiting`, зокрема коли другий учасник ще не приєднався. `guest` бачить очікування налаштування та старту гри; TV залишається спільним екраном без controls.
- Додати тільки фільтри v0.1: Netflix, тривалість менш як дві години, рік `any | new | old`, нуль або більше жанрів. Початкові значення нової кімнати: `false`, `false`, `any`, порожній список жанрів.
- Зафіксувати однакову семантику для форми й задачі 010: Netflix перевіряє вручну підтримуваний `availableOnNetflix`; тривалість — строго `< 120` хвилин; `new` — `releaseYear > 2010`; `old` — `releaseYear <= 2010`. Різні типи фільтрів поєднуються через AND, вибрані жанри — через OR; порожній список жанрів не обмежує вибір.
- Читати доступні жанри з `genres` через сервер; не створювати окремий hardcoded продуктовий каталог у формі. За відсутності жанрів решта фільтрів доступна, а порожній вибір означає будь-який жанр.
- Використовувати явне збереження форми з українськими loading, success, validation і retry states через `next-intl`. Після reload відновлювати збережені значення з БД. Realtime participant refresh не має перезаписувати незбережене редагування форми.

### Серверне збереження

- Валідувати room code, boolean-поля, year enum та genre IDs через Zod на Next.js server boundary. Перевіряти існування кожного жанру; повторні IDs нормалізувати до унікального набору.
- Авторизувати кожну mutation через чинну participant cookie, спільний parser/token hashing і серверну перевірку належності учасника до кімнати та ролі `host`. Не довіряти role або participant ID із request body.
- Зберігати scalar filters у `rooms`, а набір жанрів — у `room_genres` як одну атомарну Drizzle transaction. Під room lock повторно перевіряти статус `waiting` і `expiresAt`; той самий lock у задачі 010 має серіалізувати save та start.
- Застосувати repository policy для retryable mutations: до запиту зберігати idempotency key, серверно забезпечувати його унікальність у межах команди та кімнати й привʼязку до payload. Retry підтвердженого save не повинен повторно застосувати старі фільтри поверх новішого save; той самий key з іншим payload відхиляти. Pending key очищати лише після підтвердженого terminal outcome.
- Не змінювати room status, склад учасників, історію раундів або початковий `expiresAt`. У цій задачі немає persisted `ready` state: наявність двох учасників і збережені фільтри будуть inputs старту в задачі 010.
- Повертати явний allowlist публічних полів без participant credentials. Reads і writes виконувати через Next.js та Drizzle; не розширювати browser Supabase Data API.
- Якщо для idempotency потрібні зміни схеми, додати Drizzle migration і metadata, зберегти RLS та заборону browser writes і оновити `docs/domain/database-schema.md` разом зі зміною. Описати новий lifecycle ключа в `docs/domain/idempotency-and-participant-sessions.md`.

## Acceptance Criteria

- Host змінює всі фільтри, зберігає їх і після reload бачить той самий набір, включно з нулем або кількома жанрами.
- Межі `119/120` хвилин і `2010/2011` років та OR-семантика жанрів однозначно відображені в контракті, який використовуватиме задача 010.
- Guest, анонімний запит, credential іншої кімнати та підроблена роль не можуть змінити scalar filters або `room_genres`.
- Закрита, прострочена, неіснуюча або вже не `waiting` кімната відхиляє нове збереження без часткових змін.
- Некоректний genre ID не залишає частково оновленого набору; порожній список видаляє всі genre restrictions кімнати.
- Повторний submit, reload із pending request і retry після втрати response не створюють дубльованих записів і не повертають фільтри до старого значення після пізнішого save.
- Join другого учасника оновлює participant state, зберігаючи незбережені зміни host form; guest лишається на waiting screen.
- `pnpm verify`, цільові автоматизовані перевірки та ручний browser flow проходять.

## Verification

- Unit/service tests: validation, defaults, authorization, room state/expiration і idempotency outcomes.
- PostgreSQL integration: атомарна заміна `room_genres`, rollback, конкурентні save та replay старого request після нового save. Використовувати ізольовані fixtures й cleanup.
- Реальний браузер: host + guest, усі controls, save/reload, помилка зі збереженням можливості retry та participant update під час редагування. Якщо додається автоматичний Server Action з Effect, перевірити bounded call count і завершення після cookie refresh відповідно до `AGENTS.md`.

## Out of Scope

- Наповнення каталогу — задача 009; пошук кандидатів і старт гри — задача 010.
- Зміна фільтрів під час гри чи після вичерпання списку, presets, live preview кількості фільмів і додаткові фільтри.
- Голосування, close room, Search again, accounts або host reassignment.

## References / Notes

- Джерела істини: [active specification](../docs/v0.1.md), [stack](../docs/stack.md), [database schema](../docs/domain/database-schema.md), [participant sessions](../docs/domain/idempotency-and-participant-sessions.md) і `AGENTS.md`.
- Дотримуватися наявних class-based repositories/services, constructor injection і спільного `DatabaseProvider`; не створювати окрему конфігураційну підсистему для чотирьох фільтрів.
