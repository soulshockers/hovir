# Proposal

## Why

Кожен запуск презентації — окрема сесія з чистими результатами, але після завершення автор не бачить, що відбулося, і не може забрати результати (наприклад, для оцінювання). Водночас результати не повинні зберігатися вічно на безкоштовному тарифі (500 МБ БД). Це пункт P2 дорожньої карти MVP: «Історія сесій, експорт CSV, автовидалення».

## What Changes

- Вкладка «Сесії» в редакторі `/e/<editToken>`: історія проведених сесій, результати по слайдах, експорт CSV.
- Експорт CSV (з edit-посилання): по сесії — учасники та очки; по слайду — рядки з `plugin.exportRows` (опційний метод контракту плагіна).
- Таблиця `session_events` (опційна) — журнал для стрічки подій / аудиту / CSV.
- Автовидалення (retention): завершені сесії старші за `RESULTS_RETENTION_DAYS` (опційна env-змінна, дефолт 90, описана в `openspec/specs/runtime-config/spec.md`) видаляються разом з учасниками, станами, очками й подіями.
- Персональні дані: немає (анонімні ніки, без IP в БД) — експорт і журнал це зберігають.

## Поза обсягом

- Аналітика між сесіями, графіки, порівняння сесій.
- Експорт у формати, крім CSV (JSON-імпорт/експорт презентацій — подальші етапи).
- Ручне видалення окремих сесій автором.
- Доступ до історії з present-посилання (лише edit-посилання).

## Capabilities

### New Capabilities
- `session-history`: вкладка «Сесії» в редакторі — список проведених сесій і результати по слайдах.
- `results-export`: експорт CSV по сесії та по слайду (`exportRows`), без персональних даних.
- `results-retention`: автовидалення завершених сесій старших за `RESULTS_RETENTION_DAYS`.

### Modified Capabilities
<!-- Немає: `RESULTS_RETENTION_DAYS` уже валідується в `runtime-config`. -->

## Impact

- **Код:** вкладка «Сесії» в редакторі, `GET /api/presentations/sessions` (з edit-токеном), `GET /api/sessions/:id/export.csv` і `GET /api/sessions/:id/slides/:slideId/export.csv` (edit-токен у заголовку `Authorization`), модуль retention, запис подій у `session_events`.
- **БД:** нова таблиця `session_events` (міграція expand-only, RLS, лише service role); індекс за `sessions.ended_at`.
- **Інфраструктура:** Vercel Cron (раз на добу) у `vercel.json`.
- **Залежності від інших змін:** `add-live-sessions` (сесії, учасники, стани), `add-session-leaderboard` (`scores`), `add-slide-plugin-system` (`exportRows`), `add-presentation-editor`.
