# 012.1 — Round result transition

## Goal

Зробити завершення раунду на TV зрозумілим і легким: після committed match виділити authoritative selected movie серед тих самих трьох карток і показати голоси безпосередньо в cards, а після no-match одразу показати статичний доброзичливий result block над картками. Стабільний persisted result лишається доступним одразу й не залежить від завершення animation.

## Dependencies

- [012 — Match calculation](012-match-calculation.md): persisted terminal round status, selected movie та post-resolution public snapshot.
- [010 — Start game and generate round](010-start-game-and-generate-round.md): стабільний ordered movie set, movie cards і спільний Realtime invalidation/resync flow.

## Scope / Requirements

### Match emphasis

- Коли TV отримує authoritative `matched` result, залишити наявні три movie-card DOM nodes у тій самій геометрії та додати presentation classes із persisted `selectedMovieId`.
- Протягом приблизно `333 ms` selected card отримує текстову мітку та green glow, а дві інші картки приглушуються. Після CSS animation мітка, glow і приглушення лишаються як stable result; animation не використовує scale або іншу геометрію, що може створити scrollbar.
- Під кожною карткою показати два окремі рядки authoritative votes: `Ведучий: <vote>` і `Гість: <vote>`. Не рендерити на TV окремий нижній panel «Результат раунду» або дубльований список фільмів.
- Реалізувати emphasis CSS animation/keyframes без React timer, Effect, stage state, transition controller або animation runtime/package.

### No-match result presentation

- Для committed `no_match` показати короткий доброзичливий статичний result block над трьома cards. Він не повинен виглядати як error, поразка чи покарання; текст явно повідомляє результат.
- Cards із розкритими votes рендеряться одразу з authoritative snapshot. No-match presentation не використовує transient overlay, CSS timer, client-side stage state або completion callback.
- Статичний block не керує майбутньою next-round логікою задачі 013.

### Authoritative and repeat-safe lifecycle

- Presentation читає лише authoritative terminal snapshot. UI не читає Broadcast payload як result, не визначає winner і не виконує database mutation.
- Наявний Realtime topic залишається invalidation hint: після нього клієнт повторно читає snapshot і React додає відповідні CSS classes.
- Звичайні rerenders і duplicate invalidations не змінюють static no-match presentation; match animation не перезапускається, доки ті самі card nodes та classes лишаються mounted. Новий terminal matched round і reload можуть один раз запустити власну коротку CSS animation.
- За `prefers-reduced-motion` одразу показати читабельний stable result без decorative motion або проміжного presentation state.

### Phone result timing

- Після першого authoritative terminal snapshot host і guest phones одразу показують compact result: final status, selected movie за match та розкриті ballots.
- TV presentation не координує доступ телефонів до result, не надсилає окремий reveal event і не додає fallback timer.

## Acceptance Criteria

- Committed match на TV не перемонтовує three-card grid: authoritative selected movie отримує короткий CSS emphasis і лишається підсвіченим, а під кожною card показані два role-labelled votes.
- TV не показує окремий нижній panel «Результат раунду»; stable result залишається частиною original three-card layout.
- Committed no-match показує короткий lighthearted static result block над cards із розкритими votes без timer, Effect, controller або completion callback.
- Existing Realtime invalidation/resync є єдиним шляхом отримання terminal result; presentation не додає channel, protocol, mutation або client-side result calculation.
- Duplicate invalidation і звичайний rerender не перезапускають animation; reload/reconnect recovery завжди показує той самий persisted result.
- Reduced-motion користувач одразу читає stable terminal result без decorative animation.
- Host і guest phones одразу показують той самий authoritative compact result без очікування TV.
- `pnpm verify` і browser smoke test для match, no-match, reload/reconnect, reduced motion та common TV viewport проходять.

## Verification

- Static review: terminal classes і per-card votes походять лише з persisted terminal result; match animation timing та reduced-motion behavior повністю описані в feature-scoped CSS, а no-match block є static.
- Browser visual verification: match, no-match, already-terminal reload/reconnect, `prefers-reduced-motion` і common TV viewport. Переконатися, що match animation не додає scrollbar, glow не зникає, no-match block не перекриває cards і stable result лишається читабельним.
- Phone verification: host і guest одразу отримують terminal result після authoritative resync без Broadcast reveal hint або fallback timer.

## Out of Scope

- Fullscreen/modal/shared-element selected-card morph і окремий animation runtime.
- Match heading, final humorous message і майбутні host-action slots — [014 — Match screen](014-match-screen.md).
- No-match informal message, readiness buttons і next-round flow — [013 — No-match next round](013-no-match-next-round.md).

## References / Notes

- Джерела істини: [Round result transition](../docs/v0.1.md#round-result-transition), [When there is a match](../docs/v0.1.md#when-there-is-a-match), [When there is no match](../docs/v0.1.md#when-there-is-no-match), [stack](../docs/stack.md), [012 — Match calculation](012-match-calculation.md) і `AGENTS.md`.
