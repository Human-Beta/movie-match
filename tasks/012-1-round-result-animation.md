# 012.1 — Round result transition

## Goal

Зробити завершення раунду на TV зрозумілим і надійним: після committed match коротко виділити обраний фільм серед трьох карток, а після no-match показати доброзичливу коротку реакцію перед стабільним результатом. Складний fullscreen shared-layout morph відкладається до окремої задачі.

## Dependencies

- [012 — Match calculation](012-match-calculation.md): persisted terminal status, selected movie за match і post-resolution public snapshot.
- [010 — Start game and generate round](010-start-game-and-generate-round.md): стабільний ordered movie set, movie cards, round ID і спільний Realtime invalidation/resync flow.

## Scope / Requirements

### Match emphasis

- Коли TV уперше отримує authoritative `matched` result, залишити три поточні movie cards у їхній звичайній геометрії. Коротко виділити persisted selected movie текстовою міткою, зеленою glow-тінню та невеликим scale; інші дві картки можуть приглушитися.
- Акцент триває близько `300–500 ms`, після чого показати наявний стабільний match result із selected movie та vote details. Не додавати fullscreen overlay, окремий scroll owner, `position: fixed` presentation shell або shared-element morph у цій задачі.
- Використати CSS transitions лише для простого візуального акценту. Не додавати animation runtime/package лише для цього стану.

### No-match transition and completion boundary

- Для committed `no_match` показати візуально іншу коротку доброзичливу reaction поверх приглушених трьох карток. Вона не повинна виглядати як помилка, поразка чи покарання; текст явно повідомляє результат.
- Після завершення no-match reaction викликати один явний local completion callback/state boundary. [013 — No-match next round](013-no-match-next-round.md) використає його для показу informal message і запуску idempotent next-round command.

### Authoritative and repeat-safe lifecycle

- Запускати presentation лише з authoritative snapshot, де current round уже `matched` або `no_match`. UI не читає Broadcast payload як результат, не визначає winner і не виконує database mutation.
- Ключувати presentation стабільною парою `roundId + terminal status`. Duplicate/forged invalidations і звичайні rerenders не перезапускають transition нескінченно; новий terminal round може показати власний transition.
- Reload або reconnect може один раз повторити короткий transition поточного terminal round, але завжди завершується тим самим persisted result. Втрата local presentation state не блокує recovery.
- Не створювати окремий Realtime channel або авторитетний animation protocol. Наявний authoritative resync визначає result; presentation state залишається локальною деталлю.
- За `prefers-reduced-motion` одразу показати той самий читабельний стабільний result без декоративного руху. Якщо component unmount-иться чи snapshot переходить до нового round, timers/callbacks очищаються і застарілий completion не впливає на новий стан.

### Phone result timing

- Після першого authoritative terminal snapshot host і guest phones одразу показують compact result: final status, selected movie за match та розкриті ballots. Вони не чекають на TV, Broadcast hint, timer або локальну animation.
- TV presentation не координує доступ телефонів до result і не надсилає окремий `result_reveal_ready` event. Authoritative resync лишається єдиним джерелом terminal state на всіх екранах.

## Acceptance Criteria

- Committed match на TV коротко зберігає three-card layout: лише authoritative selected movie має текстову мітку, glow і невеликий scale, а інші картки не конкурують із ним. Після акценту екран показує стабільний persisted result без fullscreen overlay, стрибка геометрії чи додаткового scrollbar.
- Committed no-match на TV проходить послідовність `three-card result → no-match reaction → stable result` і рівно один completion callback; no-match не має selected-card morph.
- Host і guest phones одразу показують той самий authoritative terminal result; TV presentation не блокує їх і не потребує окремого Broadcast hint або fallback timer.
- Reload, reconnect, duplicate invalidation, unmount та новий round не створюють нескінченних transitions, stale callbacks або неправильний result.
- Reduced-motion користувач одразу читає той самий terminal result без decorative transition.
- `pnpm verify`, controller tests і browser smoke test для match, no-match, reload/reconnect, reduced motion та TV viewport проходять.

## Verification

- Unit tests: terminal presentation mapping, один match emphasis, один no-match completion, cleanup і reduced motion.
- Browser visual verification: match та no-match на TV, reload/reconnect already-terminal round, `prefers-reduced-motion`, common TV viewport і slow-motion inspection. Переконатися, що document не отримує другого scrollbar, не росте вертикально через transition і картка не змінює layout owner.
- Phone verification: host і guest одразу отримують terminal result після authoritative resync, без client-side result calculation, Broadcast hint або fallback timer.

## Out of Scope

- Fullscreen/modal selected-card morph, blurred background cards, shared layout primitives, Motion for React і окремий animation runtime — [029 — Deferred shared-layout match transition](029-deferred-shared-layout-match-transition.md).
- Повний stable fullscreen match design — [014 — Match screen](014-match-screen.md).
- No-match next-round flow — [013 — No-match next round](013-no-match-next-round.md).

## References / Notes

- Джерела істини: [When there is a match](../docs/v0.1.md#when-there-is-a-match), [When there is no match](../docs/v0.1.md#when-there-is-no-match), [stack](../docs/stack.md), [012 — Match calculation](012-match-calculation.md), [013 — No-match next round](013-no-match-next-round.md), [014 — Match screen](014-match-screen.md) і `AGENTS.md`.
- Невдалий fullscreen transition і його симптоми збережені як evidence у задачі 029, щоб майбутня реалізація не відтворила scroll/geometry regression.
