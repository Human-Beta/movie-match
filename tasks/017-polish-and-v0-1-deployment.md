# 017 — Polish and v0.1 deployment

## Goal

Завершити перевірку й точкове полірування вже реалізованого TV + два телефони flow, після чого оформити повний українськомовний v0.1 як production release через наявний release process. Production deployment уже існує; ця задача не створює його вперше.

## Dependencies

- Задачі 001–016, зокрема [016 — Room expiration and cascading cleanup](016-room-expiration-and-cascading-cleanup.md): повний функціональний flow і room lifetime.
- [009.1 — Deploy the task-009 slice to production](009-1-deploy-task-009-slice.md): наявні Supabase/Vercel projects, production secrets і versioned release workflow.
- [Active specification](../docs/v0.1.md), [stack](../docs/stack.md) і [production release guide](../docs/database.md#production-release).

## Scope / Requirements

### Focused product polish

- Пройти повний сценарій на TV і двох окремих phone contexts: create/restore, join/host filters, start, private voting, no-match/next round, match, Search again, exhausted/Restart list, Close room і one-hour expiry.
- Виправити конкретні блокувальні або помітні дефекти, виявлені цим проходом: читабельність трьох екранів, адаптивність phone/TV layouts, доступність labels/keyboard/focus та `prefers-reduced-motion`, loading/error/empty/terminal states і зрозумілість українського product copy. Зміни мають зберігати чинні game rules і server authority.
- Уніфікувати лише явно непослідовні стани й тексти, що заважають завершити flow. Не вводити нові game modes, controls, localization languages або повний візуальний redesign під назвою polish.
- Усі виявлені окремі ідеї та не блокувальні покращення записати до [ideas.md](../docs/ideas.md) або окремого backlog, не розширюючи цей release.

### Release readiness and deployment

- На release candidate виконати `pnpm verify` та релевантні database integration checks. Переконатися, що GitHub `Verify` зелений для exact SHA, який буде розгорнуто, і що всі migrations та security grants відповідають current schema.
- Використовувати наявні production Vercel і Supabase projects, HTTPS URL, secrets та release workflow, створені в 009.1. Не створювати нове production середовище, окремий deployment чи іншу hosting infrastructure.
- Після human review та успішного CI злити готові task PR до `main` з урахуванням dependency order. Перевірити exact verified current `main` SHA у production; якщо він ще не розгорнутий, запустити [production-release.yml](../.github/workflows/production-release.yml) для цього SHA: migrations перед deploy, catalog seed лише за окремої обґрунтованої зміни каталогу. Не вмикати обхідний Vercel auto-deploy.
- Підтвердити у наявному production deployment конфігурацію cleanup з 016, server-only secrets, Supabase Realtime, HTTPS URL і фактичний deployed commit. Не переносити test fixtures, credentials, network captures чи інші disposable artifacts у repository або release notes.
- Пройти основний end-to-end сценарій у production з TV + host + guest, включно з одним no-match continuation і match; перевірити Search again та Close room в окремих matched станах. Окремо перевірити expiry/cleanup і recovery після reload/reconnect. Якщо production smoke виявить regression, виправити її й розгорнути новий перевірений SHA до оголошення релізу.
- Після успішного production smoke позначити завершений v0.1 annotated SemVer tag `v0.1.0` на фактично розгорнутому SHA та створити GitHub Release з короткими user-facing notes і non-secret deployment evidence. Наступний release після вже наявного tag має дотримуватися правил versioning у `AGENTS.md`.

## Acceptance Criteria

- Повний v0.1 flow проходиться від `/tv` до кінцевого match і host decision на реальних TV/phone viewport sizes без блокувального UI дефекту; no-match, exhausted і expiry мають зрозуміле відновлення або terminal presentation.
- Український UI не містить неперекладених product-facing повідомлень; keyboard/focus і reduced-motion не блокують дії чи читання результату.
- `pnpm verify`, релевантні database integration suites і GitHub `Verify` пройшли для exact release SHA; потрібні migrations застосовані до production перед deployment цього SHA, якщо він відрізнявся від уже розгорнутого.
- Наявний production HTTPS deployment показує exact release SHA і проходить three-screen smoke для основних гілок гри, reload/reconnect та room expiration/cleanup; результат задокументований без секретів.
- На deployed SHA є annotated version tag і GitHub Release з описом фактично доступного v0.1; невиконані не блокувальні ідеї винесені з release scope.

## Verification

- Local: `pnpm verify`, наявні focused DB suites проти ізольованої PostgreSQL і перевірка змінених UI states у браузері.
- GitHub: зелений `Verify` на current `main` SHA, успішний production release workflow із порядком `migrate → deploy`, Vercel production status і тотожність commit SHA.
- Production browser: TV + два ізольовані телефони; основний матч, no-match continuation, Search again, exhausted/Restart list, Close room, reload/reconnect, Realtime/fallback і expiry. Перевірити, що vote privacy та host-only controls збережені.
- Release: перевірити annotated tag, GitHub Release notes та посилання на non-secret workflow/deployment evidence.

## Out of Scope

- Нові game mechanics, accounts, recommendation algorithm, additional locales, catalog import, custom domain, analytics або нова hosting infrastructure.
- Загальне розширення automated integration coverage із [018](018-automated-integration-coverage.md) та інші незалежні backlog-аудити 019–029; потрібні для знайденого release blocker тести залишаються в scope відповідного fix.
- Початкове створення production Vercel/Supabase середовища або повторне налаштування production інфраструктури, вже виконаної в 009.1.
- Публічне проголошення релізу до успішного production smoke на exact release SHA.

## References / Notes

- Джерела істини: [active specification](../docs/v0.1.md), [vision](../docs/vision.md), [stack](../docs/stack.md), [database/release workflow](../docs/database.md#production-release), [review workflow](../docs/review.md) і `AGENTS.md`.
- Production уже містить розгорнуту апку й перевірений deployment workflow після 009.1. Ця задача завершує, перевіряє та оформлює повний v0.1 у наявному середовищі; це не перший запуск апки в production і не створення другого hosting stack.
