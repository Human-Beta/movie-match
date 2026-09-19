# 015 — Search again or close room

## Goal

Дати host після match одну з двох авторитетних дій: продовжити пошук новим раундом у тій самій кімнаті без повторення вже показаних фільмів або завершити сесію, перевівши кімнату в `closed`.

## Dependencies

- [014 — Match screen](014-match-screen.md): стабільний TV destination і compact phone result після persisted match.
- [010 — Start game and generate round](010-start-game-and-generate-round.md) та [010.1 — Game-start fixes](010-1-game-start-fixes.md): reusable atomic generation, seen-movie exclusion, `exhausted` state і Restart list flow.
- Задачі 005–007: host session authorization, room lock, public snapshots та Realtime invalidation/resync.

## Scope / Requirements

### Host-only post-match controls

- Показати на host phone дві чіткі дії для authoritative matched room: «Шукати ще» і «Закрити кімнату». Усі фактичні controls залишаються на phone згідно з TV-mode principle; TV може підказати, що наступну дію обирає host, але не виконує mutation без host session.
- Guest phone не отримує controls і показує нейтральне очікування рішення host. Приховування кнопок не є authorization boundary: обидві server commands перевіряють чинну room-scoped participant session і persisted `host` role.
- Під час pending command заборонити повторний submit у цьому mounted UI, показати доступний progress label і не оптимістично міняти room/round state до authoritative response/snapshot.
- Для кожної логічної дії зберегти browser request ID до mutation. Response loss, double click, reload або retry використовують той самий key, доки server не підтвердить terminal outcome.

### Search again

- Validated server payload містить лише `roomCode` і request ID. Server під room lock повторно перевіряє non-expired `matched` room, authenticated host, current matched round і persisted selected movie; client не задає filters, candidate movies або round number.
- В одній transaction прочитати незмінені saved filters, виключити всі movies із поточної room history, випадково вибрати три eligible movies, створити наступний sequential `voting` round/positions, перевести room `matched → playing` і зберегти idempotent command outcome.
- Не видаляти попередні rounds, votes або selected winner під час Search again. Вони залишаються history, яка запобігає повторам до явного Restart list.
- Якщо unseen eligible movies менше трьох, не створювати partial round; перевести room у `exhausted` і використати існуючий host Restart list recovery. Search again не змінює filters і не запускає restart автоматично.
- Після успішного Search again TV та обидва phones переходять із matched result до однакового нового ballot round без повторного join або filter setup.

### Close room

- Close command під room lock перевіряє non-expired matched room і authenticated host, потім ідемпотентно переводить `rooms.status` у `closed`. Він не видаляє room, participants, rounds, votes або receipts; physical cleanup належить задачі 016.
- Після close TV і phones через authoritative snapshot показують terminal closed presentation. Join, vote, Search again, restart та інші room mutations більше не доступні.
- TV не повинен застрягати на reload через збережений closed room code: показати явний шлях створити нову кімнату та узгодити local restoration behavior із чинним `/tv` contract без автоматичного відновлення закритої гри як active.

### Concurrency, idempotency, and synchronization

- Search again і Close room серіалізуються тим самим room lock. Якщо їх надіслано одночасно з різних host tabs, рівно одна команда може змінити matched state; інша повертає контрольований terminal/unavailable outcome й не частково застосовується.
- Той самий request ID із тим самим command повертає committed result. Повторне використання key для іншого command/payload повертає conflict. Idempotency receipt не відкривається public snapshots.
- Якщо command receipt потребує enum/table/schema change, додати Drizzle migration і metadata, browser-role RLS/no-write grants та оновити `docs/domain/database-schema.md` і idempotency documentation у тій самій зміні.
- Після commit надіслати non-sensitive invalidation через наявний room topic. Broadcast може містити лише invalidation hint; failed delivery не відкочує command, а reload/fallback refetch відновлює new round, exhausted або closed state.
- Server Actions, що змінюють cookies або refresh-ять React tree, не викликати з нестабільного Effect. Post-match commands є явними host interactions і не повинні породжувати render/action loop.

## Acceptance Criteria

- Лише host у persisted matched room бачить і може виконати «Шукати ще»/«Закрити кімнату»; guest, anonymous, foreign, expired, non-matched або forged session не змінює room.
- Search again атомарно створює рівно один наступний `voting` round із трьома unseen eligible movies, зберігає filters/participants/original expiration/history і переводить room у `playing`.
- Якщо unseen catalog має `0–2` movies, Search again створює no partial round, переводить room у `exhausted` і відкриває наявний Restart list flow.
- Close room ідемпотентно встановлює `closed`, не видаляє history, блокує подальші product mutations і синхронно переводить TV/phones у terminal presentation з можливістю почати нову кімнату на TV.
- Concurrent Search again/Close room, double click, lost response, reload і retry не створюють duplicate rounds, не reopen-ять closed room і не залишають receipt/state conflict.
- До confirmed response/snapshot клієнт не показує вигаданий next round або closed state. Failed Broadcast відновлюється через authoritative refetch.
- TV не має інтерактивної product mutation без host credential; guest phone не отримує host controls або server-only command data.
- `pnpm verify`, command/service tests, PostgreSQL concurrency/rollback tests і hosted three-screen smoke test для обох actions та exhausted outcome проходять.

## Verification

- Unit/service tests: authorization, matched/current-round guards, command validation/hash, replay/conflict, unseen exclusion, exhausted outcome, close semantics і stale request.
- PostgreSQL integration: atomic Search again round/positions/status/receipt, atomic close, concurrent opposing commands, rollback на critical writes, history preservation, room isolation і browser-role privileges.
- Component/effect tests: host-only controls, guest waiting, pending/retry state, persisted request lifecycle, closed presentation і no optimistic authoritative state.
- Реальний браузер із hosted Supabase: TV + host + guest match, Search again to new ballot; окремо match and close; повторити з two host tabs/response loss і вичерпаним unseen catalog.

## Out of Scope

- Зміна filters без нового room, автоматичний Search again, auto-close або close під час waiting/voting — окреме продуктове рішення поза post-match flow цієї задачі.
- Видалення expired/closed room data — задача 016.
- Match screen redesign, transition timing або result calculation — задачі 012–014.
- Повторення movies до Restart list, undo close, reopening closed rooms, spectator controls або перенесення host role.

## References / Notes

- Джерела істини: [Actions after a match](../docs/v0.1.md#actions-after-a-match), [Host](../docs/v0.1.md#host), [TV mode](../docs/v0.1.md#tv-mode), [Shown movies and restarting the list](../docs/v0.1.md#shown-movies-and-restarting-the-list), [stack](../docs/stack.md), [schema](../docs/domain/database-schema.md), [014 — Match screen](014-match-screen.md) і `AGENTS.md`.
- Final match actions належать host phone; TV показує shared result та non-interactive status/instruction без неавторизованої mutation surface.
