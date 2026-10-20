# Design

## Context

Мотивацію див. `proposal.md` (Why). Сесії спираються на present-токен і `rate-limiting` з `openspec/specs/presentation-access` і `openspec/specs/rate-limiting`, на контракт плагінів (`SlidePlugin`, `tick`, `toPublic`/`toPlayer`, throttling) з `openspec/specs/slide-plugin-contract` і `openspec/specs/slide-plugin-runtime` і на слайди з `openspec/changes/add-presentation-editor`. Інстанс працює на Vercel Hobby (serverless) + Supabase Free.

## Goals / Non-Goals

**Goals:** realtime на безкоштовних тарифах без long-running сервера; сервер — єдине джерело істини; будь-який клієнт відновлюється після перезавантаження чи втрати мережі; до 100 учасників на сесію.

**Non-Goals:** абстракція realtime-адаптера (Supabase / Ably / socket.io) — подальші етапи; журнал `session_events` — `add-session-history-and-export`; таблиця `scores` — `add-session-leaderboard`.

## Decisions

### D1. Чому не socket.io і як влаштовано realtime
- Vercel Functions — serverless: вони не тримають постійних WebSocket-з'єднань, тож socket.io-сервер там запустити неможливо. Окремий long-running сервер (Railway/Fly/Render) суперечить ідеї деплою «в один клік на безкоштовний хостинг».
- Тому realtime надає **Supabase Realtime**: та сама послуга, що й БД, одна інтеграція, безкоштовний тариф.
- Альтернативи: socket.io на окремому сервері (відхилено, див. вище); Ably/Pusher (ще одна інтеграція й окремий безкоштовний ліміт); polling (затримка й зайві виклики функцій).

### D2. Потік даних
1. Клієнт (слухач або доповідач) робить HTTP-запит до Next.js API route: `POST /api/sessions/:id/actions`.
2. Route перевіряє токен, у транзакції читає стан слайда (`SELECT … FOR UPDATE`), викликає `plugin.server.handleAction` і зберігає новий стан.
3. Відповідь актору (наприклад, результат спроби «Биків») повертається **прямо в HTTP-відповіді**.
4. Сервер публікує `PublicState`/події в канал `session:<id>` через Supabase Realtime Broadcast (server-side, з throttling).
5. Усі клієнти підписані на канал лише на **читання**. Публікувати в канал можуть тільки серверні функції (приватні канали + RLS на `realtime.messages`).

- **Presence** використовується для лічильника online-учасників у лобі.
- **Знімок стану** `GET /api/sessions/:id/state` (публічний стан + персональний `PlayerView`) потрібен для першого завантаження й після перепідключення.
- Перед `handleAction` і в знімку стану викликається `tick` (лінивий таймер), бо фонових процесів на serverless немає. Ядро робить це в `runAction`/`runTick` (`src/lib/plugins/runtime.ts`); якщо результат має `ticked` = true, сервер транслює новий `PublicState` незалежно від `broadcast` дії. Коли `endsAt` спливає, клієнт доповідача запитує стан (`tick`), щоб раунд закрився й без дій учасників.

### D3. Модель даних (чорновик)

```
sessions
  id               uuid pk
  presentation_id  uuid fk
  code             char(6)      -- унікальний серед активних сесій (partial unique index where status <> 'ended')
  status           text         -- 'lobby' | 'live' | 'ended'
  current_slide_id uuid null
  slides_snapshot  jsonb        -- копія слайдів на момент старту (редагування не ламає живу сесію)
  started_at, ended_at timestamptz

participants
  id               uuid pk
  session_id       uuid fk (cascade)
  nickname         text         -- unique (session_id, nickname)
  token_hash       text unique
  kicked           boolean default false
  joined_at, last_seen_at

slide_states                      -- стан плагіна для слайда в сесії (лише service role)
  session_id       uuid fk
  slide_id         uuid
  state            jsonb        -- може містити секрети
  round_status     text         -- 'idle' | 'running' | 'closed'
  ends_at          timestamptz null
  version          int          -- оптимістичне блокування
  pk (session_id, slide_id)
```

- **RLS:** клієнти з `anon`-ключем не мають прямого доступу до таблиць; усі операції йдуть через API routes із service role. Анонімний доступ дозволено лише до каналів Realtime на читання.
- `slide_id` у `slide_states` посилається на слайд зі `slides_snapshot`, тому без FK на `slides`.
- Генерація коду: випадкові 6 цифр з крипто-ГВЧ, вставка з повтором при конфлікті partial unique index.
- `version` дає оптимістичне блокування як запасний механізм поряд із `SELECT … FOR UPDATE`.

### D4. Ліміти безкоштовних тарифів
Supabase Free: ~200 одночасних Realtime-з'єднань і обмеження на кількість повідомлень (кожна доставка кожному клієнту — окреме повідомлення). Для 100 учасників: throttling 2 повідомлення/с × 100 клієнтів = ~200 доставок/с у пік гри. Тому трансляції стану **агрегуються**, а персональні дані йдуть через HTTP-відповіді, а не через broadcast. Ліміти перевіряє навантажувальний тест (`openspec/changes/add-quality-gates`).

### D5. Ніки
Словники «прикметник + тварина» лежать у репозиторії (`uk` у цій зміні, `en` — `add-i18n`), вручну перевірені. Перегенерація 🎲 — запит на сервер за новим ніком (сервер підписує/запам'ятовує запропонований нік), тож клієнт не може підставити власний текст. Узгодження роду («Смілива Сова», «Хитрий Лис») — властивість словника.

### D6. Токен учасника
Participant token ≥128 біт, у `participants.token_hash` — SHA-256. Ключ у `localStorage` містить id/код сесії, тож токени різних сесій не плутаються.

## Risks / Trade-offs

- [Пропущені broadcast-повідомлення] → після перепідключення клієнт завжди бере знімок стану.
- [Вичерпання лімітів повідомлень Supabase Free] → throttling ~500 мс на сесію, агрегування, персональне — через HTTP.
- [Таймер без фонових процесів] → лінивий `tick` на будь-якій дії/запиті стану; клієнт доповідача також надсилає `tick`, коли таймер спливає.
- [Перебір кодів сесій] → rate limiting на join; код діє лише для активних сесій.

## Migration Plan

Нова expand-only міграція: таблиці, індекси (partial unique index на `code` where `status <> 'ended'`, unique `(session_id, nickname)`), RLS, політики на `realtime.messages` для приватних каналів `session:*` (лише читання для клієнтів). Відкат — Instant Rollback у Vercel; схема сумісна.

## Open Questions

**Кілька пристроїв з одним present-посиланням.** Якщо present-посилання відкрити на двох пристроях (наприклад, ноутбук на проєкторі та телефон як пульт), хто керує сесією? Варіанти:
- усі рівноправні (останній клік виграє, стан синхронізується через канал);
- один «головний» екран + решта в режимі пульта/дзеркала;
- лише один активний пристрій, інші бачать «Сесія керується з іншого пристрою — перехопити?».

До рішення поведінка за замовчуванням — перший варіант (усі рівноправні, стан у БД і каналі), бо він не потребує додаткових вимог і не суперечить жодному з інших.
