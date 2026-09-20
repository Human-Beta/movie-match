# 014 — Match screen

## Goal

Завершити stable matched screen на TV, не відмовляючись від Three Cards Mode: зберегти три original movie cards із голосами всередині, залишити authoritative winner головним візуальним акцентом і додати heading, коротку гумористичну фразу та boundary для майбутніх host actions.

## Dependencies

- [012 — Match calculation](012-match-calculation.md): authoritative selected movie, terminal room/round state і public votes.
- [012.1 — Round result transition](012-1-round-result-animation.md): stable three-card result, persistent selected-card emphasis, per-card votes та immediate authoritative phone result.
- [009 — Movie seed data](009-movie-seed-data.md) та [010 — Start game and generate round](010-start-game-and-generate-round.md): public poster/title/year/runtime/genre fields, ordered cards та resilient poster fallback.

## Scope / Requirements

### Stable TV composition

- Зберегти original three-card grid у тій самій order і близькій геометрії, що й під час voting. Не замінювати його single-card fullscreen screen, modal або окремим нижнім panel «Результат раунду».
- Показати український heading «Це матч!» і одну коротку гумористичну фінальну фразу над або поруч із grid, не дублюючи titles, metadata чи votes в окремому result list.
- Persisted selected movie лишається виділеним текстовою міткою, green glow/ring і повною opacity. Інші дві cards лишаються видимими та містять свої votes, але не конкурують із winner.
- Під кожною card зберегти два окремі рядки authoritative votes із display roles. Не переобчислювати match із votes у component, не вибирати card за position/visual state і не додавати client-side fallback winner.
- Poster failure або відсутній poster не руйнує композицію: використати наявний accessible fallback із назвою фільму та стабільними dimensions.

### Final message and stable recovery

- Додати до `next-intl` каталог коротких українських final messages у тоні active specification. Повідомлення не повинно натякати, що match є рейтингом якості фільму або що один participant переміг іншого.
- Вибір повідомлення має бути стабільним для round під час rerenders, reconnect і reload. Дозволено детерміновано індексувати локалізований каталог за round ID; не додавати database field лише заради декоративної фрази.
- Direct load/reload уже matched room відновлює той самий three-card result із persisted winner і votes без повернення до voting або залежності від animation-only state.
- Stable match screen залишається видимим необмежено довго до наступної authoritative room command. У цій задачі немає auto-close, countdown або автоматичного Search again.

### Phone result and future actions boundary

- Обидва телефони відразу після authoritative snapshot resync показують читабельний compact result: selected movie, власний і чужий розкриті votes та final status. TV-композиція не повинна примусово дублюватися на вузькому phone viewport.
- Підготувати явний композиційний slot/state boundary, у який задача 015 додасть host-only actions. Не показувати disabled, fake або client-only «Шукати ще»/«Закрити кімнату» до появи authoritative commands.
- Guest phone пояснює, що фільм обрано; не створювати для guest controls або локальний спосіб змінити room state.

### Accessibility and visual resilience

- Heading, selected label і vote rows мають семантичні labels; status announcement не дублюється під час кожного Realtime refetch.
- Не покладатися лише на green highlight, emoji або poster для пояснення match. Vote values мають текстові accessible names поряд з декоративними emoji.
- Підтримати `prefers-reduced-motion` contract задачі 012.1 та keyboard/screen-reader access для майбутніх controls, не додаючи auto-focus, що перериває announcement.
- Перевірити типові TV viewport sizes, довгі українські назви, відсутній poster, максимальну кількість genres і browser zoom. Layout не створює другого scrollbar, scroll jump або card overflow.

## Acceptance Criteria

- Matched room стабільно показує три original movie cards; лише authoritative winner має persistent label/glow і повну visual emphasis.
- Під кожною card видимі рівно два правильні participant votes. Heading «Це матч!» і одна стабільна humorous phrase доповнюють grid без окремого нижнього result panel.
- Winner і final message не змінюються через rerender, duplicate invalidation, reconnect або reload. Direct load matched room відновлює stable result без client-side recalculation.
- Missing/broken poster, довгі values, reduced motion, менший viewport і zoom не створюють overflow, unreadable text, layout collapse або залежність від motion/кольору.
- Host і guest phones відразу показують узгоджений compact match result, але ще не виконують Search again/Close room. Guest не отримує host-only action surface.
- Screen не мутує room, не запускає timer-based next action і залишається стабільним до authoritative command задачі 015.
- `pnpm verify`, component/accessibility tests і browser visual smoke test для TV, двох phones, reload та poster fallback проходять.

## Verification

- Component tests: ordered three-card rendering, selected movie mapping, exact role/vote mapping, stable message selection, poster fallback, compact phone result і відсутність TV `RoundResult` panel.
- Accessibility tests: heading/landmarks, selected text label, textual vote labels, live announcement deduplication і reduced motion.
- Browser visual verification: усі три possible winner positions, matched direct load, long title/genres, broken poster, common TV/phone viewports, zoom і reconnect.
- Network/state inspection: screen читає лише public snapshot і не виконує mutation або повторне result calculation.

## Out of Scope

- Match calculation, ranking, tie-breaking або selected flag persistence — задача 012.
- CSS match emphasis і no-match reaction — задача 012.1.
- No-match next-round flow — задача 013.
- Search again, Close room, host command idempotency або closed-room presentation — задача 015.
- Single-card fullscreen/shared-layout morph, modal result, trailers, cast/crew, external ratings, sound, confetti engine або sharing.

## References / Notes

- Джерела істини: [When there is a match](../docs/v0.1.md#when-there-is-a-match), [Three Cards Mode](../docs/v0.1.md#three-cards-mode), [stack](../docs/stack.md), [012 — Match calculation](012-match-calculation.md), [012.1 — Round result transition](012-1-round-result-animation.md) і `AGENTS.md`.
- Stable result є продовженням three-card voting screen, а не окремим modal чи single-card destination.
