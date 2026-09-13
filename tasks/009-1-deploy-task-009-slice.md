# 009.1 — Deploy the task-009 slice to production

## Goal

Розгорнути поточний завершений зріз після задачі 009 у production environment, щоб власник продукту міг тестувати реальний TV → телефони → participants → host filters flow через стабільний HTTPS URL.

Це технічний production-like deployment, а не реліз повного v0.1. На момент цієї задачі користувачі ще не можуть почати гру, голосувати або отримати match result: це належить задачам 010–015.

## Dependencies

- Задачі 003–009: Supabase/Drizzle, room lifecycle, participant sessions, Realtime, host filters і seeded catalog.
- Обраний exact commit з `main`, що містить завершену задачу 009, і зелений GitHub `Verify` для нього.
- Доступ власника продукту до окремого Supabase project і Vercel project для цього deployment.

## Scope / Requirements

### Production environment

- Створити або підтвердити окремий Supabase project для цього deployment. Не використовувати local Docker database і не змішувати його з тестовою БД, яку запускають automated suites.
- У Vercel створити або підключити один Next.js project з production deployment від exact verified commit. Достатньо стандартного Vercel HTTPS URL; custom domain не є вимогою цієї задачі.
- Задати environment variables тільки у відповідних production settings, не в git:
  - `DATABASE_URL` — server-only transaction-pooler connection для production runtime;
  - `NEXT_PUBLIC_SUPABASE_URL`;
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Не додавати service-role key, database password, room credentials або Supabase secrets до browser variables, repository, screenshots, Vercel logs чи task notes.
- Виставити Node.js версію, сумісну з `package.json` (`>=24.15.0 <25`), та переконатися, що Vercel production build виконує на exact release commit.

### Database release

- До відкриття URL застосувати всі committed Drizzle migrations до обраної Supabase production database. Перевірити, що RLS і browser-role restrictions залишаються такими, як у committed SQL; browser roles не отримують `INSERT`, `UPDATE` або `DELETE` для product tables.
- Після migrations один раз явно запустити `pnpm db:seed` проти цієї production database. Seed не є частиною build, request або startup; перед запуском перевірити host/database у `DATABASE_URL` без виведення connection string.
- Перевірити, що seeded catalog містить очікувані 119 movie records і коректні genre links. Повторний seed запускати лише за потреби, але він має завершитися без дублікатів.
- Зафіксувати для власника продукту release commit SHA, час deployment, Supabase project identifier без credentials, застосовані migration IDs і результат seed. Не створювати у репозиторії production inventory із секретами.

### Hosted smoke test

- Відкрити production TV URL і принаймні два ізольовані phone contexts через join QR/code. Перевірити створення room, `1/2 → 2/2`, host/guest roles, room restoration після reload і обмеження третього join.
- На host перевірити завантаження жанрів, save/reload усіх існуючих filter controls, а на guest — відсутність host controls. Перевірити, що TV та телефони отримують Realtime participant updates без ручного reload.
- Відкрити browser network tooling для одного реального flow і підтвердити, що product mutations і protected reads йдуть через Next.js server boundary, а не через Supabase Data API. Переконатися, що Broadcast payload не містить participant credential або product row data.
- Перевірити, що production URL чітко показує поточну межу продукту: після збереження фільтрів немає удаваного start/vote/result flow, якого ще не реалізовано.

### Operational boundary

- Перед deployment виконати `pnpm verify` на exact release commit і перевірити зелений GitHub `Verify` для цього самого SHA.
- У разі application-level regression дозволено повернути Vercel на попередній immutable deployment. Не виконувати destructive schema rollback, `TRUNCATE` або видалення production rooms/catalog, бо committed migrations є forward-only.
- Не додавати caching, analytics, feature flags, accounts, адмін-панель, background jobs або іншу продуктову/інфраструктурну scope під виглядом deployment task.

## Acceptance Criteria

- Є один доступний HTTPS production URL, який віддає exact verified commit після задачі 009 і має успішний Vercel production build.
- Production Supabase database містить усі committed migrations і seeded catalog із 119 фільмами; seed не створив дублікатів, а RLS/browser write restrictions збережені.
- `pnpm verify` і GitHub `Verify` пройшли для того самого release SHA, який фактично розгорнуто.
- TV і два ізольовані phone contexts у production проходять create/join/restore/host-filter flow; третій participant не може приєднатися, а guest не отримує host controls.
- Hosted Realtime updates синхронізують participants без ручного reload; network inspection не виявляє browser Supabase Data API mutation або витоку credentials/product rows у Broadcast.
- Документовано лише non-secret release evidence: deployment URL, commit SHA, migration IDs, seed result і час deployment.
- Власник продукту розуміє й може протестувати межі цього slice: rooms, joining, participant sync і filters доступні; game start, rounds, voting і result ще відсутні.

## Verification

- `pnpm verify` і GitHub `Verify` на exact release SHA.
- Vercel production build/deployment status для цього SHA.
- Production database: `migrate → seed`, перевірка 119 movies, genre links, RLS і відсутності browser write grants.
- Real-browser smoke: TV + host + guest, participant Realtime, reload/restoration, third-join rejection, host filter save/reload і guest access boundary.
- Network inspection: Server Action traffic для product operations, non-sensitive Broadcast invalidations, без raw credentials або product rows у payloads.

## Out of Scope

- Задачі 010–018, включно з start game, rounds, voting, match calculation, result UI, cleanup, full polish і broader automated integration coverage.
- Custom domain, email, analytics, error-tracking platform, feature flags, caching, CDN tuning, monitoring platform, backups policy або new infrastructure.
- Внесення secrets до repository чи автоматичне виконання production migrations/seeds під час application startup.

## References / Notes

- Джерела істини: [active specification](../docs/v0.1.md), [stack](../docs/stack.md), [database workflow](../docs/database.md), [database schema](../docs/domain/database-schema.md), [009 — Movie seed data](009-movie-seed-data.md) і `AGENTS.md`.
- У Vercel serverless runtime `DATABASE_URL` має використовувати transaction pooler; repository database guide описує потрібне з'єднання та заборону на browser exposure секретів.
- Після виконання не позначати повний v0.1 як released: задача лише робить доступним для тестування фактично реалізований зріз до filters.
