# 012 — Match calculation

## Goal

Після другого повного ballot атомарно завершити поточний round, визначити найсильніший спільний позитивний вибір або no-match і лише після commit відкрити обом учасникам результат та голоси завершеного раунду.

## Dependencies

- [010 — Start game and generate round](010-start-game-and-generate-round.md): persisted ordered round із трьома movies та reusable server-side generation boundary.
- [011 — Voting](011-voting.md): авторизований атомарний ballot submit, два completion markers, private vote selections та persisted retry contract.

## Scope / Requirements

### Authoritative resolution

- Результат обчислює тільки server-side service із persisted votes. Не приймати client-provided participant identity, positivity, score, selected movie, completion flag або match/no-match result як авторитетні дані.
- Учасник вважається submitted лише після атомарно committed ballot для всіх трьох movies. Round можна resolve лише за двох різних persisted participants кімнати, двох completion markers і рівно шести валідних votes, що належать трьом persisted round movies.
- Інтегрувати resolution у transaction другого успішного ballot під тим самим room lock: commit одночасно зберігає другий ballot і terminal round/room result. Інший snapshot не повинен побачити шість votes у все ще незавершеному `voting` round.
- Винести cohesive idempotent round resolver, який працює з уже прочитаним авторитетним станом і може бути безпечно повторно викликаний transaction flow. Retry, concurrent submit або повторний resolver call повертає той самий committed result, не вибирає інший movie і не змінює terminal round.
- Якщо дані неповні або суперечать invariants, не вгадувати результат і не залишати частковий transition. Повернути контрольовану помилку та rollback другого ballot, якщо він був частиною тієї самої transaction.

### Match rule and state transitions

- Позитивні значення: `want_to_watch` і `could_watch`. Movie є match лише коли обидва participants дали позитивні votes; будь-який `not_now` або `no` виключає його.
- Ранжувати matched movies точно так: `want_to_watch + want_to_watch` сильніше за mixed `want_to_watch + could_watch`, а mixed сильніше за `could_watch + could_watch`. Порядок participants у mixed pair не впливає на strength.
- Якщо однакову найвищу strength мають кілька movies, випадково вибрати один на сервері. Вибір виконується один раз і зберігається як єдиний `round_movies.is_selected = true`; reload або retry читає persisted winner, а не повторює random choice.
- За match у тій самій transaction встановити current round `matched`, рівно один selected movie та room `matched`.
- Якщо жоден movie не має двох позитивних votes, у тій самій transaction встановити round `no_match`, не позначати жоден movie selected і залишити room `playing`. Створення наступного round та informal transition message належать задачі 013.
- Не змінювати filters, participants, original `expiresAt` або попередні rounds. Не створювати наступний round і не видаляти історію в цій задачі.

### Result privacy and synchronization

- До terminal round transition зберігати privacy contract задачі 011. Після commit авторитетні snapshots TV та обох приєднаних телефонів можуть містити result завершеного current round, обидва vote values для кожного movie та selected movie за match.
- Будувати post-resolution result через явний public allowlist: display name/role, movie display fields, positions і vote values. Не серіалізувати access token hashes, idempotency receipts або інші credentials.
- На TV і телефонах показати мінімальний український terminal state для `matched` або `no_match`, достатній для перевірки синхронного результату. Playful result transition належить задачі 012.1, повний designed match screen — задачі 014, а автоматичний no-match message/next-round flow — задачі 013.
- Після commit надсилати non-sensitive result invalidation через той самий room Broadcast topic. Broadcast не містить winner або votes; кожен клієнт повторно читає server-side snapshot.
- Втрачена invalidation, reconnect, reload і duplicate/forged events мають приводити до bounded authoritative refetch одного persisted result. Failed Broadcast не відкочує resolution і не повертає room до `playing`/round до `voting`.

## Acceptance Criteria

- Один або нуль submitted participants не завершують round; другий повний ballot атомарно створює рівно один terminal result.
- Усі positive/negative combinations відповідають правилу v0.1. Якщо matched movies мають різну strength, обирається найсильніший незалежно від їхніх positions або порядку participants.
- За рівної найвищої strength обирається один із tied movies і persisted winner лишається незмінним після retry, reload, reconnect або concurrent resolution attempt.
- За match current round стає `matched`, room стає `matched` і рівно один round movie selected. За відсутності match round стає `no_match`, room лишається `playing` і selected movie немає.
- Помилка під час selected flag або status writes відкочує весь resolution разом із другим ballot; snapshot не розкриває чужі votes, доки terminal transition не committed.
- Підроблений result, чужий round/session, нечинна кімната або resolver для already terminal round не змінюють persisted outcome.
- TV, host і guest без ручного reload отримують однаковий result. Лише після завершення round вони бачать обидва ballots; snapshot не містить credentials або receipt data.
- No-match не створює наступний round, а match не реалізує final actions завчасно.
- `pnpm verify`, exhaustive match-rule tests, цільові PostgreSQL concurrency/rollback tests і hosted three-screen smoke test проходять.

## Verification

- Unit/service tests: усі meaningful vote pair combinations, кілька одночасних matches різної strength, mixed-order symmetry, no-match, incomplete ballots, malformed persisted input і idempotent terminal replay.
- Tie tests використовують injected chooser або детермінований candidate selection seam: перевіряти eligible tied set і persisted single winner, а не flaky statistical randomness.
- PostgreSQL integration: другий ballot + resolution в одній transaction, room lock/concurrent final submits, unique selected constraint, rollback на кожному critical write, terminal replay та room isolation.
- Реальний браузер із hosted Supabase: перший submit лишається private, другий показує однаковий result на TV і двох телефонах, response loss/retry та reconnect не змінюють winner і не розкривають votes до commit.

## Out of Scope

- Playful result animation і decorative effects — задача 012.1.
- Генерація наступного round і випадкові no-match messages — задача 013.
- Повна match presentation, humorous final message і final layout — задача 014.
- Search again, Close room і post-match host commands — задача 015; expiration cleanup — задача 016.
- Нові scoring factors, персоналізація, veto rules, watched state, ratings або client-side result calculation.

## References / Notes

- Джерела істини: [Voting](../docs/v0.1.md#voting), [Match rule](../docs/v0.1.md#match-rule), [stack](../docs/stack.md), [schema](../docs/domain/database-schema.md), [011 — Voting](011-voting.md) і `AGENTS.md`.
- `round_status`, `room_status` та partial unique selected-movie constraint уже задають основні terminal invariants; будь-яку додаткову schema зміну робити лише для конкретної atomicity, idempotency або integrity потреби.
