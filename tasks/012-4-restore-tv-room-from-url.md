# 012.4 — Restore TV room from a direct URL

## Goal

Коли TV відкриває існуючу доступну кімнату безпосередньо за `/tv/{roomCode}`, відновити її як поточну TV-кімнату в `localStorage`. Це має працювати після ручного очищення сховища та після reload, щоб наступне відкриття `/tv` повернуло користувача до тієї самої кімнати.

## Dependencies

- [005 — Create and restore TV room](005-create-and-restore-tv-room.md): поточний TV room code у `localStorage` і відновлення кімнати через `/tv`.
- [007 — Realtime room participants](007-realtime-room-participants.md): authoritative TV snapshot та unavailable room states.

## Scope / Requirements

- Після успішного завантаження доступної TV-кімнати за її direct URL записувати її нормалізований `roomCode` як поточний TV room code в `localStorage`; попередній code можна замінити.
- Не записувати code для unavailable, closed або expired room і не перетворювати `localStorage` на джерело істини про існування кімнати.
- Зберегти поточний безпечний fallback, коли browser storage недоступне або пошкоджене; direct URL все одно має показувати authoritative room state.
- Не змінювати room creation, participant credentials, server-side authorization, Realtime topic або browser database access.

## Acceptance Criteria

- Після очищення `localStorage` і відкриття valid `/tv/{roomCode}` наступне відкриття `/tv` відновлює саме цю кімнату.
- Відкриття іншої valid TV room URL замінює попередній locally saved code.
- Invalid, unavailable, closed або expired `/tv/{roomCode}` не зберігає code і не змінює поведінку `/tv` на помилкове відновлення.
- Reload valid TV room не втрачає її local restoration path.
- Unit tests покривають valid write, replacement, unavailable rejection і storage failure; manual browser check покриває очищене `localStorage` та direct URL.
- `pnpm verify` і цільові checks проходять.

## Out of Scope

- Новий механізм room discovery, history кількох TV rooms, cross-device sync `localStorage` або зміна server-side room lifecycle.
- Збереження participant credentials чи будь-яких Realtime capability values у browser storage.

## References

- Source: hosted verification follow-up, 2026-09-19.
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, [005](005-create-and-restore-tv-room.md), [007](007-realtime-room-participants.md), and `AGENTS.md`.
