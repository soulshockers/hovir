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

### Правила для авторів плагінів

- `handleAction` — чиста детермінована функція (час і випадковість отримує лише через `ctx`). Завдяки цьому вона легко покривається unit-тестами.
- Секрети живуть лише в `State`. `toPublic`/`toPlayer` **ніколи** їх не повертають (до завершення раунду). Ядро має тест-хелпер, який перевіряє це для кожного плагіна.
- Таймери: ядро зберігає `endsAt`. Закриття раунду виконується ліниво: на будь-якій дії/запиті стану викликається `tick`. Доповідацький клієнт також надсилає `tick`, коли таймер спливає. Фонових процесів на serverless немає.
- Ядро саме відповідає за throttling трансляцій: `PublicState` надсилається не частіше ніж раз на ~500 мс на сесію (з об'єднанням змін).

### Тест-хелпер безпеки

Плагін декларує (у тестовому модулі) фікстуру: конфіг, послідовність дій і функцію `secretsOf(state)`, що повертає значення-секрети. Хелпер проганяє дії через `handleAction` з детермінованим `ctx`, після кожного кроку серіалізує `toPublic(state)` і `toPlayer(state, id)` для кожного учасника й перевіряє, що жоден секрет не входить у JSON, поки `round_status` ≠ `closed`. Тест автоматично параметризується всіма плагінами з `plugins/index.ts`; плагін без фікстури, що має секрети, вважається помилкою тесту. Альтернатива — лише code review — відхилена: її не видно в CI.

### Throttling

Ядро тримає для кожної сесії «останній надісланий час» і «відкладений стан». Зміни в межах вікна ~500 мс об'єднуються: надсилається лише останній `PublicState`. На serverless без таймерів відкладену трансляцію надсилає наступний запит до сесії або фінальний flush у кінці обробки дії, якщо вікно вже минуло; доповідацький клієнт робить додатковий запит стану, якщо оновлення затримується. Деталі механізму публікації — `openspec/changes/add-live-sessions/design.md`.

## Risks / Trade-offs

- [Плагін випадково кладе секрет у `PublicState`] → тест-хелпер безпеки в CI для кожного плагіна.
- [Затримка закриття раунду, якщо ніхто не робить запитів] → доповідацький клієнт надсилає `tick`, коли таймер спливає.
- [Зміна контракту ламає плагіни] → `version` + `migrateConfig` для конфігу; зміни інтерфейсу — лише через оновлення цієї специфікації.
