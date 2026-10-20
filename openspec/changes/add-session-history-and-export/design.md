# Design

## Context

Сесії, учасники, стани слайдів створює `openspec/changes/add-live-sessions`; таблицю `scores` — `openspec/changes/add-session-leaderboard`; метод `exportRows?(state: State): Record<string, unknown>[]; // для CSV` — контракт `openspec/specs/slide-plugin-contract/spec.md`. `RESULTS_RETENTION_DAYS` уже валідується (`openspec/specs/runtime-config/spec.md`). Мотивацію див. `proposal.md`.

## Decisions

### Модель даних

```
session_events                    -- (опц.) журнал для стрічки подій / аудиту / CSV
  id bigserial, session_id, slide_id, participant_id null, type text, payload jsonb, created_at
```

- `session_id` — fk → `sessions` (cascade), `participant_id` — fk → `participants` (set null), `created_at timestamptz default now()`. RLS увімкнено, доступ лише service role.
- Події пишуться з `ActionResult.events` (`FeedEvent[]`) у тій самій транзакції, що й новий стан слайда.
- Каскадні fk (`participants`, `slide_states`, `scores`, `session_events` → `sessions`) дають видалення сесії одним `DELETE`.

### Експорт
- Сесія: учасники та очки (з `scores` + `participants`, без `token_hash`).
- Слайд: `plugin.exportRows(state)` для стану зі `slide_states`; колонки — об'єднання ключів рядків. Генерується потоково на сервері; edit-токен — у заголовку `Authorization`, тому кнопка в UI робить `fetch` і зберігає Blob.

### Retention: Vercel Cron + ліниво
Розглядались: (а) лише Vercel Cron раз на добу; (б) лише ліниво під час запитів. Обрано обидва: Cron (`vercel.json`, раз на добу — у межах Hobby) викликає `GET /api/cron/retention`, захищений заголовком `Authorization: Bearer <CRON_SECRET>` (опційна змінна `CRON_SECRET`: якщо власник задав її у Vercel, Vercel надсилає її в Cron-запитах; без неї ендпоінт вимкнено, і працює лише лінивий запуск — zero-config зберігається). Лінивий запуск — під час старту сесії, не частіше разу на годину (позначка часу в `instance_meta`), щоб інстанс без Cron (наприклад, локально) теж очищався.

### Персональні дані
Немає: анонімні ніки, без IP в БД. Ключі rate limiting — HMAC, а не IP (`openspec/specs/rate-limiting/spec.md`).

## Risks / Trade-offs

- [Великий CSV на Hobby-ліміті тривалості функцій] → до 100 учасників на сесію обсяг малий.
- [Cron на Hobby спрацьовує неточно в часі] → прийнятно для добового очищення.
