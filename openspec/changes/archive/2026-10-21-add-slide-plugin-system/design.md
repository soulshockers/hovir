# Design

## Context

Каркас (`bootstrap-platform`, D1) — один Next.js-пакет у корені з папкою `plugins/` і порожнім реєстром `plugins/index.ts`. Сервер — джерело істини: ігрова логіка й секрети лише на сервері; клієнти лише читають realtime-канал, а дії йдуть через HTTP API (`openspec/changes/add-live-sessions/design.md`). Vercel Functions — serverless, фонових процесів немає. Мотивацію див. `proposal.md` (Why).

## Goals / Non-Goals

**Goals:** один стабільний інтерфейс, через який редактор, сесії й лідерборд працюють з будь-яким типом слайда; логіка плагіна тестується без БД і мережі; автоматична перевірка, що плагін не «протікає» секретами.

**Non-Goals:** динамічне завантаження плагінів під час виконання, npm-пакети, sandbox для стороннього коду.

## Decisions

### Розміщення (дерево файлів)

- Кожен плагін — це папка `plugins/<id>/` у монорепо. Реєстрація відбувається в одному файлі `plugins/index.ts` (масив плагінів).
- Новий тип слайда додається через PR у основний репозиторій або у власний форк.
- Контракт проєктується так, щоб згодом плагіни можна було винести в npm-пакети без зміни інтерфейсу.

```
plugins/
  bulls-and-cows/
    index.ts            # маніфест (SlidePlugin)
    schema.ts           # zod-схема конфігу
    server.ts           # reducer дій, підрахунок очок
    Presenter.tsx       # екран доповідача
    Audience.tsx        # екран слухача
    Preview.tsx         # (опц.) мініатюра в редакторі
    i18n/{uk,en}.json
    server.test.ts
    security.fixture.ts # фікстура для тест-хелпера безпеки
  poll/ ...
  index.ts              # реєстр
```

### Контракт (TypeScript, чорновик)

```ts
import type { ZodType } from 'zod';

export interface SlidePlugin<
  Config,          // налаштування слайда з редактора
  State,           // повний серверний стан слайда в сесії (може містити секрети)
  PublicState,     // те, що бачать усі (екран доповідача + слухачі)
  PlayerView,      // персональний стан для конкретного учасника
  Action           // дії учасника/доповідача
> {
  id: string;                      // 'bulls-and-cows'
  version: number;                 // для міграцій конфігу
  meta: { title: I18nKey; icon: string; category: 'content' | 'poll' | 'game' };
  interactive: boolean;            // false → слухач бачить «Дивіться на екран»
  scoring: boolean;                // чи нараховує очки в лідерборд

  // --- Редактор ---
  configSchema: ZodType<Config>;   // з неї генерується форма + валідація
  defaultConfig: Config;
  migrateConfig?(old: unknown, fromVersion: number): Config;

  // --- Сервер (виконується лише в API routes) ---
  server: {
    init(config: Config, ctx: ServerCtx): State;          // створення стану при першому показі
    handleAction(
      state: State, action: Action, actor: Actor, ctx: ServerCtx
    ): ActionResult<State>;                               // чиста функція: новий стан + відповідь актору
    validateAction: ZodType<Action>;
    tick?(state: State, ctx: ServerCtx): State | null;    // ліниве закриття раунду за таймером
    toPublic(state: State): PublicState;                  // що транслюється в канал (без секретів!)
    toPlayer(state: State, participantId: string): PlayerView;
    scores?(state: State): Record<string /*participantId*/, number>; // 0..1000
    exportRows?(state: State): Record<string, unknown>[]; // для CSV
  };

  // --- Клієнт ---
  Presenter: React.ComponentType<{ config: Config; state: PublicState; controls: PresenterControls }>;
  Audience:  React.ComponentType<{ config: Config; state: PublicState; me: PlayerView; dispatch: (a: Action) => Promise<unknown> }>;
  Preview?:  React.ComponentType<{ config: Config }>;
  i18n: Record<Locale, Record<string, string>>;
}

type Actor = { kind: 'presenter' } | { kind: 'participant'; participantId: string };
interface ActionResult<State> { state: State; reply?: unknown; broadcast?: boolean; events?: FeedEvent[] }
interface ServerCtx { now(): number; random(): number /* crypto */; participants: ParticipantInfo[]; locale: Locale }
```

Контракт — чорновик: під час реалізації можна уточнювати допоміжні типи (`I18nKey`, `PresenterControls`, `FeedEvent`, `ParticipantInfo`, `Locale`), але не форму `SlidePlugin` без оновлення специфікації.

Уточнення під наявний код:
- `Locale` = `(typeof LOCALES)[number]` з `src/lib/env/schema.ts` (`'uk' | 'en'`); значення `auto` з `presentations.locale` ядро розв'язує до конкретної локалі до виклику плагіна (`openspec/changes/add-i18n/design.md`).
- Реєстр гетерогенний, тому `plugins/index.ts` типізується як `readonly AnySlidePlugin[]` (тип-стерта форма `SlidePlugin<any, …>`), а кожен плагін оголошується через `defineSlidePlugin<Config, State, …>(…)`, що зберігає точні типи всередині плагіна.
- Плагіни імпортують із застосунку лише `@/lib/plugins` (контракт, хелпери). Решта `@/…` (`@/lib/db`, `@/lib/http`, `@/lib/access`, `src/app`), `server-only` і `next/*` для `plugins/**` заборонені правилом `no-restricted-imports` в `eslint.config.mjs`. Модуль `src/lib/plugins` теж не залежить від БД/HTTP, тож його можна винести в npm-пакет разом із плагінами.

### Модулі ядра та межа з `add-live-sessions`

Ця зміна не додає таблиць, міграцій і API routes (`proposal.md`, Impact). Рантайм ядра — чисті функції над портом сховища; БД-реалізацію порту дає `add-live-sessions`.

| Модуль | Зміст | Хто підключає до БД/API |
|---|---|---|
| `src/lib/plugins/contract.ts` | `SlidePlugin`, `AnySlidePlugin`, `defineSlidePlugin`, `Actor`, `ActionResult`, `ServerCtx`, допоміжні типи | — |
| `src/lib/plugins/registry.ts` | `getPlugin(id)`, `assertUniqueIds` (викликається при першому зверненні до реєстру) | — |
| `src/lib/plugins/config.ts` | `resolveConfig(plugin, raw, storedVersion)`: `migrateConfig` → `configSchema` → результат `{ ok, config } \| { ok: false, issues }` | редактор (`add-presentation-editor`) — збереження слайда, 400 `validation_failed` |
| `src/lib/plugins/runtime.ts` | `ensureSlideState`, `runAction`, `runTick`, `collectScores` над портом `SlideStateStore` | `add-live-sessions` |
| `src/lib/plugins/store.ts` | порт `SlideStateStore` (`withSlideState(key, fn)` — серіалізований доступ до стану одного слайда) + `memorySlideStateStore` для тестів | `add-live-sessions`: Postgres-реалізація в `slide_states` під `SELECT … FOR UPDATE` усередині `withDbDeadline` |
| `src/lib/plugins/throttle.ts` | `planBroadcast(ledger, now)` — чисте рішення «надіслати зараз / відкласти» з вікном 500 мс і об'єднанням; порт `BroadcastLedger` (останній час надсилання + відкладений `PublicState`) | `add-live-sessions` (`src/lib/realtime/`) |
| `src/lib/plugins/ctx.ts` | `createServerCtx` (`Date.now`, `crypto.getRandomValues`) | API routes сесій |
| `src/lib/plugins/AudienceSlot.tsx` | для `interactive: false` рендерить «Дивіться на екран», інакше `Audience` | сторінка слухача (`add-live-sessions`) |
| `src/lib/plugins/testing/` | `fakeCtx`, `checkPluginSecrets`, тип `SecurityFixture` | Vitest |

`runAction` виконує спершу `tick` (якщо є), потім `validateAction` → `handleAction` → збереження, і повертає `{ reply, publicState, playerView, broadcast, events }`; HTTP-обгортку (`src/lib/http`, коди помилок `ApiErrorCode`) і rate limiting робить `add-live-sessions`. Результат має `ticked`, коли `tick` закрив раунд за таймером; як це транслюється — `openspec/changes/add-live-sessions` (вимога «Трансляція після закриття раунду за таймером»). Очки: `collectScores` повертає `{}` для `scoring: false` і кидає помилку, якщо значення не ціле в межах 0..1000; запис очок у БД — `add-session-leaderboard`.

### Тестування

- Unit (Vitest, `pnpm test`): `tests/unit/plugins-*.test.ts` для модулів ядра на фікстурних плагінах з `tests/unit/plugin-fixtures.ts`, а також `plugins/**/*.test.ts` — для цього `vitest.config.mts` розширює `include`. Без БД і мережі.
- Інтеграційні тести з dev-базою (`pnpm test:integration`, `.env.local`) і e2e (Playwright) ця зміна не додає: БД/API-поверхні немає. Postgres-реалізацію `SlideStateStore` (паралельні дії, `FOR UPDATE`) перевіряють інтеграційні тести `add-live-sessions` тим самим контрактним набором, що й `memorySlideStateStore`.

### Правила для авторів плагінів

- `handleAction` — чиста детермінована функція (час і випадковість отримує лише через `ctx`). Завдяки цьому вона легко покривається unit-тестами.
- Секрети живуть лише в `State`. `toPublic`/`toPlayer` **ніколи** їх не повертають (до завершення раунду). Ядро має тест-хелпер, який перевіряє це для кожного плагіна.
- Таймери: плагін зберігає `endsAt` у стані. Закриття раунду виконується ліниво: на будь-якій дії/запиті стану ядро викликає `tick`. Щоб раунд закрився без дій учасників, клієнт доповідача запитує стан після `endsAt` (`openspec/changes/add-live-sessions`). Фонових процесів на serverless немає.
- Ядро саме відповідає за throttling трансляцій: `PublicState` надсилається не частіше ніж раз на ~500 мс на сесію (з об'єднанням змін).

### Тест-хелпер безпеки

Плагін декларує фікстуру в `plugins/<id>/security.fixture.ts` (експорт `securityFixture: SecurityFixture`): конфіг, учасників, послідовність дій з акторами, функцію `secretsOf(state)`, що повертає значення-секрети, і `isRoundClosed(state)`. Хелпер проганяє дії через `handleAction` з детермінованим `ctx`, після кожного кроку серіалізує `toPublic(state)` і `toPlayer(state, id)` для кожного учасника й перевіряє, що жоден секрет не входить у JSON, поки раунд не закрито (`round_status` ≠ `closed`). Помилка називає плагін, крок, функцію (`toPublic`/`toPlayer`) і JSON-шлях розкритого значення. Тест `tests/unit/plugins-security.test.ts` автоматично параметризується всіма плагінами з `plugins/index.ts` і знаходить фікстури під час запуску (`readdirSync` + `import()`); `import.meta.glob` не підходить, бо його результат зберігається в персистентному кеші трансформацій Vitest і не бачить нових фікстур. Фікстура обов'язкова для кожного плагіна: плагін без секретів явно повертає `secretsOf: () => []`, тож відсутня фікстура — помилка тесту. Альтернатива — лише code review — відхилена: її не видно в CI.

### Throttling

Ядро тримає для кожної сесії «останній надісланий час» і «відкладений стан» (порт `BroadcastLedger`; на serverless пам'ять функції не переживає запит, тож сховище ledger-а — у БД, його дає `add-live-sessions`). Зміни в межах вікна ~500 мс об'єднуються: надсилається лише останній `PublicState`. На serverless без таймерів відкладену трансляцію надсилає наступний запит до сесії або фінальний flush у кінці обробки дії, якщо вікно вже минуло; доповідацький клієнт робить додатковий запит стану, якщо оновлення затримується. Деталі механізму публікації — `openspec/changes/add-live-sessions/design.md`.

## Risks / Trade-offs

- [Плагін випадково кладе секрет у `PublicState`] → тест-хелпер безпеки в CI для кожного плагіна.
- [Затримка закриття раунду, якщо ніхто не робить запитів] → клієнт доповідача запитує стан після `endsAt` (`openspec/changes/add-live-sessions`).
- [Зміна контракту ламає плагіни] → `version` + `migrateConfig` для конфігу; зміни інтерфейсу — лише через оновлення цієї специфікації.
