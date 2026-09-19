# 012.2 — Compact phone ballot layout

## Goal

Зробити ballot зручним на вузьких екранах, не дублюючи на телефоні великі постери й повний metadata-набір, які одночасно доступні на TV.

## Dependencies

- [011 — Voting](011-voting.md): authoritative private ballot, immutable submit state та доступні vote controls.
- [012 — Match calculation](012-match-calculation.md): terminal result і public round snapshot.

## Scope / Requirements

- Визначити narrow-screen presentation для телефонного ballot без зміни authoritative snapshot, ballot payload або match calculation.
- На малих viewport-ах показувати компактні картки з назвою фільму, стабільною позицією, поточним вибором і всіма чотирма доступними реакціями.
- Прибрати або суттєво зменшити на телефоні poster, рік, runtime та genres, якщо вони не потрібні для зрозумілого й доступного вибору; TV і wider layouts зберігають повну картку.
- Зберегти доступні labels, keyboard/touch interaction, видимий selected state та мінімально зручні touch targets для кожної реакції.
- Не змінювати desktop/tablet layout без потреби, не додавати client-side product state і не передавати дані через Broadcast payload.
- Перевірити narrow phone widths з poster і без poster, довгими назвами, усіма чотирма vote values, pending/retry/submitted state та terminal result після resolution.

## Acceptance Criteria

- На вузькому телефоні три фільми та чотири реакції для кожного лишаються однозначними й керованими без горизонтального скролу.
- Компактний режим не показує зайвий великий poster/metadata блок лише тому, що ці деталі вже видно на TV.
- Обраний vote, disabled/immutable state, feedback і progress лишаються зрозумілими та доступними.
- Wide phone, tablet, desktop ballot і TV presentation не регресують.
- Не змінюються ballot validation, idempotency, snapshot privacy, match result або Realtime transport contract.
- `pnpm verify` і цільові browser/manual viewport checks проходять.

## Out of Scope

- Новий visual design для TV, match screen чи round-result animation.
- Зміна кількості карток, vote values, ballot flow або їх server-side contract.
- Нові breakpoint frameworks, device detection, user preferences або окремий mobile API.

## References

- Source: phone-layout follow-up during hosted verification of PR #33.
- Related tasks: [012.1 — Round result animation](012-1-round-result-animation.md), task 014 — Match screen.
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, and `AGENTS.md`.
