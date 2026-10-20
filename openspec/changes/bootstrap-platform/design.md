# Design

## Context

Репозиторій порожній: є лише документація вимог і конфігурація OpenSpec. Мотивацію описано в `proposal.md` (розділ Why), вимоги — у `specs/instance-deployment`, `specs/runtime-config`, `specs/instance-health`.

Обмеження, що визначають підхід:

- **Деплой кнопкою без ручних кроків.** Під час білда на Vercel доступні лише змінні, які поставила інтеграція Supabase з Vercel Marketplace. Немає Supabase CLI-логіну, `supabase link`, access token чи окремого пароля БД.
- **Змінні інтеграції Supabase** (за документацією Vercel Marketplace): `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `POSTGRES_URL` — це Supavisor у transaction mode, де prepared statements не працюють. `POSTGRES_URL_NON_POOLING` після IPv4-міграції Supabase — Supavisor у **session mode**, а не пряме підключення. Цього достатньо для DDL і advisory locks.
- **Vercel Functions — serverless.** Немає фонових процесів, кожен інстанс функції відкриває власні з'єднання. Hobby має ліміти на тривалість функцій.
- **Supabase Free засинає** після 7 днів неактивності (відкрите питання 1 у `openspec/config.yaml`). Тоді хост приймає або відхиляє з'єднання, але Postgres не відповідає, а конкретний HTTP-статус API для призупиненого проєкту не задокументовано.

## Довідка: сценарій деплою інстансу

1. Користувач натискає «Deploy to Vercel» у README.
2. Vercel клонує репозиторій і пропонує підключити **Supabase через Vercel Marketplace**: env-змінні підставляються автоматично. Додатково можна задати `INSTANCE_PASSWORD`, `DEFAULT_LOCALE` і `RESULTS_RETENTION_DAYS`.
3. Під час білда або першого запиту автоматично застосовуються міграції БД (Postgres-схема, RLS-політики, bucket у Storage). Обрано варіант «під час білда» (D3); bucket у Storage додає зміна `add-presentation-editor`.
4. Користувач відкриває головну сторінку, де бачить кнопку «Створити презентацію» (зміна `add-presentation-access`) і поле «Ввести код сесії» (зміна `add-live-sessions`).

«Публікація»: один інстанс — це один Vercel-проєкт; «Опублікувати» = розгорнути інстанс кнопкою. Власний домен налаштовується стандартно через Vercel. Окремих Vercel-проєктів на кожну презентацію немає (маршрути — у `openspec/changes/add-presentation-access`).

## Довідка: env-змінні інстансу

| Змінна | Обов'язкова | Опис |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL` | так (ставить інтеграція) | Підключення до Supabase |
| `POSTGRES_URL_NON_POOLING` | ні (ставить інтеграція) | Підключення для міграцій; без неї використовується `POSTGRES_URL` |
| `INSTANCE_PASSWORD` | ні | Пароль на створення презентацій + майстер-доступ (`add-presentation-access`) |
| `DEFAULT_LOCALE` | ні (`uk`) | Мова за замовчуванням (`add-i18n`) |
| `RESULTS_RETENTION_DAYS` | ні (90) | Автовидалення завершених сесій (`add-session-history-and-export`) |

## Довідка: сплячий Supabase Free

Безкоштовний проєкт Supabase призупиняється після 7 днів неактивності. Щоб перед івентом інстанс «прокинувся», розглядались варіанти: (1) перевірка стану на головній сторінці з інструкцією «відновіть проєкт у дашборді Supabase»; (2) Vercel Cron-пінг раз на добу (чи вважається це активністю за правилами Supabase — перевірити); (3) пункт у чек-листі доповідача «відкрити present-посилання за день до виступу». Ця зміна реалізує (1) через `/health` і банер на головній та (3) як чек-лист у README («відкрити `/health` за день до виступу»). (2) відкладено (див. Open Questions).

## Goals / Non-Goals

**Goals:**
- Структура проєкту, яку наступні зміни (токени, контракт плагінів, редактор, сесії) розширюють без перебудови.
- Єдиний механізм міграцій, який однаково працює в білді Vercel і локально та підтримує довільний SQL (RLS, гранти, Storage, Realtime-політики в майбутніх змінах).
- Діагностика стану, яка ніколи не «висить» і нічого не розкриває.
- Тести, що проходять без живого Supabase: на свіжому клоні й у майбутньому CI.

**Non-Goals:**
- Таблиці домену (`presentations`, `slides`, `sessions`, `participants`, `slide_states`, `scores`, `session_events`), RLS-політики для них, Storage-bucket, Realtime-авторизація. Їх додасть та зміна, якій вони потрібні.
- Vercel Cron для «будіння» Supabase. Не перевірено, чи Supabase зараховує такий пінг як активність (відкрите питання 1 у `openspec/config.yaml`). До перевірки покладаємося на `/health`, банер і чек-лист у README.
- CI-пайплайн (GitHub Actions), CSP-заголовки, i18n, rate limiting.
- pnpm workspaces і окремі пакети.

## Decisions

### D1. Один Next.js-пакет у корені з папкою `plugins/`

```
/
├─ src/
│  ├─ app/                 # App Router: layout, page (заглушка + банер), health/, api/health/
│  └─ lib/
│     ├─ env/              # schema.ts (чисті zod-схеми), server.ts (server-only), client.ts
│     ├─ db/               # client.ts (Drizzle runtime), schema/ (Drizzle-таблиці)
│     ├─ supabase/         # server.ts (service role, server-only), browser.ts (anon)
│     └─ health/           # checks.ts (перевірки + класифікація), types.ts
├─ plugins/
│  ├─ index.ts             # порожній реєстр: export const plugins = [] (тип уточнить зміна «контракт плагінів»)
│  └─ README.md            # куди й як додаються плагіни (посилання на openspec/changes/add-slide-plugin-system)
├─ drizzle/                # згенеровані SQL-міграції + meta/_journal.json
├─ scripts/migrate.ts      # застосування міграцій (білд і локально)
├─ tests/unit/             # Vitest
├─ e2e/                    # Playwright
├─ drizzle.config.ts, vitest.config.ts, playwright.config.ts, .env.example
```

- Псевдоніми TS: `@/*` → `src/*`, `@plugins/*` → `plugins/*`.
- **Чому не pnpm workspaces:** Розміщення плагінів передбачає один файл-реєстр `plugins/index.ts` (масив плагінів), який застосунок імпортує напряму. «Монорепо» тут означає один репозиторій із плагінами всередині. Окремі пакети ускладнили б кнопку деплою (Root Directory, транспіляція workspace-пакетів), а користі для MVP не дали б. Винесення в npm-пакети заплановане на «подальші етапи» і не залежить від цього рішення, бо межа проходить по контракту, а не по структурі папок.
- `src/` відокремлює код застосунку від `plugins/`, `drizzle/` і конфігів у корені.

### D2. Drizzle ORM + SQL-міграції з drizzle-kit, а не Supabase CLI-міграції

**Рішення:** схема описується в TypeScript (`src/lib/db/schema/`). `drizzle-kit generate` створює SQL-файли в `drizzle/`, вони комітяться й переглядаються в PR. SQL без TS-відповідника (гранти, RLS-політики, Storage, `realtime.messages`) пишеться як custom-міграція (`drizzle-kit generate --custom`). Застосовує міграції власний скрипт через `drizzle-orm/postgres-js/migrator`.

**Альтернативи:**
- *Supabase CLI (`supabase/migrations` + `supabase db push`).* Потрібні `SUPABASE_ACCESS_TOKEN` і `supabase link` або пароль БД з project ref. Інтеграція з Vercel Marketplace їх не дає, тож це суперечить zero-config. Автозастосування через Supabase GitHub-інтеграцію потребує окремого ручного підключення в дашборді Supabase. До того ж CLI не дає типізованих запитів.
- *Чистий SQL + власний раннер.* Працює, але без типізованих запитів. Журнал застосованих міграцій, контрольні суми й генерацію DDL довелося б писати самим.
- *Prisma.* Важчий рушій, окремий генератор клієнта в білді, гірша робота з transaction pooler і з довільним SQL для RLS.

**Чому Drizzle:** один інструмент дає і типізовані запити для серверного коду (сесії, слайди, стани), і SQL-міграції, що читаються як звичайний SQL. Міграції застосовуються з Node-скрипта лише за рядком підключення, а custom SQL підтримується повноцінно. Як драйвер використовуємо `postgres` (postgres.js): він легкий, підтримує `prepare: false` для transaction pooler і працює в Node runtime Vercel.

### D3. Міграції застосовуються в білді, а не на першому запиті

**Рішення:** `"build": "tsx scripts/migrate.ts && next build"`. Скрипт робить таке:
1. Локально підвантажує `.env.local`, якщо він є (скрипт запускається як `tsx --env-file-if-exists=.env.local` або через `process.loadEnvFile` у try/catch; на Vercel файлу немає). Потім бере рядок підключення: спершу `POSTGRES_URL_NON_POOLING`, інакше `POSTGRES_URL`. Тут використовується «сирий» `process.env`, а не схема застосунку: міграціям потрібен лише URL БД, і білд не повинен падати через відсутній, наприклад, anon-ключ.
2. Якщо URL немає: при `VERCEL=1` завершується з кодом 1 і підказкою підключити Supabase через Marketplace, інакше пише попередження й виходить з кодом 0.
3. Відкриває одне з'єднання (`max: 1`, `prepare: false`, `connect_timeout` ≈ 10 с), бере `pg_advisory_lock(<константа>)`, виконує `migrate(db, { migrationsFolder: 'drizzle' })`, знімає лок і закриває з'єднання.
4. Помилки логуються без рядка підключення (маскуються пароль і хост), а процес завершується з кодом 1.

**Чому не на першому запиті:** Сценарій деплою допускає обидва варіанти («під час білда або першого запиту»). Варіант «у білді» кращий, бо (а) нова версія коду ніколи не обслуговує запити зі старою схемою; (б) помилка міграції зупиняє деплой, а попередня версія лишається активною, і Vercel не перемикає трафік; (в) запити не отримують додаткової затримки й гонок між холодними стартами. Мінус: якщо Supabase призупинено, деплой падає. Але для «сплячого» проєкту це правильна поведінка: проблему видно одразу в лозі білда з тією ж інструкцією «відновіть проєкт», що й на `/health`.

**Advisory lock** серіалізує одночасні білди (production і preview на одній БД). Журнал Drizzle (`drizzle.__drizzle_migrations`) робить повторний запуск безпечним.

### D4. Підключення під час виконання

- **Drizzle runtime** (`src/lib/db/client.ts`, `server-only`) — лінивий синглтон на `POSTGRES_URL` (transaction pooler, `prepare: false`, `max: 1` на інстанс функції, короткий `idle_timeout`). Transaction pooler — рекомендований режим для serverless: він не вичерпує ліміт з'єднань Supabase Free.
- **Supabase server client** (`src/lib/supabase/server.ts`, `server-only`): `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`. Знадобиться пізніше для Broadcast і Storage.
- **Supabase browser client** (`src/lib/supabase/browser.ts`): синглтон з anon-ключем лише для майбутньої підписки на Realtime на читання.
- `@supabase/ssr` не потрібен: Supabase Auth не використовується, бо акаунтів немає (доступ дають лише секретні edit/present-посилання).

### D5. Базова схема: «закрито за замовчуванням» + `instance_meta`

Міграція `0000` (згенерована + custom-частина):
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES|SEQUENCES|FUNCTIONS FROM anon, authenticated`. Це знімає типові гранти Supabase для всіх майбутніх об'єктів, створених роллю міграцій. Плюс `REVOKE ALL ON ALL TABLES|SEQUENCES IN SCHEMA public FROM anon, authenticated` для наявних об'єктів.
- Таблиця `instance_meta(id smallint PK CHECK (id = 1), installed_at timestamptz NOT NULL DEFAULT now())` з `ENABLE ROW LEVEL SECURITY` без політик (подвійний захист) і `INSERT … VALUES (1) ON CONFLICT DO NOTHING`.
- Правило для наступних змін: кожна нова таблиця в `public` має `.enableRLS()` у Drizzle. Доступ іде лише через service role або пряме підключення `postgres` (клієнти з `anon`-ключем не мають прямого доступу до таблиць; анонімний доступ дозволено лише до каналів Realtime на читання).

**Чому `instance_meta`, а не лише журнал Drizzle:** журнал живе в службовій схемі `drizzle`, а його формат — деталь бібліотеки. Власний запис дає стабільний контракт для перевірки `schema` (`schema_not_initialized`), а пізніше може зберігати метадані інстансу. Інших таблиць каркас не потребує.

### D6. Env-валідація: чисті zod-схеми + лінивий доступ

- `src/lib/env/schema.ts` містить чисті zod-схеми `serverEnvSchema` і `clientEnvSchema` без побічних ефектів, тому їх легко тестувати. Порожні рядки через `preprocess` перетворюються на `undefined`, `RESULTS_RETENTION_DAYS` — через `z.coerce.number().int().positive()`, `DEFAULT_LOCALE` — через `z.enum(['uk','en'])`.
- `src/lib/env/server.ts` (`import 'server-only'`) надає `getServerEnvResult()` (кешований `safeParse`, лише назви проблемних змінних) і `getServerEnv()` (кидає `ConfigError` без значень). Валідація навмисно **лінива**, а не на старті: інакше невалідна конфігурація зламала б `/health`, а саме ця сторінка має пояснити проблему.
- `src/lib/env/client.ts` читає `process.env.NEXT_PUBLIC_SUPABASE_URL` і `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` буквально, бо Next.js інлайнить лише прямі звернення.
- `server-only` дає помилку білда при імпорті серверної конфігурації в клієнтський компонент (вимога «Секрети лише на сервері»).
- Без `@t3-oss/env-nextjs`: власний код займає ~50 рядків і повністю контролює поведінку «не падати, а пояснити».
- Змінні `SUPABASE_URL` і `SUPABASE_ANON_KEY` без префікса, які теж ставить інтеграція, не використовуються, щоб мати одне джерело істини.

### D7. Перевірки стану

`src/lib/health/checks.ts` → `runHealthChecks(): Promise<HealthReport>`:
- `config` — синхронно з `getServerEnvResult()`. Якщо `error`, решта перевірок отримує `skipped`.
- `database` + `schema` — один короткоживучий postgres.js-клієнт (`connect_timeout: 4`, `max: 1`) і обгортка `withTimeout(4500 мс)`: `select 1`, потім `select installed_at from instance_meta where id = 1`. Класифікація: тайм-аут, `ECONNREFUSED`/`ENOTFOUND`/`ETIMEDOUT` і помилки Supavisor про недоступний tenant дають `unreachable`; `28P01`/`28000` — `auth_failed`; `42P01` або відсутній рядок — `schema_not_initialized`; решта — `unknown`. Окремий клієнт потрібен, щоб не «отруїти» runtime-синглтон зависшим з'єднанням.
- `supabaseApi` — `fetch(${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health, { headers: { apikey }, signal: AbortSignal.timeout(4000), cache: 'no-store' })`. 2xx дає `ok`; 401/403 — `invalid_key`; мережева помилка, тайм-аут або 5xx (включно з нестандартними статусами призупиненого проєкту) — `unreachable`. Конкретні статуси для паузи не закладаємо: класифікація йде за доступністю, а не за кодом.
- Перевірки виконуються через `Promise.all`, тож загальний час ≤ ~5 с, що вкладається в бюджет 8 с зі специфікації. Деталі помилок пишуться в `console.error` з маскуванням URL.
- `/health` — серверний компонент з `export const dynamic = 'force-dynamic'`. Тексти дій для кожного коду: `unreachable` → інструкція з відновлення проєкту в дашборді Supabase + порада відкрити інстанс за день до виступу; `config_invalid` → назви змінних і де їх задати у Vercel; `schema_not_initialized` → перезапустити деплой (Redeploy).
- `/api/health` — route handler (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`), `Cache-Control: no-store`, статус 200/503.
- Головна сторінка — заглушка з назвою продукту (повноцінна головна з кнопкою «Створити презентацію» і полем «Ввести код сесії» — зміни `add-presentation-access` і `add-live-sessions`). Вона MUST бути динамічною (`export const dynamic = 'force-dynamic'` або `await connection()` у компоненті банера): запит через postgres.js, на відміну від `fetch`, не вимикає статичний пререндер. Без цього перевірка виконалася б один раз під час `next build`, і результат «запікся» б у HTML. Банер стану рендериться в `<Suspense>` окремим асинхронним серверним компонентом, тож при «сплячому» Supabase основний контент з'являється одразу, а банер — коли завершаться перевірки. Помилку в банері ловить try/catch: банер просто не показується, а сторінка не ламається.

### D8. Тести без живого Supabase

- **Vitest** (`environment: 'node'`, псевдоніми як у tsconfig): smoke-тест env-схеми — дефолти опційних змінних, порожній рядок як незадане значення, некоректний `DEFAULT_LOCALE`, звіт лише з назвами змінних. Класифікацію помилок health можна покрити в тому ж файлі або окремо, на моках, без мережі.
- **Playwright** (лише Chromium): `webServer` запускає `pnpm build && pnpm start` на `PORT=3100` з **порожнім** env. Міграції пропускаються локально (D3), застосунок збирається завдяки лінивій валідації (D6). Smoke-тест відкриває `/health` і перевіряє, що є заголовок сторінки та елемент загального стану (`data-testid="health-overall"`) з будь-яким значенням, а не саме `ok`. Так тест стабільний і без БД.
- Скрипти: `test` (vitest run), `test:e2e` (playwright test), `typecheck` (`tsc --noEmit`), `lint` (ESLint flat config з `eslint-config-next`).

### D9. Інструменти та версії

- pnpm, зафіксований через поле `packageManager` (Vercel і corepack підхоплюють його автоматично). `engines.node` — `22.x`, актуальна LTS на Vercel.
- Next.js — актуальна стабільна мажорна версія на момент реалізації. Tailwind CSS v4 (`@tailwindcss/postcss`, `@import "tailwindcss"`).
- Кнопка деплою: `https://vercel.com/new/clone?repository-url=…` з параметрами, які додають продукт Supabase з Marketplace. Точний формат параметрів (`products=…` чи `integration-ids=…`) перевіряється за актуальною документацією Vercel під час реалізації й не вгадується.

## Risks / Trade-offs

- **[Preview-деплої мігрують ту саму БД, що й production]** → у README і в коментарі в `drizzle/` закріплюємо правило: міграції лише розширюють схему (expand/contract), а деструктивні зміни робляться в окремому релізі. Для типового інстансу (один виступ чи заклад) preview-деплоїв зазвичай немає.
- **[Деплой падає, якщо Supabase «спить»]** → це свідомо (D3). Лог білда містить ту саму інструкцію з відновлення, що й `/health`.
- **[`POSTGRES_URL_NON_POOLING` — session pooler, а не пряме з'єднання]** → session mode підтримує advisory locks і DDL у межах сесії. Якщо на якомусь проєкті змінної немає, скрипт переходить на `POSTGRES_URL` з `prepare: false`. У transaction mode сесійний advisory lock не гарантований (мігратор Drizzle відкриває власну транзакцію, тож обгорнути його в `pg_advisory_xact_lock` не можна), тому поведінку цього запасного шляху треба перевірити під час реалізації і, якщо лок не працює, задокументувати, що паралельні деплої в такій конфігурації не серіалізуються.
- **[Supabase змінить типові гранти або назви змінних інтеграції]** → явні `REVOKE` не залежать від дефолтів. Змінні інтеграції описано в одному місці (`src/lib/env/schema.ts`, `.env.example`, README).
- **[Сторінка стану публічна]** → вона повертає лише статуси й коди (вимога «Без розкриття чутливих даних»). Окремий ендпоінт не відкриває нічого понад це.
- **[Банер на головній додає запити до БД на кожен перегляд]** → навантаження мізерне (2 легкі запити). Пізніше можна кешувати результат на кілька секунд у пам'яті інстансу функції, не змінюючи специфікацію.
- **[Невідомо, чи Cron-пінг рахується як активність Supabase]** → Cron поза обсягом. README містить чек-лист «відкрити `/health` за день до виступу».

## Migration Plan

- Greenfield: перший деплой застосовує `0000` на порожню БД.
- Відкат коду — Instant Rollback у Vercel. Міграції лише forward: відкат схеми робиться новою міграцією. Через правило expand-only попередня версія коду сумісна з новою схемою.

## Open Questions

- Точна GitHub-адреса публічного репозиторію для `repository-url` у кнопці деплою. Поки що в README буде плейсхолдер, а адресу підставлять при публікації. На специфікації й задачі це не впливає.
- Чи вважає Supabase запити Vercel Cron активністю, що запобігає паузі. Це перевіримо й, можливо, додамо окремою зміною. Поточна специфікація стану від цього не залежить.
