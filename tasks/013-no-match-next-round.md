# 013 — No-match next round

## Goal

Після завершеного `no_match` дати двом учасникам час подивитися й обговорити розкриті реакції, а потім створити наступний раунд лише після того, як обидва підтвердять готовність продовжити.

## Dependencies

- [012 — Match calculation](012-match-calculation.md): authoritative persisted `no_match`, розкриті post-resolution votes і room, що лишається `playing`.
- [012.1 — Round result transition](012-1-round-result-animation.md): TV no-match presentation, immediate authoritative phone result та existing Realtime room topic.
- [010 — Start game and generate round](010-start-game-and-generate-round.md) та [010.1 — Game-start fixes](010-1-game-start-fixes.md): reusable filter selection, three-position atomic round creation, seen-movie exclusion і `exhausted`/Restart list contract.

## Scope / Requirements

### No-match result and joint decision

- Одразу з authoritative `no_match` result TV показує одну коротку informal українську фразу з каталогу `next-intl`, узгодженого з прикладами active specification. Фраза має бути легкою й жартівливою, а не звинувачувати учасників або виглядати як error; декоративна CSS reaction задачі 012.1 не є prerequisite або completion boundary.
- Вибір фрази стабільний для terminal round під час rerenders/reconnect. Дозволено детерміновано вибрати її за stable round ID замість додаткового persisted поля, якщо після recovery показується той самий текст.
- TV одразу лишається на no-match result із трьома cards і розкритими votes та показує коротке питання: «Готові рухатись далі?». TV не має інтерактивної mutation surface.
- На обох phones під compact no-match result показати те саме питання й одну кнопку «Далі». Не переходити автоматично за timer, local Effect, TV event або дією лише одного participant.
- Перший participant, що натиснув «Далі», бачить стійкий нейтральний стан «Чекаємо на іншого гравця». Інший participant бачить свою кнопку «Далі»; TV може показувати non-sensitive aggregate readiness, але не повинен вимагати від користувача дивитися на phone, щоб зрозуміти result.
- Після підтвердження другого participant обидва screens коротко показують прогрес створення round, а потім синхронно переходять до нового ballot. Не додавати confirm modal, countdown, auto-advance або окрему host privilege для цієї спільної дії.
- За `prefers-reduced-motion` прибрати декоративний motion, але не пропускати читабельний no-match result, питання чи readiness state.

### Persisted two-participant readiness

- «Далі» — validated Next.js server command із `roomCode`, committed terminal `roundId` і browser-persisted request ID. Client не передає movie IDs, next round number, filters, current status, readiness іншого participant або catalog outcome як авторитетні дані.
- Авторизувати кожен click чинною room-scoped participant cookie. Під room lock сервер повторно перевіряє non-expired `playing` room, що terminal `no_match` round належить цій кімнаті й досі є current round, а authenticated participant належить кімнаті.
- Persist readiness окремо для кожного participant і terminal round. Reload, reconnect, response loss або повторне натискання відновлюють ту саму готовність, а не скидають спільне рішення чи вимагають повторно натиснути.
- Лише дві distinct persisted readiness від host і guest можуть запустити generation. Перший valid command зберігає тільки свою готовність; другий в одній Drizzle transaction зберігає свою готовність, створює successor outcome і не допускає іншого parallel round.
- Request ID зберігається в браузері до mutation і очищається лише після підтвердженого terminal response. Server-side uniqueness/replay contract гарантує, що double click, reload, lost response, two tabs або concurrent confirmations не дублюють readiness чи successor round.
- Якщо readiness/receipt потребує schema change, додати Drizzle migration і metadata, RLS/no-write grants для browser roles та оновити `docs/domain/database-schema.md` і idempotency documentation у тій самій зміні. Public snapshot може містити лише aggregate readiness і поточний participant's own readiness; не серіалізувати request IDs, payload hashes або credentials.

### Atomic next-round generation and exhausted list

- Після двох persisted confirmations у тій самій transaction повторно прочитати saved filters, виключити всі movies із current room history, випадково вибрати рівно три eligible movie IDs, створити наступний sequential `voting` round і його positions та зберегти idempotent outcome.
- Reuse/refactor наявний cohesive game-round generation boundary замість дублювання filter SQL, random selection, position writes або catalog classification. Не послаблювати room lock, unique current-round invariants чи transaction rollback.
- Якщо після exclusion лишилося менше трьох movies, не створювати partial round. Лише після згоди обох перевести room у canonical `exhausted` state й використати наявний host Restart list recovery, який видаляє round history лише після явної host action.
- Недостатність unseen movies не змінює filters, participants або original `expiresAt`. Попередній no-match round, votes і readiness лишаються persisted до успішного Restart list або expiration cleanup.
- Після committed successor/exhausted outcome надіслати одну non-sensitive invalidation через наявний room Broadcast topic. Broadcast не містить movies, message index, readiness receipt або command data; усі screens повторно читають authoritative snapshot.
- Failed Broadcast не відкочує committed command. Fallback resync/reload показує readiness, новий voting round або exhausted recovery, а не застрягає на старому presentation state.

## Acceptance Criteria

- Committed no-match на TV одразу показує three-card result, informal message і питання «Готові рухатись далі?». CSS reaction задачі 012.1 є необов’язковим декоративним доповненням і не затримує цей стан; автоматичного next round немає.
- Host і guest обидва бачать кнопку «Далі». Один підтверджений click не створює round, а показує цьому participant стан очікування; лише два distinct persisted confirmations створюють рівно один наступний `voting` round.
- Після обох confirmations successor має наступний номер і три distinct eligible movies, яких ще не було в поточній room history. До commit жоден screen не показує client-invented next round.
- Reload, reconnect, response loss, double click, duplicate request, два tabs і concurrent confirmations не скидають readiness, не вимагають повторного рішення та не створюють duplicate/parallel rounds.
- Client-forged movie list, filters, round number, room state, чужа readiness або чужий/неактуальний/non-`no_match` round не можуть керувати generation і не залишають writes.
- Failure під час другого confirmation, successor round або position writes відкочує відповідну transaction; persisted перша readiness і старий no-match лишаються authoritative та дозволяють безпечно завершити той самий спільний decision.
- Якщо unseen eligible catalog має `0–2` movies, room стає `exhausted` лише після двох confirmations, partial round не створюється, а host отримує наявну можливість Restart list. Original expiration, participants і filters не змінюються.
- TV і два phones без ручного reload отримують однаковий readiness progress, next round або exhausted state. Ready state не розкриває credentials чи idempotency data.
- Reduced-motion користувач читає no-match result, питання та waiting state без руху; жоден timer/Effect не запускає round самостійно.
- `pnpm verify`, цільові service/component tests, PostgreSQL concurrency/rollback tests і hosted three-screen smoke test проходять.

## Verification

- Unit/service tests: current no-match guards, participant authorization, first/second readiness, own/aggregate public snapshot mapping, request replay/conflict, seen-movie exclusion, next round numbering, catalog exhaustion і stale/foreign round.
- PostgreSQL integration: persisted distinct readiness, room lock, concurrent first/second confirmations, exactly one successor, atomic readiness/round/positions/receipt writes, rollback на critical failure, isolation між rooms і exhausted transition.
- Component/effect tests: question and «Далі» presentation, first participant waiting state, second participant confirmation, reload recovery, request lifecycle, no auto-advance/timer, cleanup і reduced-motion presentation.
- Реальний браузер із hosted Supabase: TV + два phones завершують no-match, обговорюють votes, по черзі натискають «Далі» й отримують однакові нові cards; повторити з response loss/reload, two tabs і вичерпаним списком.

## Out of Scope

- Match calculation, vote privacy або зміна terminal result — задача 012.
- Match emphasis і базова no-match presentation — задача 012.1.
- Polished matched three-card screen — задача 014; Search again і Close room після match — задача 015.
- Автоматичний next round, auto-advance timer, додаткові confirm dialogs, Restart list без host action, повторення movies до явного restart, background jobs або окремий scheduler/queue.

## References / Notes

- Джерела істини: [When there is no match](../docs/v0.1.md#when-there-is-no-match), [Shown movies and restarting the list](../docs/v0.1.md#shown-movies-and-restarting-the-list), [stack](../docs/stack.md), [schema](../docs/domain/database-schema.md), [010 — Start game and generate round](010-start-game-and-generate-round.md), [012.1 — Round result transition](012-1-round-result-animation.md) і `AGENTS.md`.
- Ця задача свідомо замінює automatic advance з попереднього backlog wording на спільне persisted підтвердження двох participants: no-match залишається місцем для короткого обговорення, а не таймером, який примусово гортає каталог.
