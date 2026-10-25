# Design

## Context

Доступ до редактора дає edit-посилання `/e/<editToken>` (`openspec/specs/presentation-access/spec.md`); у БД лише SHA-256 хеш токена. Сторінка `/e/[token]` уже існує: `loadPresentation("edit", token)` (`src/lib/presentations/load.ts`) з `withDbDeadline`, 404 для невалідного токена, `ServiceUnavailable` при недоступній БД і панель `EditLinks` (перевипуск посилань, «Мої презентації»). Плагіни надають `configSchema`, `defaultConfig`, `migrateConfig`, `Presenter`, `Preview` (`openspec/specs/slide-plugin-contract/spec.md`); `resolveConfig(plugin, raw, storedVersion)` (`src/lib/plugins/config.ts`) уже робить міграцію + валідацію з причинами `invalid_config` | `no_migration` | `newer_version`. Реєстр `plugins/index.ts` поки порожній (`static` і `poll` з'являться в `openspec/changes/add-static-and-poll-slides`). Усі таблиці закриті для `anon`/`authenticated`; доступ лише через серверний код (`openspec/specs/instance-deployment/spec.md`, `drizzle/0001_closed_by_default.sql`). Міграції — лише expand-only, бо preview-деплої працюють з тією самою БД (`drizzle/README.md`). Мотивацію див. `proposal.md` (Why).

## Goals / Non-Goals

**Goals:** редактор, що працює з будь-яким плагіном без спеціального коду; превʼю, ідентичне сцені; жодна правка не губиться при закритті вкладки; повторне використання наявних шарів (`ApiDeps`, `withDbDeadline`, `src/lib/http`, rate limiting, `useHydrated`).

**Non-Goals:** колаборативне редагування, історія версій, undo на сервері, прибирання «осиротілих» зображень окремих слайдів (лише разом з презентацією).

## Decisions

### Адмінка: порівняння

| Варіант | Плюси | Мінуси |
|---|---|---|
| Keystone.js | Потужна CMS, GraphQL, ролі | Окремий Node-сервер, важкий білд, друга схема даних; погано вписується в Vercel serverless; редактор слайдів однаково довелося б писати вручну |
| AdminJS | CRUD з коробки | Express/Fastify-адаптери, на Vercel тільки з обхідними рішеннями; візуальний редактор лише через кастомні компоненти |
| **Власна в Next.js** ✅ | Один деплой, без акаунтів (edit-токени), форми генеруються з zod-схем плагінів, live-превʼю тими самими компонентами | Більше власного UI-коду |

Обрано власну адмінку в Next.js.

### Модель даних

Наявне (міграція `0002_presentation_access.sql`, не змінюється): `presentations.theme jsonb DEFAULT '{"preset":"light"}'`, `presentations.locale text DEFAULT 'auto'`, `title`, `updated_at`. Редактор лише оновлює ці колонки.

Нове — таблиця `slides` (Drizzle-схема `src/lib/db/schema/slides.ts` з `.enableRLS()`, міграція `pnpm db:generate --name slides`):

```
slides
  id               uuid pk default gen_random_uuid()
  presentation_id  uuid not null fk → presentations(id) on delete cascade
  position         int  not null          -- щільна нумерація 0..n−1
  plugin_id        text not null          -- 'poll'
  plugin_version   int  not null          -- версія плагіна, якою записано config
  config           jsonb not null         -- валідується configSchema плагіна
  created_at, updated_at timestamptz not null default now()
  index slides_presentation_position_idx (presentation_id, position)
```

Міграція лише додає таблицю й індекс (expand-only). Унікального обмеження на `(presentation_id, position)` **немає**: drizzle-kit не генерує `DEFERRABLE`, а недеферовуване обмеження ламає перенумерацію посеред транзакції. Послідовність позицій гарантує сервіс: кожна мутація списку (додавання, дублювання, видалення, перестановка) виконується в транзакції, що спершу блокує рядок презентації (`SELECT … FROM presentations WHERE id = $1 FOR UPDATE`), а потім перенумеровує позиції. Транзакції працюють і через Supavisor transaction mode (одна транзакція = одне з'єднання). Інтеграційний тест перевіряє інваріант 0..n−1 після паралельних мутацій.

Захисні ліміти (Supabase Free 500 МБ): не більше 200 слайдів у презентації, `config` не більше 64 КБ у JSON (перевищення → 400 `validation_failed`).

### Шар сервера (за наявним патерном)

- `src/lib/slides/service.ts` — порт `SlideRepo` і чиста логіка (додавання після вибраного, дублювання, перестановка як повна перестановка поточних id, валідація конфігу через `resolveConfig`).
- `src/lib/slides/repo.ts` — Drizzle-реалізація з транзакціями й блокуванням презентації.
- `src/lib/presentations/service.ts` + `repo.ts` — новий метод `PresentationRepo.updateSettings(editHash, patch)`: один `UPDATE … WHERE edit_token_hash = $hash RETURNING`, також `touch` `updated_at` при змінах слайдів.
- `src/lib/slides/api.ts`, `src/lib/media/api.ts` — обробники `handle*(request, deps)` у стилі `src/lib/presentations/api.ts`: `try` → `deps.getEnv()` → `bearerToken` → `deps.runDb(…)` (дедлайн `withDbDeadline`) → `errorResponse` для неочікуваних помилок (503 `service_unavailable` / 500 `internal_error`, без деталей).
- `ApiDeps` (`src/lib/http/deps.ts`, `default-deps.ts`) отримує `slides(): SlideRepo`, `media(): MediaStore` і `registry(): PluginRegistry`. Реєстр ін'єктується, тож unit- та інтеграційні тести обробників працюють з фікстурними плагінами.
- Нові коди в `ApiErrorCode` і `uiErrorFromResponse`: `payload_too_large` (413), `unsupported_media_type` (415), `unknown_plugin` (400), `conflict` (409, перестановка зі застарілим списком id), `slide_locked` (409, запис слайда `newer_version`).

### API редактора

Усі маршрути — під `/api/presentations/…`, тож заголовки гігієни секретних маршрутів із `next.config.ts` (`SECRET_ROUTES` містить `/api/presentations/:path*`) застосовуються без змін. Edit-токен — лише в `Authorization: Bearer` (як у `/api/presentations/reissue`), що одночасно знімає CSRF: браузер не додає заголовок сам. Невалідний, відкликаний, некоректний за форматом або present-токен → однаковий 404 `not_found` (некоректний формат — без запиту до БД, `isTokenFormat`). Слайд іншої презентації → той самий 404.

| Метод і шлях | Тіло | Відповідь |
|---|---|---|
| `PATCH /api/presentations/settings` | `{ title?, theme?, locale? }` | оновлена презентація |
| `POST /api/presentations/slides` | `{ pluginId, afterSlideId? }` | створений слайд + нові позиції |
| `PUT /api/presentations/slides/{id}` | `{ config }` (повний конфіг) | `{ id, pluginVersion, updatedAt }` |
| `POST /api/presentations/slides/{id}/duplicate` | — | копія + нові позиції |
| `DELETE /api/presentations/slides/{id}` | — | 204 |
| `PUT /api/presentations/slides/order` | `{ ids: string[] }` | 204; 409 `conflict`, якщо `ids` не є перестановкою поточних |
| `POST /api/presentations/media` | `multipart/form-data` (`file`) | `{ url }` |

Валідація налаштувань (zod, спільна для клієнта й сервера, `src/lib/presentations/settings.ts`): `title` — 1–120 символів після обрізання (порожня назва в редакторі — помилка поля, а не підстановка «Нова презентація», як при створенні); `theme` — `{ preset: 'light'|'dark'|'bright', accent?: '#RRGGBB', logoUrl?: string | null }` (формат з `openspec/changes/add-themes-and-presenter-controls/design.md`), `logoUrl` — лише URL медіа цієї презентації; `locale` — `'uk' | 'en' | 'auto'`.

Початкові дані сторінка `/e/[token]` читає на сервері (той самий `loadPresentation` + слайди в межах одного `withDbDeadline`) і передає клієнтському редактору серіалізовані слайди; окремого `GET` API немає.

### Конфіг слайда: міграція і «зламані» слайди

Сторінка для кожного слайда викликає `resolveConfig(plugin, config, plugin_version)`:

- `ok` → редактор отримує конфіг; якщо `plugin_version` < `plugin.version`, клієнт одразу ставить слайд у чергу автозбереження, і `PUT` записує мігрований конфіг з поточною версією.
- `plugin_id` немає в реєстрі (плагін прибрали з форку) → у списку картка «Невідомий тип слайда», дані не змінюються; дозволено лише видалення й перестановку.
- `invalid_config` / `no_migration` → картка з помилкою; форма відкривається з `defaultConfig` лише після явної дії «Скинути до типових налаштувань».
- `newer_version` (запис preview-деплоєм з новішою версією плагіна) → слайд лише для читання, `PUT` повертає 409 `slide_locked`, щоб старіший код не затер новіші дані.

`PUT` на сервері завжди валідує конфіг поточною `configSchema` плагіна слайда і пише `plugin_version = plugin.version`; `pluginId` слайда змінити не можна.

### Форма з zod-схеми

Генератор (`src/lib/forms/`) не лізе у внутрішні структури zod: він отримує JSON Schema через `z.toJSONSchema(configSchema, { io: "output", unrepresentable: "any" })` (zod 4) і будує поля з неї. Вихідний тип, бо форма редагує вже розібраний конфіг, а непредставні конструкції (`transform`, `z.date()`) стають порожніми вузлами, які генератор відхиляє з назвою поля:

| JSON Schema | Поле |
|---|---|
| `string` (`maxLength`) | текстове поле з лічильником |
| `string` + `meta.widget = "markdown"` | textarea |
| `string` + `meta.widget = "image"` | завантаження зображення (`slide-media`), значення — URL |
| `string` + `meta.widget = "color"` | вибір кольору |
| `integer`/`number` (`minimum`/`maximum`) | числове поле з межами |
| `boolean` | перемикач |
| `enum` | select (≤ 4 варіанти — radio) |
| `array` (`minItems`/`maxItems`) | список з додаванням/видаленням у межах довжини |
| `object` | група полів |
| `anyOf` з `null` (`.nullable()`) | перемикач «без значення» + поле |

Конвенція для авторів плагінів (документується в `plugins/README.md`): підпис поля — `.meta({ label: "<i18n-ключ>" })` (текст із `i18n` плагіна, локаль редактора поки `uk`; без ключа — назва поля), спецвіджети — `.meta({ widget: "markdown" | "image" | "color" })`. Значення форми валідується тією самою `configSchema` (`safeParse`) на кожну зміну; помилки `issues` показуються біля полів за `path`. Якщо схема містить конструкцію, яку генератор не вміє показати (наприклад, `transform`, `union` без `null`, `record`), unit-тест «усі плагіни реєстру мають підтримувану схему» падає — це ловить проблему в CI, а не в редакторі. Альтернатива — ручні форми для кожного плагіна — відхилена: ламає розширюваність.

### Превʼю

Центр показує `Presenter` плагіна в кадрі 16:9 (той самий контейнер, що й на сцені, масштабується CSS-трансформом) з пропсами `config` (поточне значення форми, навіть невалідне — тоді показується останнє валідне) і `state = toPublic(init(config, previewCtx))`, де `previewCtx` — фіксований `ServerCtx` без учасників (`now` = час відкриття, детермінований `random`). `controls.dispatch` — no-op, кадр має `inert`, тож кнопки доповідача в превʼю не працюють. Рендер обгорнуто error boundary: виняток плагіна показує «Превʼю недоступне», а не ламає редактор.

Це обчислення виконується **в браузері**, а контракт (`slide-plugin-contract`, «Серверна частина плагіна») вимагав виконувати серверні функції лише в API routes. Рішення — уточнити вимогу (delta `specs/slide-plugin-contract`): `init`/`toPublic` MAY виконуватися на клієнті лише для превʼю редактора, над конфігом самого автора, з фіктивним `ctx`, без сесії й без збереження результату; `handleAction`, `tick`, `toPlayer`, `scores` та стан будь-якої сесії — лише на сервері. Це безпечно: конфіг (включно з правильними відповідями) автор і так бачить у формі, а «секрет», який `init` згенерує в превʼю (наприклад, задумане число), випадковий і ніде не використовується. Плагіни вже потрапляють у клієнтський бандл (`AudienceSlot` отримує весь об'єкт плагіна), тож нового розкриття коду немає.

Альтернативи: (а) серверний ендпоінт превʼю з debounce — порушує «оновлюється одразу» і додає навантаження на функції; (б) новий обов'язковий метод контракту `previewState(config)` — змушує кожен плагін дублювати логіку `init`/`toPublic`. Мініатюри в списку — `Preview`, якщо плагін його має, інакше той самий `Presenter` у зменшеному кадрі.

### Автозбереження

- Зміни форми зберігаються з debounce ~800 мс; для кожного слайда — черга з одним запитом у дорозі: наступний `PUT` відправляє останній знімок після завершення попереднього. Так старіший запит не може перезаписати новіший на сервері (сам «останній за `updated_at`» цього не гарантує, бо порядок приходу запитів не визначений).
- На `visibilitychange` → `hidden` і `pagehide` невідправлені зміни відправляються одразу через `fetch(…, { keepalive: true })`. `navigator.sendBeacon` не підходить: не передає заголовок `Authorization`. Ліміт тіла keepalive-запиту (64 КБ) збігається з лімітом `config`.
- Індикатор «Зберігається… / Збережено / Помилка збереження». Мережева помилка або 5xx → повтор з експоненційною затримкою (1, 2, 4 … 30 с) без втрати введених даних; 4xx (крім 429) → помилка біля поля/слайда без повтору; 429 → повтор після `Retry-After`. `beforeunload` попереджає про вихід лише в стані «Помилка збереження» (коли зміни не дійшли до сервера й повторюються); звичайні відкладені зміни відправляє `pagehide` без діалогу.
- Невалідний конфіг не відправляється; поле показує помилку.
- Налаштування презентації зберігаються так само (окрема черга). Після збереження назви вона оновлюється в «Моїх презентаціях» (`upsertMyPresentation`).

### Порядок, дублювання, видалення

Drag & drop — `@dnd-kit/core` + `@dnd-kit/sortable` (працюють з React 19, мають клавіатурний сенсор). Поруч — кнопки «Вгору»/«Вниз» у меню слайда: доступність і стабільні e2e-тести. Оптимістичне оновлення списку; при 409 `conflict` клієнт перезавантажує список з сервера (`router.refresh()`). Видалення — через власний діалог підтвердження в UI (не `window.confirm`): без серверного «кошика» і з передбачуваною поведінкою в e2e.

### Гідратація

Як у `EditLinks`: усі елементи керування редактора (додати, дублювати, видалити, перетягування, поля форми, завантаження, налаштування) лежать у `fieldset disabled={!hydrated}` з `aria-busy` (`useHydrated`). До гідратації сторінка вже показує список слайдів і назву (SSR), але клік нічого не зробить, тож контроли неактивні. E2E-тести чекають, доки контроли стануть активними.

### Розкладка і порожній реєстр

Три колонки на ширині ≥ 1024 px (список | превʼю | форма), на вужчих екранах — вкладки «Слайди / Превʼю / Налаштування». Налаштування презентації й панель «Посилання» (наявний `EditLinks`, перенесений у діалог) відкриваються з верхньої панелі. Поки реєстр порожній (production до `add-static-and-poll-slides`), меню «Додати слайд» показує «Типи слайдів ще не встановлено», а редактор працює для налаштувань і посилань.

### Тестовий плагін для перевірки редактора

Реєстр порожній, а `static`/`poll` з'являться лише в `add-static-and-poll-slides`, яка сама залежить від редактора (форма, `slide-media`) і від `add-live-sessions`. Чекати на неї означало б лишити цю зміну без перевірки ключових сценаріїв (додавання, форма, превʼю, автозбереження, перестановка). Тому:

- **Unit/integration:** наявні фікстури `tests/unit/plugin-fixtures.ts` (`counterPlugin`, `guessPlugin` з міграцією v1 → v2) плюс новий `editorSamplePlugin` (`tests/fixtures/plugins/editor-sample.tsx`), схема якого покриває всі віджети форми (рядок, markdown, число з межами, boolean, enum, масив з межами, nullable, image, color). Реєстр ін'єктується через `ApiDeps.registry()`.
- **E2E:** production-збірку не можна «ін'єктувати», тож тестова збірка Playwright (`next build` у `playwright.config.ts`) виконується з `HOVIR_TEST_PLUGINS=1`. Тоді `next.config.ts` задає `turbopack.resolveAlias` для `@plugins/index` → `tests/fixtures/plugins/index.ts` (реальні плагіни + `editorSamplePlugin`). Звичайний `pnpm build` (Vercel) прапорця не має, тож фікстура не потрапляє в production-бандл. Альтернатива з runtime-прапорцем `NEXT_PUBLIC_*` у `plugins/index.ts` відхилена: статичний імпорт фікстури лишився б у production-бандлі, а власник інстансу міг би випадково увімкнути тестовий тип слайда. Якщо `resolveAlias` не перекриває tsconfig-псевдонім `@plugins/*`, запасний варіант — псевдонім на рівні відносного шляху в `src/lib/plugins/registry.ts` (перевіряється задачею).

Коли `static`/`poll` з'являться, `add-static-and-poll-slides` додасть власні e2e-сценарії; фікстура лишається для перевірки генератора форм.

### Медіа

- **Bucket** `slide-media` створюється SQL-міграцією (`pnpm db:generate --custom --name slide_media_bucket`), а не окремим скриптом: міграції вже застосовуються автоматично в кожному білді (`scripts/migrate.ts`), тож інстанс лишається zero-config, а dev-проєкт отримує bucket тим самим `pnpm db:migrate` з `.env.local`. Міграція за зразком `0001`: блок `DO $$ … IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage')` (на «чистому» Postgres і в smoke-збірці без БД нічого не робить), `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) … ON CONFLICT (id) DO UPDATE` — публічне читання, 4 МБ, `image/png`, `image/jpeg`, `image/webp`, `image/gif`. Політик на `storage.objects` для `anon`/`authenticated` не створюємо: RLS там увімкнено Supabase, тож без політик запис, оновлення, видалення й перелік файлів з anon-ключем заборонені; service role їх обходить. Публічне читання працює за URL `…/storage/v1/object/public/slide-media/<path>`.
  Припущення, яке не можна перевірити читанням коду: роль міграцій (`postgres`) має право `INSERT` у `storage.buckets` на Supabase-проєкті. Перша задача розділу медіа перевіряє це на dev-проєкті. Запасний варіант, якщо прав немає: крок у `scripts/migrate.ts` після міграцій створює bucket через Storage API (`createBucket` з service role, ідемпотентно).
- **Завантаження** — через Route Handler `POST /api/presentations/media` з edit-токеном. Ліміт **4 МБ** (а не 5 МБ, як було в чорновику): Vercel Functions приймають тіло запиту до 4,5 МБ, тож 5 МБ через функцію недосяжні. Перевірки на сервері: `Content-Length` > ліміту → 413 до читання тіла; тип за сигнатурою файлу (magic bytes PNG/JPEG/WebP/GIF), а не за розширенням чи заголовком клієнта → інакше 415 (SVG відхиляється, бо скрипти в SVG — XSS). Шлях `<presentationId>/<uuid>.<ext>`, `upsert: false`, `contentType` з визначеного типу. Виклик Storage обгорнуто дедлайном (як `withDbDeadline`), помилка Storage → 503.
  Альтернатива — серверний `createSignedUploadUrl` і пряме завантаження з браузера: дозволяє 5 МБ, але тип файлу тоді перевіряє лише Storage за заголовком клієнта, без перевірки сигнатури. Відхилено заради простоти й суворішої перевірки.
- **Ліміт частоти** (новий бакет `upload` у `LIMITS`, `src/lib/rate-limit/policy.ts`): 30 завантажень за ковзні 10 хвилин на клієнта. Захищає 1 ГБ Storage Free від зловживання, якщо edit-посилання «втекло». Автозбереження конфігів не лімітуємо: кожен запит — запис одного рядка з наявним токеном, а лімітер додав би запит до БД на кожне автозбереження.
- **URL у конфігах:** сервер (а не плагін — плагін не знає адреси Storage) при `PUT` слайда перевіряє всі значення полів з `meta.widget = "image"` і `theme.logoUrl`: вони MUST починатися з публічного префікса `slide-media/<presentationId>/` цього інстансу. Інакше слухачі завантажували б сторонні зображення, і їхні IP бачив би чужий сервер (принцип «без персональних даних»).
- **Видалення:** `handleAdminDelete` спершу видаляє всі об'єкти з префіксом `<presentationId>/` через Storage API (`list` + `remove`, сторінками), потім рядок презентації (слайди — каскадом). Помилка Storage → 503, презентація лишається, і власник може повторити видалення. Пряме `DELETE FROM storage.objects` не використовуємо: Supabase забороняє його тригером.
- **CSP:** `add-quality-gates` додасть CSP; `img-src` має містити домен Supabase-проєкту (`NEXT_PUBLIC_SUPABASE_URL`). Зазначено в задачі документації.

### Тестова інфраструктура

- Unit (`pnpm test`): генератор форм, сервіси слайдів/налаштувань/медіа на фейках `ApiDeps`, обробники API з ін'єктованим реєстром фікстур, сигнатури файлів, черга автозбереження (fake timers).
- Integration (`pnpm test:integration`, dev-база з `.env.local`): `slides` репозиторій (транзакції, позиції під паралельними мутаціями, каскад), RLS (anon-ключ через `@supabase/supabase-js` не бачить `slides`), Storage (завантаження/читання/видалення в dev-bucket, anon-запис відхиляється).
- E2E (`pnpm test:e2e`, проєкти `db-open`/`db-protected` з `.env.local`): редактор з `editorSamplePlugin`.
- Прибирання: `cleanupTestData` (`tests/integration/db.ts`) і `e2e/db/fixtures.ts` видаляють презентації з префіксом `[test]` — слайди йдуть каскадом, а Storage — ні. Тому прибирання спершу видаляє об'єкти `<id>/` для цих презентацій через service role.

## Risks / Trade-offs

- [Ліміт Supabase Free 1 ГБ Storage] → 4 МБ на файл, ліміт 30 завантажень/10 хв, видалення файлів разом з презентацією. Зображення, замінені в слайдах, лишаються до видалення презентації (прибирання «осиротілих» файлів — поза обсягом).
- [Публічні URL зображень] → шляхи з UUID; у зображеннях слайдів немає персональних даних; список файлів anon-ключем недоступний.
- [Редагування під час живої сесії] → сесія працює з копією слайдів на момент старту (`slides_snapshot`, `add-live-sessions`), тож правки не ламають живу сесію.
- [Превʼю виконує `init`/`toPublic` у браузері] → дозволено лише для превʼю (delta `slide-plugin-contract`); стан сесій і `handleAction` лишаються на сервері.
- [Дві вкладки редактора однієї презентації] → останній запис виграє на рівні слайда; перестановка зі застарілим списком отримує 409 і перезавантажує список. Колаборативне редагування — Non-Goal.
- [Привілеї ролі міграцій у схемі `storage`] → перевірка на dev-проєкті першою задачею медіа; запасний шлях через Storage API в `scripts/migrate.ts`.
- [Тестовий плагін у збірці] → лише при `HOVIR_TEST_PLUGINS=1` у збірці Playwright; задача перевіряє відсутність фікстури в production-бандлі.
