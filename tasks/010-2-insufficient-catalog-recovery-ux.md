# 010.2 — Insufficient-catalog recovery UX

## Goal

Зробити невдалий start через недостатній каталог передбачуваним: host отримує локальну помилку й може відредагувати фільтри, тоді як room, round, guest і TV не змінюють свого стану.

## Dependencies

- [010.1 — Game-start fixes](010-1-game-start-fixes.md): persisted `catalog_insufficient` / `list_exhausted` distinction.
- [008 — Host filters](008-host-filters.md): saved filter contract and idempotent save flow.

## Reported issues

### 1. Повторний start без зміни фільтрів показує неактуальну помилку

Після terminal `catalog_insufficient` host коротко бачить повідомлення про недостатній каталог, а потім знову форму з активною кнопкою «Почати гру». Повторне натискання без зміни фільтрів отримує `unavailable` і UI показує «Почати гру вже не можна. Перевірте кімнату й сесію ведучого». Це не описує реальну причину: host session і room коректні, а фільтри не змінилися.

Після `catalog_insufficient` UI не повинен пропонувати ще один start із тим самим збереженим набором фільтрів. Host має бачити поточні фільтри та вказівку змінити й зберегти хоча б один фільтр перед наступною спробою. Це обмеження не може бути лише client-side: server-side flow має відрізняти незмінений набір від нового збереженого набору й не маскувати недостатній каталог під authorization/state error. Водночас результат недостатнього каталогу не є новим room state: він повертається лише host, без запису terminal state у кімнату.

### 2. Збереження тих самих фільтрів змінює room state і перемонтовує форму

Після невдалого start збереження фільтрів, які фактично не змінилися, переводить room у `waiting`. Через snapshot sync host-форма зникає, показує «Завантажуємо фільтри…» і монтується заново. Guest і TV водночас переходять до тексту «Усі на місці. Очікуємо, поки ведучий налаштує та почне гру», хоча кандидати й filters не змінилися.

Idempotent save того самого нормалізованого filter contract не повинен змінювати room state або public snapshot. Host-форма не повинна розмонтовуватися чи показувати loading після невдалого start і під час редагування filters. Коли host зберігає інший валідний filter contract, система має дозволити одну нову спробу start. Guest і TV не повинні бачити наслідків невдалого start: вони зберігають свій попередній room presentation, доки успішна спроба не створить round.

### 3. Тимчасовий позитивний feedback суперечить результату start

Після невдалого start host бачить presentation, стилізовану як успішний результат, перед поверненням до форми. Для `catalog_insufficient` потрібен один стабільний локальний UI state з причиною та наступною дією — редагувати filters; не показувати позитивний success feedback, loading flicker або controls, що не можуть успішно завершитися.

### 4. `catalog_insufficient` показується зеленим і зникає під час loading

Після натискання «Почати гру» host на короткий час бачить зелений блок із текстом «За поточними фільтрами в каталозі менше трьох фільмів. Змініть фільтри та спробуйте ще раз». Зелений колір повідомляє про успішну дію, хоча start не створив round. Блок одразу зникає через loading filters, тому користувач не може прочитати або використати інструкцію.

`catalog_insufficient` має використовувати стійкий error/instruction presentation, а не success styling. Він має залишатися видимим разом із поточними filters, доки host не змінить і не збереже новий filter contract або не покине екран. Loading filters не повинен замінювати цей стан після start response, якщо filters не потрібно повторно завантажувати.

## Acceptance Criteria

- Після `catalog_insufficient` host не може надіслати новий start для того самого збереженого filter contract; UI пояснює, що наступна спроба стане доступною після зміни та збереження filters.
- Спроба обійти UI не повертає misleading `unavailable`: server-side flow повертає canonical insufficient-catalog outcome без створення round, partial positions чи зміни room state.
- Host може змінити щонайменше один filter, зберегти валідний новий contract і зробити одну нову idempotent start-спробу без reload. За трьох кандидатів вона створює round; за `0–2` знову повертає локальний `catalog_insufficient` host.
- Невдалий start через `catalog_insufficient` не змінює `rooms.status`, history, public snapshot або дані round.
- Збереження нормалізовано рівних filters після невдалого start не змінює `rooms.status`, history або public snapshot; host-форма не розмонтовується й не показує loading state.
- Guest і TV не бачать `catalog_insufficient` та не переходять до іншого presentation після невдалого start. Вони змінюються лише коли успішна start-спроба створює round або room змінюється з іншої незалежної причини.
- `catalog_insufficient` показується як error/instruction state, а не success feedback. UI не показує водночас недостатній каталог і кнопку або повідомлення, що пропонує повторити start без зміни filters.
- Після terminal `catalog_insufficient` host не бачить зеленого success feedback або transient повідомлення. Блок із причиною та інструкцією залишається доступним без повторного loading filters, доки filters не зміняться.
- Залишаються server-side authorization, expiration, idempotency, room lock і `list_exhausted` restart guarantees задачі 010/010.1.

## Notes

- Перед імплементацією визначити найменший persisted contract, який прив'язує право на нову start-спробу до нормалізованого збереженого filter set і витримує reload, retry та паралельні save/start, не перетворюючи `catalog_insufficient` на room state.
- Додати unit, database integration і browser coverage для однакових/змінених filters, host-local `catalog_insufficient`, незмінних guest/TV snapshots та повторних command request IDs.
