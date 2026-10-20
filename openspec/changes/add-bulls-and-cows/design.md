# Design

## Context

Плагін реалізує контракт `SlidePlugin` (`openspec/changes/archive/2026-10-21-add-slide-plugin-system/design.md`) і працює в межах сесії (`openspec/changes/add-live-sessions`). Мотивацію див. `proposal.md` (Why).

## Goals / Non-Goals

**Goals:** чиста детермінована логіка в `server.ts`, повністю покрита unit-тестами (підрахунок биків/корів, валідація, рейтинг, очки); жодного секрету чи цифр спроб у публічних даних до кінця раунду.

**Non-Goals:** окрема таблиця для спроб, власний realtime-механізм.

## Decisions

### Стан слайда
- `State` (лише сервер, `slide_states.state`): `secret` (для `shared`) або мапа `participantId → secret` (для `perPlayer`); `startedAt`, `endsAt` (ядро зберігає `ends_at`); по гравцю — список спроб `{ guess, bulls, cows, at }`, `solvedAt`, `lastAttemptAt`.
- `PublicState`: таймер (`endsAt`), `round_status`, топ-10 (нік, кількість спроб, найкращий результат як кількості биків/корів без цифр, ✅ і час), «вгадали X з N», середня кількість спроб, стрічка подій; після закриття — п'єдестал і (за умов) секрет.
- `PlayerView`: власні спроби з цифрами, лічильник, статус і місце.

### Налаштування слайда (конфіг-схема)

| Поле | Тип | Дефолт | Опис |
|---|---|---|---|
| `secretMode` | `shared` \| `perPlayer` | `shared` | Одне число на всіх або своє для кожного |
| `timeLimitSec` | число, 60–1800 | 300 | Тривалість раунду |
| `maxAttempts` | число \| null | null | Ліміт спроб (null — без ліміту) |
| `revealSecret` | boolean | true | Розкрити число в кінці (лише для `shared`) |
| `showEventFeed` | boolean | true | Стрічка подій на екрані доповідача |

### Дії
`guess { digits: string }` (слухач), `start`/`stop`/`tick` (доповідач, ядро). `validateAction` — zod; змістова перевірка (4 різні цифри, повтор, 1 спроба/с) — у `handleAction`, щоб повертати пояснення в `reply`.

### Час і випадковість
Лише через `ctx.now()` і `ctx.random()` (crypto), що робить `handleAction` детермінованим у тестах. Rate limit 1 спроба/с перевіряється за `lastAttemptAt` у стані (додатково до загального rate limiting actions ядра).

### Очки
Константи (`SOLVED_MAX = 1000`, `SOLVED_MIN = 500`, `SOLVED_STEP = 50`, `UNSOLVED_MAX = 400`, `BULL = 100`, `COW = 25`) — у коді плагіна; це чорновик і може змінитися без зміни контракту.

## Risks / Trade-offs

- [«Підглядання» в телефон сусіда в режимі `shared`] → прийнятний ризик: цифри спроб не видно на scoreboard; для змагань — режим `perPlayer`.
- [Багато гравців одночасно → часті зміни топу] → ядро throttling-ом надсилає `PublicState` не частіше ~500 мс на сесію.
