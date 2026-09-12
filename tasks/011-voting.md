# 011 — Voting

## Goal

Дати обом учасникам змогу приватно вибрати реакцію для кожного з трьох фільмів поточного раунду та атомарно надіслати повний ballot, не розкриваючи значення голосів іншому учаснику або TV до завершення раунду.

## Dependencies

- Задачі 005–007: room-scoped participant sessions, авторитетні snapshots і наявний Realtime invalidation/resync flow.
- [010 — Start game and generate round](010-start-game-and-generate-round.md): кімната у стані `playing`, один поточний round `voting` і три persisted movie positions, однакові для TV та телефонів.
- [018 — Automated browser, Server Action, and database integration coverage](018-automated-integration-coverage.md) накопичує ширше end-to-end regression coverage; ця задача все одно перевіряє власну бізнес-логіку й критичні database boundaries.

## Scope / Requirements

### Mobile ballot

- На приєднаних телефонах для кожної з трьох карток поточного `voting` round показати чотири варіанти: `🔥 want_to_watch`, `🙂 could_watch`, `😐 not_now`, `❌ no`. Host і guest голосують за однаковими правилами; TV не отримує voting controls.
- Учасник локально обирає рівно одне значення для кожного фільму та надсилає всі три голоси однією явною дією. До успішного submit вибір можна змінювати; неповний ballot не надсилається.
- Після підтвердженого submit ballot цього учасника для цього round є остаточним і не редагується. Reload або reconnect відновлює submitted state та власні три значення без повторного запису.
- Додати українські selection, incomplete, submitting, submitted, waiting, validation і retry states через наявну Ukrainian-only `next-intl` конфігурацію. Double click і повторний mount не повинні створювати додаткові writes.
- Після submit першого учасника другий продовжує голосувати. Після двох повних ballots обидва телефони й TV можуть показати лише нейтральний стан готовності результату; обчислення match/no-match і зміна round status належать задачі 012.

### Validated private persistence

- Валідувати room code, round ID, request ID та повний набір movie/value pairs через Zod у Next.js server boundary. Payload має містити рівно по одному допустимому голосу для кожного з трьох persisted movies поточного round, без зайвих, пропущених або повторних movie IDs.
- Авторизувати mutation через чинну room-scoped participant cookie, спільний parser і token hashing. Participant ID, role, склад round або стан кімнати з клієнта не є авторитетними.
- Під room lock повторно перевіряти існування кімнати, `expiresAt`, стан `playing`, поточний `voting` round, належність authenticated participant цій кімнаті та повний склад із трьох учаснику видимих round movies.
- В одній Drizzle transaction зберегти всі три votes і persisted receipt/completion marker для ballot. Validation, conflict або write failure не залишає часткового ballot; база остаточно гарантує один vote на participant/movie і один завершений ballot на participant/round.
- Один participant не може замінити вже submitted ballot новим request. Одночасні submits того самого participant серіалізуються до одного результату, а ballots двох різних participants можуть завершитися без втрати або змішування votes.
- Persist idempotency key у браузері до request. Той самий key із тим самим canonical ballot після double click, reload чи втрати response повертає committed outcome; той самий key з іншим payload відхиляється. Старий retry після зміни room/round state не записує votes у новий round і не змінює раніше committed ballot.
- Якщо idempotency або ballot completion потребують schema changes, додати Drizzle migration і metadata, RLS та відсутність browser-role privileges у тій самій зміні. Оновити `docs/domain/database-schema.md`, lifecycle ключа в `docs/domain/idempotency-and-participant-sessions.md` і hosted verification path у `docs/database.md`.

### Privacy, snapshots, and synchronization

- До завершення round server-side snapshot телефона може містити лише власні vote values, власний submitted state і non-sensitive aggregate progress. Він не повертає значення іншого participant, навіть host; TV отримує тільки aggregate progress без vote values.
- Не покладатися лише на приховування controls у UI: окремі server-side selections і result types мають не допустити серіалізацію чужих votes, participant credentials, token hashes або idempotency payloads.
- Після commit надіслати non-sensitive invalidation через наявний room Broadcast topic. Не передавати votes або ballot payload через Broadcast і не відкривати Supabase Data API reads/writes.
- Розширити один наявний room channel на кожному mounted screen. Subscribe, reconnect, reload, пропущений або підроблений Broadcast спричиняють лише bounded authoritative refetch; fallback polling під час активного голосування доставляє progress без render/action loop і очищається після unmount або виходу зі стану очікування.
- Failed Broadcast не відкочує committed ballot. UI після transport failure зберігає pending idempotency key і дозволяє безпечний retry замість створення нового ballot.

## Acceptance Criteria

- Host і guest бачать ті самі три фільми, можуть вибрати всі чотири vote values і надсилають рівно один повний ballot із трьох votes на participant/round.
- Неповний, дубльований або підмінений movie set; невалідний vote; чужий round; анонімна чи чужа session; неіснуюча, закрита, прострочена або не `playing` кімната відхиляються без writes.
- Partial insert failure відкочує всі три votes і completion marker. Одночасний double submit не створює дублікатів і не дозволяє змінити вже committed ballot.
- Retry після втрати response відновлює той самий submitted outcome; повторне використання key з іншим ballot відхиляється; старий retry не впливає на пізніший round.
- До завершення round телефон не отримує vote values іншого participant, а TV не отримує жодних vote values. Власні submitted values відновлюються після reload.
- Submit першого participant без ручного reload оновлює aggregate progress на інших екранах, не розкриваючи ballot. Два submitted ballots дають авторитетний readiness state для задачі 012 без client-side match calculation.
- На кожному mounted screen лишається один room channel із cleanup; втрата invalidation, reconnect і повторні події не спричиняють необмежені refetch або duplicate writes.
- `pnpm verify`, цільові service tests, PostgreSQL transaction/privacy integration tests і hosted TV + два телефони smoke test проходять.

## Verification

- Unit/service tests: Zod contract, exact three-movie membership, усі vote values, authorization, expiration/status guards, canonical payload hashing, immutable submission та idempotency outcomes.
- PostgreSQL integration: atomic three-vote insert/rollback, concurrent same-participant і two-participant submits, replay після response loss, database constraints, room isolation та public/private selections.
- Реальний браузер із hosted Supabase: два незалежні phone contexts обирають і submit-ять ballots; TV показує лише progress; reload/reconnect відновлює own state; network inspection підтверджує відсутність чужих vote values і bounded requests.

## Out of Scope

- Match ranking, tie-breaking, selected movie і round/room result transitions — задача 012.
- Автоматичний наступний round після no-match — задача 013; повний final match screen — задача 014; Search again і Close room — задача 015.
- Переголосування після успішного submit, live показ вибору іншого учасника, spectator voting, solo mode, Presence або browser Data API access.

## References / Notes

- Джерела істини: [active specification](../docs/v0.1.md), [stack](../docs/stack.md), [schema](../docs/domain/database-schema.md), [participant sessions](../docs/domain/idempotency-and-participant-sessions.md), [010 — Start game and generate round](010-start-game-and-generate-round.md) і `AGENTS.md`.
- Зберігати ballot як одну server-side business operation. Не створювати три незалежні browser mutations, бо вони ускладнюють privacy, retry recovery та визначення завершеного submit.
