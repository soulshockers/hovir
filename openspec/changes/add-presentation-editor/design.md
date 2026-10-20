# Design

## Context

Доступ до редактора дає edit-посилання `/e/<editToken>` (`openspec/changes/add-presentation-access`); у БД лише SHA-256 хеш токена. Плагіни надають `configSchema`, `defaultConfig`, `migrateConfig`, `Presenter`, `Preview` (`openspec/changes/add-slide-plugin-system/design.md`). Усі таблиці закриті для `anon`/`authenticated`; доступ лише через серверний код (`openspec/specs/instance-deployment/spec.md`). Мотивацію див. `proposal.md` (Why).

## Goals / Non-Goals

**Goals:** редактор, що працює з будь-яким плагіном без спеціального коду; превʼю, ідентичне сцені; жодна правка не губиться при закритті вкладки.

**Non-Goals:** колаборативне редагування, історія версій, undo на сервері.

## Decisions

### Адмінка: порівняння

| Варіант | Плюси | Мінуси |
|---|---|---|
| Keystone.js | Потужна CMS, GraphQL, ролі | Окремий Node-сервер, важкий білд, друга схема даних; погано вписується в Vercel serverless; редактор слайдів однаково довелося б писати вручну |
| AdminJS | CRUD з коробки | Express/Fastify-адаптери, на Vercel тільки з обхідними рішеннями; візуальний редактор лише через кастомні компоненти |
| **Власна в Next.js** ✅ | Один деплой, без акаунтів (edit-токени), форми генеруються з zod-схем плагінів, live-превʼю тими самими компонентами | Більше власного UI-коду |

Обрано власну адмінку в Next.js.

### Модель даних (чорновик)

```
presentations                      -- створює add-presentation-access; редактор оновлює title, theme, locale, updated_at
  theme            jsonb        -- { preset: 'light'|'dark'|'bright', accent, logoUrl }
  locale           text         -- мова інтерфейсу слухачів (uk|en|auto)

slides
  id               uuid pk
  presentation_id  uuid fk → presentations (cascade)
  position         int
  plugin_id        text         -- 'bulls-and-cows'
  plugin_version   int
  config           jsonb        -- валідується zod-схемою плагіна
  created_at, updated_at
```

`position` — щільна нумерація 0..n−1; перестановка оновлює позиції в одній транзакції. RLS увімкнено, доступ лише service role.

### Форма з zod-схеми

Генератор обходить `configSchema` і зіставляє типи з полями: `z.string()` → текстове поле (з `.max()`), Markdown-рядки — textarea (позначка через `.describe()`/метадані), `z.number()` з `.min()/.max()` → числове поле з межами, `z.boolean()` → перемикач, `z.enum()` → select/radio, `z.array()` → список з додаванням/видаленням і межами довжини, `.nullable()` → перемикач «без значення», зображення — поле завантаження (`slide-media`). Підписи — з `i18n` плагіна. Валідація — та сама схема на клієнті й сервері. Альтернатива — ручні форми для кожного плагіна — відхилена: ламає розширюваність.

### Превʼю

Центр показує `Presenter` плагіна з `config` і `init(config, ctx)` → `toPublic` у «сухому» режимі (без БД, фіктивний `ctx`), або `Preview`, якщо він є, у тому ж кадрі 16:9, що й сцена. Мініатюри в списку — `Preview` або зменшений `Presenter`.

### Автозбереження

Зміни зберігаються з debounce ~800 мс і при втраті фокусу/закритті сторінки (`visibilitychange`, `keepalive`). Індикатор «Збережено / Зберігається… / Помилка збереження». Кожен запит повний для одного слайда (PUT config), тож порядок відповідей не важливий: виграє останній за `updated_at`. Невалідний конфіг не зберігається, поле показує помилку.

### Медіа

Bucket `slide-media` створюється SQL-міграцією (`storage.buckets`), публічне читання за непрогнозованим шляхом `<presentationId>/<uuid>.<ext>`, запис лише service role через API за edit-токеном. Ліміти: лише `image/png`, `image/jpeg`, `image/webp`, `image/gif` до 5 МБ на файл; `image/svg+xml` не допускається (XSS). Видалення презентації (власником) видаляє її файли.

## Risks / Trade-offs

- [Ліміт Supabase Free 1 ГБ Storage] → обмеження розміру файлу; видалення файлів разом з презентацією.
- [Публічні URL зображень] → шляхи з UUID; у зображеннях слайдів немає персональних даних.
- [Редагування під час живої сесії] → сесія працює з копією слайдів на момент старту (`slides_snapshot`, `add-live-sessions`), тож правки не ламають живу сесію.
