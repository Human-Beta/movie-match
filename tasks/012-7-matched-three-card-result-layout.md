# 012.7 — Matched three-card result layout

## Goal

Зробити stable matched state на TV продовженням Three Cards Mode: залишити на екрані ті самі три poster cards, підсвітити й трохи збільшити persisted selected movie, а під кожною карткою показати голос ведучого та гостя окремими рядками. Не показувати окремий нижній блок «Результат раунду» або single-card fullscreen result.

## Dependencies

- [012 — Match calculation](012-match-calculation.md): authoritative terminal `matched` status, persisted `selectedMovieId` і public votes для кожного movie.
- [012.1 — Round result transition](012-1-round-result-animation.md): короткий selected-card emphasis, result lifecycle і reduced-motion contract.
- [010 — Start game and generate round](010-start-game-and-generate-round.md): stable ordered three-card movie set та poster fallback.

## Scope / Requirements

### Stable TV layout

- Після short emphasis із задачі 012.1 зберегти three-card grid у тій самій order і близькій геометрії, що й під час voting. Direct load або reload уже matched room одразу показує цей stable layout, а не проміжний animation state.
- Persisted selected movie має text label «Обрано», green glow/ring і легкий scale. Інші дві картки залишаються видимими, але не конкурують із winner; result не повинен залежати тільки від кольору або glow.
- Під кожною карткою показати два окремі рядки: `Ведучий: <vote>` та `Гість: <vote>`. Використати існуючі локалізовані role labels і vote presentation; не переобчислювати match або selected movie на client.
- Не рендерити під grid загальний `RoundResult` panel, дубльований список усіх трьох results або single selected card. Movie title, poster/fallback і metadata лишаються у наявній card presentation.
- Layout не має створювати fullscreen overlay, змінювати scroll owner, різко змінювати document height або мати другий scrollbar. За довгих назв, missing poster, zoom і TV viewport vote rows не повинні спричиняти card overflow чи зламати grid.

### Data and accessibility boundary

- Взяти голоси лише з authoritative public terminal snapshot. Якщо очікувана vote set відсутня або malformed, не вигадувати значення: показати безпечний existing terminal fallback і зафіксувати інваріант у component tests.
- Role label і vote value мають бути текстово доступними; emoji можуть доповнювати значення, але не бути єдиним носієм змісту.
- Host і guest phones і далі одразу показують compact authoritative result; TV layout не додає Broadcast event, timer або mutation.

## Acceptance Criteria

- Після match TV стабільно показує три original movie cards, а не одну fullscreen/single card; selected movie читабельно виділений серед них.
- Під кожною з трьох cards видимі рівно два окремі role-labelled votes із public terminal snapshot.
- Нижнього «Результат раунду» panel немає; назви, posters/fallback і metadata не дублюються в окремому result list.
- Reload/reconnect already-matched room, reduced motion, missing poster, long values, common TV viewport і browser zoom зберігають той самий readable layout без scroll jump або додаткового scrollbar.
- `pnpm verify`, component/accessibility tests і real-browser TV smoke test проходять.

## Verification

- Component tests: ordered three-card rendering, selected movie mapping, host/guest vote mapping per card, missing/malformed vote fallback та відсутність `RoundResult` panel у TV matched state.
- Browser visual verification: всі три possible winner positions, reload/reconnect already-matched room, reduced motion, missing poster, long Ukrainian title/genre list, TV viewport і zoom.

## Out of Scope

- Match calculation, vote persistence, tie-breaking або phone mutation — задача 012.
- Короткий result emphasis і no-match reaction — задача 012.1.
- No-match next-round flow — задача 013.
- Fullscreen/shared-layout/modal experimentation — задача 029; вона не має замінити цей stable three-card layout без нового product decision.

## References / Notes

- Ця задача замінює попередній visual direction single-card fullscreen stable match screen із задачі 014. [014 — Match screen](014-match-screen.md) збережена лише як superseded record.
- Джерела істини: [Three Cards Mode](../docs/v0.1.md#three-cards-mode), [When there is a match](../docs/v0.1.md#when-there-is-a-match), [012 — Match calculation](012-match-calculation.md), [012.1 — Round result transition](012-1-round-result-animation.md) і `AGENTS.md`.
