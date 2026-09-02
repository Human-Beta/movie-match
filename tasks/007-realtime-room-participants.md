# 007 — Realtime room participants

## Goal

Синхронізувати persisted participant state між TV і приєднаними телефонами через Supabase Realtime, щоб зміни `0/2 → 1/2 → 2/2` зʼявлялися без ручного reload і без відкриття продуктових таблиць браузеру.

## Scope / Requirements

- Додати авторитетний server-side participant snapshot через Next.js і Drizzle. Повертати клієнту лише потрібний room state, participant count, `name` і `role`, без `accessTokenHash`, внутрішніх participant identifiers або інших зайвих полів.
- Після первинного snapshot підписувати `/tv/{roomCode}` і joined phone state на окремий Supabase Realtime Broadcast channel конкретної кімнати.
- Використовувати high-entropy internal room UUID, а не короткий room code, у topic каналу. Передавати topic TV через server-rendered room state, а телефону — лише після успішного join або відновлення participant session.
- Після committed participant change надсилати з server-side коду подію `participants_changed` через Realtime Broadcast REST API з наявними Supabase project URL і publishable key; не додавати для цього secret/service-role key. Payload має бути порожнім або мінімальним і non-sensitive. Подія є лише invalidation signal: після неї клієнт повторно читає snapshot із server boundary і не будує стан з довільного Realtime payload.
- Якщо Broadcast request падає після database commit, не відкочувати успішний join: виконати bounded retry без sensitive logging. Поки TV чекає на одного або двох учасників, додатково робити low-frequency authoritative snapshot refresh і зупиняти fallback після `2/2`, переходу в інший room state або unmount.
- Не підписувати browser напряму на `postgres_changes` таблиці `participants`, не публікувати повний participant row і не відкривати широкий `anon SELECT`. Product mutations і authoritative reads залишаються server-side через Drizzle.
- На TV показувати актуальні `0/2`, `1/2` або `2/2` та безпечні participant names/roles. Першого учасника з роллю `host` показувати одразу після переходу до `1/2`, поки другий slot ще порожній; не чекати стану `2/2`. На телефонах показувати узгоджений waiting/ready state, не відкриваючи controls із задачі 008.
- Після `SUBSCRIBED`, reconnect або повторного mount виконувати resync snapshot; при unmount прибирати channel. Не створювати дубльованих subscriptions у React Strict Mode та обмежити повторні refetch на burst invalidations.
- Відрізняти Realtime transport status від participant membership. Disconnect телефона не видаляє participant row, не звільняє slot і не змінює роль; Presence у v0.1 для цієї задачі не потрібен.
- Додати тести snapshot sanitization і subscription lifecycle та перевірити повний `TV + phone 1 + phone 2` сценарій у hosted Supabase, оскільки локальний database-only Compose не емулює Realtime. Коротко описати цей verification path англійською в `docs/database.md`.

## Acceptance Criteria

- Відкритий TV без reload послідовно показує `0/2`, `1/2` і `2/2`, коли два окремі телефони успішно приєднуються.
- У стані `1/2` TV показує імʼя першого учасника та роль `host`, а другий slot лишається порожнім або явно очікує підключення.
- Початкове завантаження, reload і reconnect завжди відновлюють актуальний database state, навіть якщо Broadcast event було пропущено або доставлено повторно.
- Після змодельованої помилки Broadcast уже committed join зʼявляється на відкритому TV через bounded retry або waiting-state fallback без ручного reload.
- Підроблена, застаріла чи дубльована подія не може створити фальшивого учасника або роль у UI, бо snapshot із сервера залишається єдиним джерелом participant state.
- Realtime topic не базується на короткому room code, а event payload, serialized client state і participant snapshot responses не містять raw access token чи `accessTokenHash`.
- `participants` та інші продуктові таблиці не отримують browser `INSERT`, `UPDATE` або `DELETE`; задача не додає широкого `anon SELECT` чи зайвої Postgres Changes publication.
- Один mounted screen має не більше одного активного room channel, коректно прибирає його при unmount і resync-иться після повторного підключення.
- Production build, typecheck, lint, format check, додані тести та задокументований hosted Realtime smoke test проходять.

## Out of Scope

- Online/offline Presence, heartbeat, leave action або slot cleanup після disconnect.
- Host filter form, ready-state command або start-game flow — задачі 008 та 010.
- Realtime rounds, votes, match state чи room expiration — відповідні задачі 010–016.
- Supabase Auth, custom user accounts або передавання participant credentials через Realtime.
- Загальна event bus abstraction або підтримка Realtime поза потрібним participant flow.

## References / Notes

- Джерела істини: `docs/v0.1.md`, `docs/stack.md`, `docs/database.md`, `lib/db/schema.ts` і `AGENTS.md`.
- Supabase рекомендує Broadcast як безпечніший і масштабованіший спосіб доставки database-driven changes; у цій задачі він навмисно переносить лише invalidation, а не product data: [Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes).
- Public Broadcast допустимий для цього v0.1 invalidation-only каналу без Supabase Auth лише за умови high-entropy topic, non-sensitive payload і server re-fetch. Якщо реалізація вводить private-channel authorization, вона не повинна додавати accounts або послаблювати RLS.
