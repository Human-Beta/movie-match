# 023 — Audit Tailwind styles and application palette

> Draft: discover real visual repetition before extracting tokens, components, or custom utilities. The aim is consistency and maintainability, not minimizing the number of characters in `className` strings.

## Goal

Перевірити поточне використання Tailwind CSS у застосунку, зменшити підтверджене дублювання стилів і, якщо це виправдано, визначити компактну семантичну палітру застосунку для спільно вживаних кольорів та станів.

## Context

Застосунок уже використовує Tailwind CSS, а глобальні стилі наразі містять лише базові browser-level правила. У міру появи нових TV та phone screens важливо не накопичити різні близькі значення кольорів, border, surface та interaction states або однакові семантичні елементи з трохи різними utility compositions. Водночас одноразовий Tailwind composition не є проблемою сам по собі й не має перетворюватися на абстракцію без реального reuse.

## Scope

### Discovery

- Зібрати inventory повторюваних кольорів, фонів, borders, текстових стилів, radius, shadows і interactive states у `app/`.
- Перевірити, чи представляють схожі значення одну продуктову семантику: наприклад, page background, surface, primary action, muted text, error, success або focus state.
- Перевірити повторювані semantic UI elements і їхні states, зокрема buttons, form fields, notices, cards та screen shells.
- Для кожного кандидата задокументувати рішення: залишити inline, уніфікувати локально, винести у theme token або винести у вузький shared component.
- Окремо перевірити контрастність і узгодженість focus/disabled/error states на темній палітрі.

### Refactoring

- Додати application palette через підтримуваний Tailwind CSS v4 theme/token mechanism лише для справді cross-cutting значень із кількома доречними call sites.
- Називати shared colors за роллю, а не випадковим відтінком: наприклад, `surface`, `foreground-muted` або `action-primary`, якщо саме ці ролі підтверджені audit.
- Залишати one-off layout та feature-specific utility composition inline.
- Виносити React component лише для семантично однакового UI element з однаковими interaction/accessibility states; не створювати загальний design-system layer лише заради коротших `className`.
- Зберегти чинну UI поведінку, український product copy, responsive layouts і `prefers-reduced-motion` behavior.

## Acceptance Criteria

- Є короткий задокументований inventory перевірених style candidates і рішення для кожного.
- Кольори та interaction states, які використовуються в кількох semantic contexts, мають один узгоджений source of truth; локальні одноразові стилі залишаються локальними.
- Нові theme tokens або shared components мають конкретну роль і щонайменше два доречні call sites.
- Темні screens мають читабельний контраст, а focus, hover, disabled і error states лишаються доступними та послідовними.
- Немає візуальних регресій на TV, join і host flows у supported viewport sizes.
- `pnpm verify` і цільові UI checks проходять.

## Out of Scope

- Повна заміна Tailwind на іншу styling system.
- Побудова універсальної design system або пакета компонентів без реальної потреби.
- Автоматична заміна всіх повторюваних utility strings без семантичного аналізу.
- Зміна product behavior, layout direction або візуальний redesign без окремого рішення.

## References

- Current global styling entry point: `app/globals.css`.
- Related task: [019 — audit and refactor shared application code](019-refactor-shared-participant-access-and-ui-layouts.md).
- Sources of truth: `docs/README.md`, active specification, `docs/stack.md`, and `AGENTS.md`.
