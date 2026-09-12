# 012.1 — Round result animation

## Goal

Додати на TV короткий виразний animated transition після завершення раунду, щоб match відчувався як маленька перемога, а no-match — як легкий веселий момент, не змішуючи presentation із голосуванням або авторитетним обчисленням результату.

## Dependencies

- [012 — Match calculation](012-match-calculation.md): persisted terminal round status, selected movie за match і post-resolution public snapshot.
- [010 — Start game and generate round](010-start-game-and-generate-round.md): movie cards, стабільний round ID і спільний Realtime invalidation/resync flow.

## Scope / Requirements

### TV result transition

- Після першого отримання нового committed terminal result для current round показати на TV короткий full-screen або card-layer transition перед стабільним result state.
- Зробити два візуально різні сценарії:
  - `matched` — святкова композиція з веселими emoji, акцентом на selected movie та легким celebratory motion;
  - `no_match` — доброзичлива жартівлива реакція з expressive emoji та іншим motion pattern без відчуття помилки або покарання.
- Анімація має бути достатньо помітною на відстані TV, але короткою: орієнтовно 1.5–3 секунди без обовʼязкового interaction. Після неї UI автоматично переходить до стабільного state, яким керують наступні feature tasks.
- Використовувати React, CSS і наявний Tailwind setup. Не додавати animation library, canvas engine, відео або зовнішній asset package без доведеної потреби, яку неможливо чисто реалізувати наявним стеком.
- Усі текстові фрази централізувати через Ukrainian-only `next-intl`. Emoji й decorative shapes можуть бути частиною композиції, але не є єдиним способом повідомити result.

### Authoritative and repeat-safe behavior

- Запускати transition лише з авторитетного snapshot, де round уже `matched` або `no_match`. Анімація не читає raw Broadcast payload як result, не обчислює match і не виконує database або Server Action mutations.
- Ключувати presentation state стабільною парою `roundId + terminal status`. Duplicate/forged invalidations і повторні renders не перезапускають animation нескінченно; новий terminal round може показати власний transition.
- Reload або reconnect може один раз повторно показати короткий transition для поточного terminal round, після чого обовʼязково доходить до того самого persisted stable result. Втрата animation state ніколи не блокує room recovery.
- Не створювати окремий Realtime channel або animation event protocol. Наявний authoritative resync визначає result, а motion лишається локальним presentation effect.
- Для `no_match` надати явний completion callback/state boundary, який задача 013 зможе використати перед показом message і створенням наступного round. Для `matched` задача 014 зможе замінити stable placeholder повним final screen.

### Accessibility and resilience

- Поважати `prefers-reduced-motion`: без рухомих частинок, масштабування або тривалого transition; одразу показати статичний еквівалент із тим самим match/no-match meaning.
- Не використовувати rapid flashing, різкі повторні zoom effects або motion, від якого залежить розуміння результату. Контраст, текст і selected-card emphasis мають лишатися читабельними без animation.
- Анімація має коректно працювати на типовому TV viewport і деградувати без horizontal overflow на менших екранах під час browser verification. Decorative layers не перехоплюють controls наступного stable state.
- Cleanup timers/listeners під час unmount, round change або reconnect. React Strict Mode remount не повинен подвоювати timers, effects чи залишати overlay назавжди.

## Acceptance Criteria

- Новий committed `matched` result запускає на TV один celebratory transition із selected movie emphasis, після якого лишається стабільний match state.
- Новий committed `no_match` result запускає окремий lighthearted transition, після якого лишається стабільний no-match state й доступний integration boundary для задачі 013.
- Animation ніколи не запускається для `waiting`, `playing` без terminal round або client-forged payload і не змінює votes, winner, room status чи round status.
- Duplicate invalidations і React rerenders не створюють нескінченних повторів. Reload/reconnect завершується тим самим persisted result навіть якщо transition повторився один раз.
- За `prefers-reduced-motion` користувач одразу отримує читабельний статичний result без декоративного руху; зміст не залежить лише від кольору або emoji.
- Transition читається на TV viewport, не створює overflow, очищає timers/effects і не блокує наступний stable screen або controls.
- `pnpm verify`, цільові component/effect tests і browser visual smoke test для обох результатів та reduced-motion проходять.

## Verification

- Component tests: mapping `matched | no_match` до двох distinct presentations, stable `roundId + status` key, completion boundary, cleanup і відсутність transition для non-terminal states.
- Effect tests: duplicate invalidations, rerender, Strict Mode remount, round change та unmount не залишають подвійних timers або permanent overlay.
- Browser visual verification: TV viewport для match/no-match, selected movie emphasis, reduced-motion emulation, reload/reconnect і відсутність overflow. Не використовувати brittle pixel-perfect assertions для decorative particle positions.

## Out of Scope

- Match calculation, tie-breaking, vote privacy або database writes — задача 012.
- Автоматичне створення наступного round і каталог no-match messages — задача 013.
- Повний final match layout, final humorous message і post-match controls — задачі 014–015.
- Звуки, музика, haptics, user-selectable themes, animation editor, WebGL/canvas engine або нова third-party motion dependency.

## References / Notes

- Джерела істини: [Round result transition](../docs/v0.1.md#round-result-transition), [When there is no match](../docs/v0.1.md#when-there-is-no-match), [When there is a match](../docs/v0.1.md#when-there-is-a-match), [stack](../docs/stack.md), [012 — Match calculation](012-match-calculation.md) і `AGENTS.md`.
- Візуальний напрям навмисно лишається достатньо гнучким для реалізації: acceptance criteria фіксують емоцію, доступність і lifecycle, а не конкретну кількість emoji або траєкторії частинок.
