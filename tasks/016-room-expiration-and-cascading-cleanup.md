# 016 — Room expiration and cascading cleanup

## Goal

Забезпечити годинний термін життя кожної кімнати: після `expires_at` вона одразу недоступна для гри незалежно від розкладу background job, а періодичне очищення фізично видаляє прострочені кімнати разом з усіма належними їм даними.

## Dependencies

- [005 — Create and restore TV room](005-create-and-restore-tv-room.md) та [006 — Join room from phone](006-join-room-from-phone.md): `expires_at`, відновлення кімнати й participant sessions.
- Задачі 008–015: усі room reads, snapshots і mutations, включно з match, Search again та Close room.
- [Database schema](../docs/domain/database-schema.md): наявні foreign-key cascades для room-owned data.

## Scope / Requirements

### Immediate expiration

- Зафіксований під час створення `expires_at` залишається рівно через одну годину після `created_at`; join, votes, Search again, Restart list або activity не продовжують його.
- При `now >= expires_at` усі server reads, restoration і product mutations трактують кімнату як недоступну, навіть якщо її row ще існує. У client UI TV та phones показують зрозумілий terminal state і шлях почати нову кімнату там, де це дозволяє поточний flow.
- Перевірити всі server-boundary paths, зокрема retry/idempotency: старий receipt або чинна cookie не дозволяють продовжити прострочену гру чи відкрити її повторно. Де existing contract повертає terminal outcome, зберегти його без витоку приватних даних.
- Не покладатися на Broadcast або scheduled cleanup як на умову недоступності. Відкриті екрани повинні перейти до terminal state після досягнення expiry через наявне authoritative refresh/fallback, без обов'язкового reload.

### Periodic physical cleanup

- Додати один керований за розкладом server-side процес для видалення `rooms` з `expires_at <=` часом бази даних, незалежно від `status`, включно з явно закритими та matched кімнатами. Використати вже узгоджену інфраструктуру розгортання; не запускати cleanup з браузера, під час request або application build.
- Виконувати видалення безпечно для повторних і паралельних запусків. Обмежувати обсяг однієї операції, щоб старий backlog не блокував звичайні room commands; помилка одного запуску не має видаляти непрострочені rows, а наступний запуск має продовжувати очищення.
- Видалення room покладається на перевірені foreign-key cascades для participants, selected filters, filter-save/game-command receipts, rounds, round movies, votes, ballot receipts і no-match readiness. Не видаляти спільні `movies`, `genres` або `movie_genres`.
- Scheduler і cleanup використовують лише server-side database credentials. Якщо потрібен HTTP entry point, захистити його від публічного запуску й не розкривати секрети в коді, URL чи logs. Фіксувати лише безпечний результат запуску (час, кількість видалених кімнат, помилку без credentials).
- Якщо реалізація змінює схему, додати Drizzle migration і metadata та оновити [database-schema.md](../docs/domain/database-schema.md) у тій самій зміні. Зберегти RLS і заборону browser-role writes.

## Acceptance Criteria

- Рівно на `expires_at` стара кімната стає недоступною для restore/join і всіх game commands; snapshots показують лише terminal state, а раніше завершені room sessions і request IDs не обходять це правило. Створення нової кімнати лишається доступним.
- Відкриті TV та телефони відображають terminal state після expiry без ручного reload; повторне відкриття старого URL не відновлює гру.
- За розкладом expired rooms фізично видаляються, а всі room-owned rows зникають через cascades; непрострочені rooms та спільний каталог залишаються цілими.
- Повторний запуск, паралельний запуск і збій cleanup не створюють неконсистентних даних та не роблять product mutations доступними після expiry.
- Локальні перевірки й database integration tests проходять; hosted перевірка підтверджує scheduled запуск, факт cleanup та відсутність секретів у logs.

## Verification

- Unit/service: межі `now < expires_at` і `now >= expires_at`, restore/join, read/snapshot і mutation guards, replay зі старими request IDs, terminal UI після authoritative refresh.
- PostgreSQL integration на ізольованій test database: expired і unexpired кімнати, кожен тип room-owned row, cascade deletion, shared catalog preservation, повторний і паралельний запуск, failure/retry та гонка з room command.
- Hosted smoke: у відокремленому середовищі створити test fixtures з контрольованими `created_at` і `expires_at`, зберігши різницю рівно в годину; перевірити terminal state до фізичного видалення, один scheduled cleanup run і відсутність room data після нього. Не змінювати production clock або живі кімнати для тесту.
- `pnpm verify` і перевірка конфігурації розкладу, доступів та non-secret execution logs.

## Out of Scope

- Продовження терміну життя кімнати, idle timeout, інші правила для закритої кімнати чи auto-close до `expires_at`.
- Видалення або редагування спільного movie catalog, архівування history чи нова analytics/monitoring платформа.
- Загальний UI redesign та фінальний v0.1 release — задача 017.

## References / Notes

- Джерела істини: [Room lifetime](../docs/v0.1.md#room-lifetime), [stack](../docs/stack.md), [database workflow](../docs/database.md), [database schema](../docs/domain/database-schema.md) і `AGENTS.md`.
- Expiration як product rule та physical cleanup — окремі кроки. Видалення row за розкладом не може бути єдиним механізмом завершення кімнати.
