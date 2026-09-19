# 027 — Audit shared translations and message namespaces

> Draft: identify genuinely shared product messages before moving keys into common namespaces. Equal text is a candidate, not proof of equal meaning.

## Goal

Перевірити український `next-intl` catalog на дубльовані повідомлення й узгодити розміщення справді спільних labels, actions, statuses та feedback messages без втрати контексту конкретних screens.

## Context

Під час task 012 однакові назви ролей `Ведучий` і `Гість` були винесені в `Common.participantRole`. У catalog уже є інші точні повтори та близькі формулювання між TV, join, filters і round flows. Частина з них може мати одну продуктову семантику, але інші повинні залишатися feature-specific, щоб copy можна було змінювати незалежно.

## Scope

### Discovery

- Зібрати exact duplicate values і близькі за змістом messages у всіх namespaces `messages/uk.json`.
- Для кожного кандидата перевірити semantic role, interpolation parameters, tone, screen context і очікувану незалежність майбутніх змін.
- Перевірити shared participant roles, common actions, loading/checking states, storage/conflict feedback, catalog-insufficient та exhausted messages.
- Знайти component call sites для кожного кандидата й визначити, чи спільний namespace спрощує контракт без прихованого coupling.
- Задокументувати рішення: винести в shared namespace, залишити feature-specific або узгодити формулювання окремо.

### Refactoring

- Виносити message у `Common` або інший вузький shared namespace лише коли call sites мають ту саму семантику й однакові parameters.
- Називати shared keys за продуктовою роллю, а не за першим screen, де зʼявився текст.
- Зберегти feature-specific copy окремо, якщо screens можуть обґрунтовано змінювати tone або деталі незалежно.
- Оновити всі `useTranslations`/server translation call sites і видалити лише підтверджені дублікати.
- Не додавати нові locales, locale routing або locale switcher.
- Перевірити rendering, interpolation, namespace typing і відсутність missing-message errors у змінених flows.

## Acceptance Criteria

- Є inventory exact і semantic duplicate candidates з рішенням для кожного.
- Справді спільні messages мають один canonical key та всі релевантні call sites використовують його.
- Feature-specific messages не обʼєднані лише через випадковий збіг поточного тексту.
- Shared keys мають стабільні semantic names і сумісні interpolation parameters.
- TV, join, filters, voting і round-result screens не мають missing-message або fallback regressions.
- Український tone та product meaning збережені; localization scope v0.1 не розширено.
- `pnpm verify` і цільові UI/browser checks проходять.

## Out of Scope

- Додавання другої мови або автоматичного перекладу.
- Повний rewrite продуктового copy чи зміна game flow.
- Винесення схожих, але семантично незалежних messages у catch-all common namespace.

## References

- Source: review of PR #33 for task 012.
- Related task: [023 — audit Tailwind styles and application palette](023-audit-tailwind-styles-and-application-palette.md).
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, and `AGENTS.md`.
