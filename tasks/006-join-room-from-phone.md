# 006 — Join room from phone

## Goal

Дозволити двом людям без акаунтів безпечно приєднатися з телефонів до активної TV-кімнати, отримати ролі `host` і `guest` та зберегти participant identity для наступних команд гри.

## Scope / Requirements

- Додати `/join/{roomCode}` з українською формою: поле імені, кнопка приєднання та окремі стани loading, validation error, room unavailable і room full.
- Нормалізувати room code та перевіряти code й імʼя через Zod на server boundary. Після trim імʼя має містити `1–50` Unicode code points, підрахованих server-side через `Array.from(value).length` відповідно до character limit у PostgreSQL; не додавати вимогу унікальності імен.
- Нове приєднання дозволяти лише до наявної кімнати зі статусом `waiting` і `expiresAt` у майбутньому. Не змінювати статус прострочених кімнат у цій задачі.
- Виконувати join як одну атомарну server-side операцію через Drizzle: перший учасник отримує `host`, другий — `guest`, а третій не створюється. Серіалізувати конкурентні join-запити та використовувати constraints схеми як остаточний захист інваріантів.
- Згенерувати для успішного join high-entropy participant access token, зберігати в `participants.accessTokenHash` лише його криптографічний hash і не логувати raw token.
- Зберігати raw token тільки в захищеній `HttpOnly`, `SameSite=Lax` cookie, із `Secure` у production та expiration не пізніше `rooms.expiresAt`. Не передавати token у URL або client-readable storage.
- Якщо запит уже має чинну participant cookie для цієї кімнати, відновлювати того самого учасника замість створення нового. Така session може відновитися після reload у подальшому active state, але не для закритої чи простроченої кімнати.
- Після join показувати мінімальний український joined/waiting state з власним імʼям і роллю. Host filter form та live-оновлення учасників залишити наступним задачам.
- Додати цільові автоматизовані тести для validation, token hashing, повторного join і конкурентних запитів, включно з одночасними другим і третім join.

## Acceptance Criteria

- Перший успішний join створює рівно одного `host`, другий — рівно одного `guest`; навіть конкурентні запити не створюють більше двох учасників або двох однакових ролей.
- Третій користувач бачить узгоджене українське повідомлення, що кімната заповнена, без participant row або session cookie для відхиленого запиту.
- Некоректна, неіснуюча, закрита, прострочена або зі статусом, відмінним від `waiting`, кімната не приймає нового учасника й повертає безпечний, зрозумілий UI state.
- Reload або повторний submit із чинною cookie відновлює ту саму participant identity та не займає інший slot.
- Raw access token відсутній у базі, URL, browser-readable storage, server logs і response body; у базі зберігається лише унікальний hash.
- Join mutation проходить через validated Next.js server boundary і Drizzle; browser Supabase integration не отримує Data API writes або ширший client API.
- Production build, typecheck, lint, format check і додані тести проходять.

## Out of Scope

- Supabase Auth, email, accounts або постійні user profiles.
- Realtime participant updates, Presence, leave action або видалення учасника при disconnect — задача 007 не повинна трактувати disconnect як leave.
- Host filters і start-game controls — задачі 008 та 010.
- Голосування, match calculation, room closing та expiration transition — задачі 011–016.
- Вимога різних імен, редагування імені або зміна ролі.

## References / Notes

- Джерела істини: `docs/v0.1.md`, `docs/stack.md`, `lib/db/schema.ts` і `AGENTS.md`.
- Participant token є server-side authorization credential для майбутніх host і voting mutations; сама cookie не замінює перевірку room, participant та role у кожній команді.
- Користувацькі повідомлення мають бути природною українською, а не буквальним перекладом англомовних прикладів із `docs/ideas.md`.
