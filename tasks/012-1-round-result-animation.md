# 012.1 — Round result transition

## Goal

Перетворити завершення раунду на зрозумілий візуальний перехід на TV: після committed match обрана картка виростає зі свого місця серед трьох фільмів у fullscreen result state, а після no-match екран показує окрему легку реакцію перед наступним стабільним станом.

## Dependencies

- [012 — Match calculation](012-match-calculation.md): persisted terminal round status, selected movie за match і post-resolution public snapshot.
- [010 — Start game and generate round](010-start-game-and-generate-round.md): стабільний ordered movie set, movie cards, round ID і спільний Realtime invalidation/resync flow.

## Scope / Requirements

### Shared-element match transition

- Коли TV уперше отримує новий authoritative `matched` result, спочатку залишити видимими три поточні movie cards і коротко підкреслити persisted selected movie. Інші дві картки можуть приглушитися або відійти на задній план, але результат не повинен залежати лише від кольору чи motion.
- Після короткого акценту плавно розгорнути selected movie card з її фактичної позиції у fullscreen match-result shell, який перекриває попередній grid. Перехід має візуально читатися як продовження тієї самої картки, а не як незв'язаний modal або нова сторінка.
- Використати Motion for React shared layout animation (`layoutId`, `LayoutGroup` за потреби та `AnimatePresence`) замість власного вимірювання DOM-координат і ручної FLIP-реалізації. Зберегти Motion локальним для result presentation; не перетворювати всі базові компоненти застосунку на `motion` components без конкретної потреби.
- Кінцевий shell у цій задачі може лишатися мінімальним: selected movie, читабельний match heading і наявні vote details. [014 — Match screen](014-match-screen.md) перетворить його на повний фінальний дизайн, не змінюючи transition contract.
- Орієнтовний ритм: короткий selected-card emphasis близько `300–500 ms`, далі розгортання близько `700–1000 ms`. Точні значення визначити під час visual verification; загальний перехід не повинен відчуватися повільним або затримувати результат заради декоративності.

### No-match transition and completion boundary

- Для committed `no_match` показати візуально інший короткий доброзичливий transition без selected-card morph: усі три картки можуть м'яко відступити, а поверх них з'являється lighthearted no-match reaction.
- No-match не повинен виглядати як помилка, поразка чи покарання. Emoji та decorative shapes дозволені, але текст явно повідомляє результат.
- Після завершення no-match transition викликати один явний local completion callback/state boundary. [013 — No-match next round](013-no-match-next-round.md) використає його для показу informal message і запуску idempotent next-round command.

### Authoritative and repeat-safe lifecycle

- Запускати transition лише з authoritative snapshot, де current round уже `matched` або `no_match`. Motion layer не читає Broadcast payload як результат, не визначає winner і не виконує database mutation.
- Ключувати presentation стабільною парою `roundId + terminal status`. Duplicate/forged invalidations і звичайні rerenders не перезапускають transition нескінченно; новий terminal round може показати власний transition.
- Reload або reconnect може один раз повторити короткий transition поточного terminal round, але завжди завершується тим самим persisted result. Втрата local animation state не блокує recovery.
- Не створювати окремий Realtime channel або авторитетний animation protocol. Наявний authoritative resync визначає result; animation state залишається локальною presentation-деталлю.
- Не використовувати transition completion як доказ server-side authorization або correctness. Якщо animation скасована, component unmount-иться чи snapshot переходить до нового round, timers/callbacks очищаються і застарілий completion не впливає на новий стан.

### Phone reveal coordination

- Після першого authoritative terminal snapshot host і guest phones не показують winner або розкриті ballots перед TV. Замість цього обидва бачать короткий читабельний стан на кшталт «Результат готовий — дивіться на екран» без власної декоративної animation.
- Після завершення TV transition TV надсилає через наявний room Broadcast topic один ephemeral `result_reveal_ready` hint із terminal `roundId` і status. Він не містить winner, movie IDs, votes, message text, credentials або будь-яких server-only даних.
- Phone обробляє hint лише коли його поточний authoritative snapshot уже має той самий `roundId` і terminal status. Event не встановлює room state, не визначає результат і не запускає mutation; duplicate або forged hint може лише передчасно відкрити вже авторитетно отриманий result.
- Якщо hint не прийшов через disconnect, reload або відсутній TV, phone відкриває compact terminal result після bounded local fallback timeout. Direct load/reload already-terminal room не чекає безкінечно на TV й може одразу показати persisted result.
- TV надсилає hint щонайбільше один раз для `roundId + terminal status`; phones очищають timeout/listener при unmount, round change або reveal. Один existing room topic лишається достатнім — не додавати таблицю, Server Action, Broadcast channel або окремий Realtime protocol.

### Accessibility, performance, and bundle boundary

- Поважати `prefers-reduced-motion`: не масштабувати й не переміщувати картку через viewport, а одразу або через короткий opacity transition показати статичний еквівалент із тим самим змістом.
- Не використовувати rapid flashing, різкі повторні zoom effects або motion, від якого залежить розуміння результату. Після transition focus та screen-reader semantics відповідають стабільному result state.
- Fullscreen layer коректно працює на типовому TV viewport, не створює horizontal overflow на менших екранах і не лишає невидимий overlay, що перехоплює interaction.
- Завантажувати Motion лише в client-side result path. Використати `LazyMotion`/мінімальний feature boundary, якщо він підтримує потрібні shared layout animations без дублювання runtime; production build має підтвердити, що animation code не потрапив у непов'язані server або join-only bundles.
- Не додавати другу animation library, canvas engine, відео або зовнішній asset package.

## Acceptance Criteria

- Новий committed match спочатку показує три cards із persisted winner, а потім selected card плавно переходить зі своєї grid-позиції у fullscreen result shell; візуальний зв'язок не імітується випадково обраною client-side карткою.
- Новий committed no-match запускає окрему lighthearted реакцію без winner morph і рівно один раз завершує integration boundary, потрібний задачі 013.
- Transition не запускається для `waiting`, звичайного `playing` без terminal round або client-forged payload і не змінює votes, selected movie, room status чи round status.
- Duplicate invalidations, React Strict Mode rerenders/remounts, resize, reload і reconnect не залишають подвійних callbacks, нескінченних повторів або permanent overlay. Кожен screen зрештою показує authoritative stable result.
- Host і guest phones під час TV transition показують лише нейтральний «дивіться на екран» state; після validated `result_reveal_ready` hint або bounded fallback показують compact result. Lost/duplicate/forged hint не може змінити persisted outcome або залишити phone у waiting назавжди.
- За `prefers-reduced-motion` користувач одразу отримує читабельний статичний match/no-match result без масштабування або декоративного руху; зміст не залежить лише від кольору чи emoji.
- Match/no-match читаються на TV viewport, selected poster/title не мають помітного scale distortion, transition не створює overflow, а animation layer звільняє interaction після завершення.
- Motion лишається route/feature-scoped dependency; production bundle review не показує її в непов'язаних entry points.
- `pnpm verify`, цільові component/effect tests і browser visual smoke test для match, no-match, reduced-motion, reload/reconnect та типового TV viewport проходять.

## Verification

- Component tests: mapping `matched | no_match` до distinct presentations, persisted selected movie mapping, stable `roundId + status` key, completion boundary, cleanup і відсутність transition для non-terminal states.
- Effect tests: duplicate invalidations, rerender, Strict Mode remount, round change, resize та unmount не залишають подвійних timers/callbacks або permanent overlay.
- Realtime/presentation tests: TV надсилає один мінімальний hint після terminal transition; phone accepts тільки matching authoritative round/status, handles duplicate/forged/lost hints, cleans fallback timeout і reveals persisted result after reconnect/direct load.
- Browser visual verification: shared-element path від кожної з трьох можливих card positions до fullscreen shell, no-match reaction, reduced-motion emulation, reload/reconnect, image aspect ratio та відсутність overflow. Не використовувати brittle pixel-perfect assertions для проміжних transform values.
- Production build review: animation dependency завантажується лише там, де потрібна, і не спричиняє hydration warnings або server/client boundary errors.

## Out of Scope

- Match calculation, tie-breaking, vote privacy або database writes — задача 012.
- Автоматичне створення наступного round і каталог no-match messages — задача 013.
- Повний fullscreen match layout, final humorous message і polished information hierarchy — задача 014.
- Search again, Close room і post-match host commands — задача 015; expiration cleanup — задача 016.
- Звуки, музика, haptics, user-selectable themes, animation editor, WebGL/canvas effects або друга animation dependency.

## References / Notes

- Джерела істини: [Round result transition](../docs/v0.1.md#round-result-transition), [When there is no match](../docs/v0.1.md#when-there-is-no-match), [When there is a match](../docs/v0.1.md#when-there-is-a-match), [stack](../docs/stack.md), [012 — Match calculation](012-match-calculation.md) і `AGENTS.md`.
- Motion shared layout documentation: <https://motion.dev/docs/react-layout-animations>. Bundle guidance: <https://motion.dev/docs/react-reduce-bundle-size>.
- Задачі 012.1 і 014 ділять один visual contract: 012.1 володіє переходом між layout states, а 014 — змістом і композицією стабільного destination state.
