# 014 — Match screen

## Goal

Перетворити мінімальний matched result на виразний стабільний fullscreen-фінал на TV, у якому обраний фільм є єдиним головним об'єктом, а заголовок, голоси та коротка гумористична фраза завершують історію вибору.

## Dependencies

- [012 — Match calculation](012-match-calculation.md): authoritative selected movie, terminal room/round state і public votes.
- [012.1 — Round result transition](012-1-round-result-animation.md): shared `layoutId` contract і fullscreen destination shell, у який розгортається selected card.
- [009 — Movie seed data](009-movie-seed-data.md) та [010 — Start game and generate round](010-start-game-and-generate-round.md): public poster/title/year/runtime/genre fields, ordered cards та resilient poster fallback.

## Scope / Requirements

### TV fullscreen destination

- Після shared-element transition повністю замінити three-card grid стабільним fullscreen match screen. Не залишати інші дві cards або технічний список усіх результатів головним content після завершення animation.
- Показати великий український heading «Це матч!», selected movie poster, title, release year, runtime, genres, обидва participant votes із display names/roles та одну коротку гумористичну фінальну фразу.
- Побудувати чітку TV information hierarchy: selected poster/title читаються з відстані, metadata не конкурує із заголовком, votes можна зіставити з двома participants, а довга назва/жанри не створюють overflow.
- Використати лише authoritative `selectedMovieId` та public result allowlist. Не переобчислювати match із votes у component, не вибирати card за position/visual state і не додавати client-side fallback winner.
- Poster failure або відсутній poster не руйнує композицію: використати наявний accessible fallback із назвою фільму та зберегти стабільні dimensions, потрібні shared layout transition.

### Final message and stable recovery

- Додати до `next-intl` каталог коротких українських final messages у тоні active specification. Повідомлення не повинно натякати, що match є рейтингом якості фільму або що один participant переміг іншого.
- Вибір повідомлення має бути стабільним для round під час rerenders, reconnect і reload. Дозволено детерміновано індексувати локалізований каталог за round ID; не додавати database field лише заради декоративної фрази.
- Direct load/reload уже matched room відновлює той самий fullscreen result із persisted winner і votes. Допустимий один повторний короткий transition згідно з 012.1, але screen ніколи не повертається до voting або не зависає в animation-only state.
- Stable match screen залишається видимим необмежено довго до наступної authoritative room command. У цій задачі немає auto-close, countdown або автоматичного Search again.

### Phone result and future actions boundary

- Після TV reveal boundary задачі 012.1 обидва телефони показують читабельний compact result: selected movie, власний і чужий розкриті votes та final status. До цього boundary вони лишаються в нейтральному «дивіться на екран» state, щоб phone не зіпсував TV reveal. Fullscreen TV-композиція не повинна примусово дублюватися на вузькому phone viewport.
- Підготувати явний композиційний slot/state boundary, у який задача 015 додасть host-only actions. Не показувати disabled, fake або client-only «Шукати ще»/«Закрити кімнату» до появи авторитетних commands.
- Guest phone пояснює, що фільм обрано; не створювати для guest controls або локальний спосіб змінити room state.

### Accessibility and visual resilience

- Heading, movie section і vote summary мають семантичні labels; status announcement не дублюється під час кожного Realtime refetch.
- Не покладатися лише на green highlight, emoji або poster для пояснення match. Vote values мають текстові accessible names поряд з декоративними emoji.
- Підтримати `prefers-reduced-motion` contract задачі 012.1 та keyboard/screen-reader access для майбутніх controls, не додаючи auto-focus, що перериває announcement.
- Перевірити типові TV viewport sizes, phone widths, довгі українські назви, відсутній poster, максимальну кількість genres і браузерний zoom. Decorative background не погіршує контраст і не перехоплює interaction.

## Acceptance Criteria

- Після match selected card із three-card view завершує transition у fullscreen TV screen, де показаний лише authoritative winner як головний movie і явно написано «Це матч!».
- Screen містить poster/fallback, title, year, runtime, genres, два правильні participant votes та одну стабільну humorous phrase; credentials або server-only receipt data відсутні.
- Winner і final message не змінюються через rerender, duplicate invalidation, reconnect або reload. Direct load matched room відновлює стабільний screen без client-side recalculation.
- Інші дві round cards після transition не залишаються інтерактивними або візуально конкуруючими з winner. Animation overlay не блокує stable content.
- Host і guest phones показують узгоджений compact match result лише після TV reveal hint або його bounded fallback, але ще не виконують Search again/Close room. Guest не отримує host-only action surface.
- Missing/broken poster, довгі values, reduced motion і менший viewport не створюють overflow, unreadable text, layout collapse або залежність від motion/кольору.
- Screen не мутує room, не запускає timer-based next action і залишається стабільним до авторитетної команди задачі 015.
- `pnpm verify`, component/accessibility tests і browser visual smoke test для TV, двох phones, reload та poster fallback проходять.

## Verification

- Component tests: selected movie lookup, exact public vote mapping, stable message selection, compact phone/fullscreen TV variants, poster fallback і відсутність controls.
- Accessibility tests: heading/landmarks, live announcement deduplication, textual vote labels, reduced motion і contrast-oriented manual review.
- Browser visual verification: transition destination на TV, matched direct load, long title/genres, broken poster, common TV/phone viewports, zoom і reconnect.
- Network/state inspection: screen читає лише public snapshot і не виконує mutation або повторне result calculation.

## Out of Scope

- Match calculation, ranking, tie-breaking або selected flag persistence — задача 012.
- Shared-element lifecycle, no-match transition або Motion bundle setup — задача 012.1.
- No-match next-round flow — задача 013.
- Search again, Close room, host command idempotency або closed-room presentation — задача 015.
- Trailers, cast/crew, external ratings, streaming deep links, sound, confetti engine, sharing або download/save actions.

## References / Notes

- Джерела істини: [When there is a match](../docs/v0.1.md#when-there-is-a-match), [Three Cards Mode](../docs/v0.1.md#three-cards-mode), [stack](../docs/stack.md), [012 — Match calculation](012-match-calculation.md), [012.1 — Round result transition](012-1-round-result-animation.md) і `AGENTS.md`.
- Fullscreen result є стабільним destination, а не тимчасовим modal: URL і authoritative matched snapshot не змінюються через presentation transition.
