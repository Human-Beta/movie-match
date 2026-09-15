# 021 — Drizzle metadata strategy

## Goal

Визначити безпечну й підтримувану стратегію для `drizzle/meta/`, щоб історія міграцій залишалася відтворюваною, але repository не накопичував непропорційно великі generated snapshot-файли.

## Context

Drizzle Kit створює повний schema snapshot для кожної migration у `drizzle/meta/`. Кількість і розмір цих JSON-файлів ростуть разом з історією схеми та вже помітно перевищують обсяг handwritten application code. Вони є generated artifacts, проте можуть бути потрібні Drizzle для коректної генерації наступних migration і для відтворюваної роботи команди.

Не видаляти, не стискати, не переносити та не переставляти існуючі metadata або migration-файли до підтвердження сумісної стратегії на ізольованій PostgreSQL.

## Questions to resolve

- Які саме файли з `drizzle/meta/` потрібні поточній версії Drizzle Kit для `db:generate`, а які є лише історичними artifacts?
- Яка офіційно підтримувана практика Drizzle для довгої історії migrations і великих snapshot-файлів?
- Чи є безпечний supported спосіб зробити baseline або squash історії migrations для вже розгорнутих баз без втрати можливості оновлення?
- Чи прийнятні Git LFS, архівування або ignore для цих файлів з огляду на локальну й CI генерацію migrations?
- Який поріг розміру repository або кількості migrations має запускати maintenance workflow?

## Acceptance Criteria

- Задокументовано поточну роль кожного виду файлів у `drizzle/` і результат перевірки з офіційною документацією Drizzle Kit для зафіксованої версії dependency.
- Порівняно щонайменше два supported варіанти: зберігати повну історію як є та створити контрольований baseline/squash; для кожного зафіксовано вплив на local development, CI, нову базу, існуючу production базу й rollback/recovery.
- Обрано один варіант тільки після відтворюваного тесту на ізольованій PostgreSQL: чиста база отримує очікувану схему, а база з попередньою історією безпечно доходить до поточної схеми.
- Якщо обраний варіант змінює workflow, оновлено `docs/database.md`, відповідні scripts та інструкції для майбутніх migrations.
- Якщо безпечного supported скорочення немає, це прямо зафіксовано; metadata лишаються versioned, а задача визначає лише документований maintenance threshold або закривається без code changes.
- Не допускаються зміни, що роблять уже застосовані production migrations неповторюваними або видаляють audit trail без окремого backup і плану відновлення.

## Out of scope

- Зміна предметної схеми, RLS або application behavior.
- Ручне редагування historical migration SQL лише для зменшення розміру repository.
- Застосування експериментальної стратегії без перевірки на чистій та upgrade PostgreSQL базах.
