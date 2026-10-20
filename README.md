# Vercel Site Manager

Open-source платформа інтерактивних презентацій (опитування, квізи, міні-ігри) на кшталт Mentimeter/Kahoot. Кожен розгортає власний інстанс в один клік на безкоштовних тарифах **Vercel Hobby + Supabase Free**. Вимоги та архітектура описані в [SPEC.md](./SPEC.md).

> Статус: каркас платформи. Створення презентацій, редактор, сесії та плагіни слайдів з'являться в наступних змінах (SPEC.md розділ 8).

<!-- Перед публікацією замініть OWNER/REPO в посиланні нижче на адресу цього репозиторію на GitHub. -->
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FOWNER%2FREPO&project-name=vercel-site-manager&repository-name=vercel-site-manager&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%7D%5D)

## Деплой

1. Натисніть **Deploy with Vercel** вище.
2. Vercel клонує репозиторій у ваш GitHub-акаунт і запропонує підключити **Supabase** (через Vercel Marketplace). Створіть новий Supabase-проєкт або оберіть наявний. Усі обов'язкові змінні середовища інтеграція підставить сама.
3. Під час білда автоматично застосуються міграції БД (рядки `[migrate]` у лозі білда). Якщо БД недоступна, деплой зупиниться, а попередня версія інстансу залишиться активною.
4. Відкрийте `https://<ваш-проєкт>.vercel.app/health`. Усі перевірки мають бути зеленими.

Опційні налаштування задаються у Vercel → **Settings → Environment Variables**. Після зміни потрібен **Redeploy**.

## Змінні середовища

| Змінна | Обов'язкова | За замовчуванням | Опис |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | так (ставить інтеграція) | — | URL Supabase-проєкту |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | так (ставить інтеграція) | — | Публічний anon-ключ |
| `SUPABASE_SERVICE_ROLE_KEY` | так (ставить інтеграція) | — | Service role key, лише на сервері |
| `POSTGRES_URL` | так (ставить інтеграція) | — | Postgres через Supavisor (transaction mode) для запитів застосунку |
| `POSTGRES_URL_NON_POOLING` | ні (ставить інтеграція) | `POSTGRES_URL` | Postgres у session mode, використовується для міграцій |
| `INSTANCE_PASSWORD` | ні | не задано | Пароль на створення презентацій і майстер-доступ `/admin`. Без нього інстанс відкритий |
| `DEFAULT_LOCALE` | ні | `uk` | Мова за замовчуванням: `uk` або `en` |
| `RESULTS_RETENTION_DAYS` | ні | `90` | Через скільки днів видаляються завершені сесії |

Повний приклад є у [`.env.example`](./.env.example). Якщо конфігурація неповна, застосунок не падає: `/health` показує, яких змінних бракує (лише назви, без значень).

## «Сплячий» Supabase Free

Безкоштовний проєкт Supabase **призупиняється після 7 днів неактивності**. Тоді `/health` показує «Підключення до Postgres: unreachable», а на головній з'являється попередження.

Як відновити:
1. Відкрийте [дашборд Supabase](https://supabase.com/dashboard) і знайдіть проєкт інстансу.
2. Натисніть **Restore project** і зачекайте кілька хвилин.
3. Оновіть `/health`.

**Чек-лист перед виступом:** за день до події відкрийте `https://<ваш-проєкт>.vercel.app/health` і переконайтеся, що всі перевірки зелені. Для зовнішнього моніторингу є `GET /api/health`: 200, якщо все справно, і 503 в іншому разі.

## Локальна розробка

Потрібні Node.js 22 і pnpm (`corepack enable`).

```bash
pnpm install
cp .env.example .env.local   # заповніть значеннями свого Supabase-проєкту
pnpm db:migrate              # застосувати міграції до БД з .env.local
pnpm dev                     # http://localhost:3000
```

Без `.env.local` застосунок теж запускається, а `/health` пояснює, чого бракує. `pnpm build` локально без БД пропускає міграції з попередженням.

### Команди

| Команда | Що робить |
|---|---|
| `pnpm dev` | Dev-сервер |
| `pnpm build` | Міграції + production-білд (так само, як на Vercel) |
| `pnpm lint` / `pnpm typecheck` | ESLint / перевірка типів |
| `pnpm test` | Unit-тести (Vitest) |
| `pnpm test:e2e` | E2E smoke-тести (Playwright). Перед першим запуском: `pnpm exec playwright install chromium` |
| `pnpm db:generate` | Згенерувати SQL-міграцію зі змін у `src/lib/db/schema/` |
| `pnpm db:migrate` | Застосувати міграції |

Тести не потребують живого Supabase.

## Структура

```
src/app/            маршрути Next.js (App Router): головна, /health, /api/health
src/lib/env/        валідація env-змінних (zod)
src/lib/db/         Drizzle: схема, клієнт, класифікація помилок
src/lib/supabase/   клієнти Supabase (server — service role, browser — anon)
src/lib/health/     перевірки стану інстансу
plugins/            плагіни типів слайдів (SPEC.md 5), реєстр у plugins/index.ts
drizzle/            SQL-міграції
scripts/migrate.ts  застосування міграцій під час білда
tests/unit/, e2e/   Vitest і Playwright
```

## Міграції БД

Міграції генерує drizzle-kit, а застосовуються вони під час кожного деплою. Головні правила (детально в [drizzle/README.md](./drizzle/README.md)):

- **Лише expand-only.** Preview-деплої мігрують ту саму БД, що й production, тож попередня версія коду має працювати з новою схемою.
- Кожна нова таблиця має RLS (`.enableRLS()`). Ролі `anon`/`authenticated` доступу до таблиць не мають, дані читає й пише лише серверний код.
