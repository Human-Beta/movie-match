# 029 — Deferred shared-layout match transition

## Goal

Після того як стабільний fullscreen match screen буде готовий, окремо спроєктувати і перевірити polished transition: persisted selected card плавно виростає зі своєї позиції до центрованого fullscreen/modal presentation, а дві інші картки лишаються позаду приглушеними й blurred.

## Dependencies

- [012.1 — Round result transition](012-1-round-result-animation.md): простий, перевірений selected-card emphasis і reveal lifecycle.
- [012.7 — Matched three-card result layout](012-7-matched-three-card-result-layout.md): canonical stable matched destination після short result emphasis.

## Scope / Requirements

- Переходити лише з authoritative matched result і persisted `selectedMovieId`; animation ніколи не визначає winner, не змінює room state і не замінює authoritative resync.
- До старту переходу source залишається нормальним three-card grid. Selected card має зберегти візуальну ідентичність; дві інші картки можуть лишитися на задньому плані з blur/dim, але не повинні перетворюватися на окремий scrollable page.
- Будь-який fullscreen/modal prototype мусить мати чітко визначений один scroll owner і після завершення без розриву повертатися у stable three-card layout задачі 012.7. Не перетворювати modal у новий stable destination без окремого product decision.
- Не допускати зміни document height, другого scrollbar, scroll jump, relocation card вниз сторінки або тимчасового oversized grid. Перевірити всі три позиції selected card, reload/reconnect already-terminal room, TV viewport і сповільнене відтворення animation.
- `prefers-reduced-motion` одразу показує stable destination без decorative motion. Keyboard focus і screen-reader announcement лишаються коректними; phone result timing не залежить від TV animation.
- Обрати animation implementation лише після малого browser prototype і visual review. Motion for React може бути доречним, але не є передумовою: не додавати package або shared-layout primitives, доки prototype не підтвердить стабільну геометрію та scroll behavior.

## Acceptance Criteria

- Selected card плавно переходить у центрований fullscreen/modal destination без crossfade як між різними сторінками.
- Background cards лишаються в контрольованій background layer; не створюються додаткові вертикальні області, scrollbar або document-height jump.
- На 10% і 100% animation speed немає card relocation, scrollbar flicker, page scroll або geometry jump; усі три source positions поводяться однаково.
- Reload/reconnect terminal match, reduced motion, common TV viewport, long title, missing poster і browser zoom завершуються у тому самому accessible stable result.
- `pnpm verify`, component/controller checks і real-browser visual smoke test проходять до повернення цієї animation у product flow.

## Evidence

- [Невдалий fullscreen-transition запис (2026-09-19, 23:18:46)](assets/029-shared-layout-transition-regression-2026-09-19.mov) — приклад небажаного document-height jump: card їде вниз, сторінка різко стає довгою, а viewport scroll-иться до середини. Цей запис є regression reference, а не бажаною поведінкою.

## Out of Scope

- Поточний короткий match emphasis і no-match result flow — задача 012.1.
- Стабільний fullscreen match content, copy і visual hierarchy — задача 014.
- Phone mutations, result calculation, next-round flow або окремий Realtime animation protocol.

## References / Notes

- Джерела істини: [When there is a match](../docs/v0.1.md#when-there-is-a-match), [stack](../docs/stack.md), [012.1 — Round result transition](012-1-round-result-animation.md), [014 — Match screen](014-match-screen.md) і `AGENTS.md`.
