# 012.3 — Local ballot progress reconciliation

## Goal

Після успішного ballot submit одразу показувати автору підтверджений сервером progress, не чекаючи Broadcast або наступного snapshot, але не перетворювати browser state на альтернативне джерело істини.

## Dependencies

- [011 — Voting](011-voting.md): atomic private ballot, idempotency receipt, public aggregate progress та payload-free Broadcast invalidation.
- [012 — Match calculation](012-match-calculation.md): другий ballot atomically transition-ить round до terminal result.

## Context

Server Action уже повертає committed `submittedCount`, однак voting UI зараз зберігає лише локальний feedback. До наступного authoritative snapshot телефон автора може показувати застарілий `1/2` і повідомлення про очікування напарника, навіть коли сервер прийняв другий ballot. Інші екрани інколи отримують Broadcast/snapshot раніше за автора.

## Scope / Requirements

- Після terminal успішної відповіді Server Action застосовувати її non-sensitive committed `submittedCount` лише до локальної presentation-проєкції поточного round.
- Не створювати client-side vote, winner, room status або match/no-match result. За `2/2` показувати нейтральний result-ready/loading state, доки authoritative snapshot не містить persisted terminal result.
- Наступний успішний authoritative snapshot має замінювати локальну проєкцію; зміну round, unavailable/error state, unmount або retry потрібно безпечно очищати чи ігнорувати stale local result.
- Зберегти existing idempotency flow: pending request зберігається до terminal response, response loss допускає безпечний retry, а conflict/validation/unavailable/error не підвищують local progress.
- Не змінювати Broadcast payload, не передавати votes/result через Realtime і не відкривати browser Data API access.
- Винести logic у сфокусований reusable boundary тільки якщо він потрібен і phone UI, і snapshot-sync consumer; не створювати глобальний optimistic-state store.

## Acceptance Criteria

- Автор першого submit одразу бачить `1/2` і коректне повідомлення про очікування без ручного reload.
- Автор другого submit не бачить stale `1/2` або повідомлення, що потрібно чекати на себе; до terminal snapshot він бачить нейтральний result-ready/loading state.
- Delayed, missing або forged Broadcast не можуть підмінити локально показаний count, votes чи result; bounded authoritative refetch як і раніше convergence-ить усі три екрани.
- Server rejection, transport failure, response loss, altered retry та stale response не створюють false progress або false terminal result.
- Новий round, reconnect і reload не переносять локальну проєкцію попереднього round.
- Privacy contract зберігається: до terminal snapshot телефон не отримує чужі vote values, а Broadcast payload не містить product rows.
- Unit coverage перевіряє successful first/second submit, stale snapshot replacement, delayed/rejected response, round change та idempotent retry; hosted three-screen smoke перевіряє author-first feedback і reconnect.
- `pnpm verify`, relevant integration checks і targeted browser checks проходять.

## Out of Scope

- Загальний global optimistic cache або локальна синхронізація всіх Server Actions.
- Client-side match calculation, speculative winner selection, зміна database transaction або Realtime protocol.
- Зміна ballot values, карток, result animation чи compact phone layout.

## References

- Source: hosted verification follow-up for PR #33.
- Related tasks: [012.2 — Compact phone ballot layout](012-2-compact-phone-ballot-layout.md), [018 — Automated browser, Server Action, and database integration coverage](018-automated-integration-coverage.md).
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, `docs/domain/idempotency-and-participant-sessions.md`, and `AGENTS.md`.
