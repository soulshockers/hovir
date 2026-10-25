# Плагіни слайдів

Кожен тип слайда — окрема папка `plugins/<id>/`, зареєстрована в `plugins/index.ts` (масив плагінів). Новий тип слайда додається через PR у основний репозиторій або у власний форк. Вимоги — [openspec/specs/slide-plugin-contract](../openspec/specs/slide-plugin-contract/spec.md) і [openspec/specs/slide-plugin-runtime](../openspec/specs/slide-plugin-runtime/spec.md), рішення — [design.md зміни](../openspec/changes/archive/2026-10-21-add-slide-plugin-system/design.md).

```
plugins/
  <id>/                 # назва папки = id плагіна
    index.ts            # маніфест: defineSlidePlugin({...})
    schema.ts           # zod-схема конфігу
    server.ts           # init, handleAction, tick, toPublic/toPlayer, scores
    Presenter.tsx       # екран доповідача
    Audience.tsx        # екран слухача
    Preview.tsx         # (опц.) мініатюра в редакторі
    i18n/{uk,en}.json
    server.test.ts      # unit-тести логіки (Vitest)
    security.fixture.ts # фікстура тест-хелпера безпеки
  index.ts              # реєстр
```

## Контракт

Плагін оголошується через `defineSlidePlugin` з `@/lib/plugins` — він перевіряє маніфест проти контракту `SlidePlugin<Config, State, PublicState, PlayerView, Action>` і зберігає точні типи всередині плагіна:

- `id`, `version` (версія формату конфігу), `meta` (`title`, `icon`, `category`: `content` | `poll` | `game`), `interactive` (`false` → слухач бачить «Дивіться на екран»), `scoring`, `i18n`.
- Редактор: `configSchema` (zod; з неї генерується форма), `defaultConfig` (мусить проходити схему), `migrateConfig(old, fromVersion)` — коли зростає `version`.
- Сервер (виконується лише в API routes): `init(config, ctx)`, `handleAction(state, action, actor, ctx)` → `{ state, reply?, broadcast?, events? }`, `validateAction` (zod), `tick?`, `toPublic`, `toPlayer`, `scores?`, `exportRows?`.
- Клієнт: `Presenter` (`config`, `state: PublicState`, `controls`), `Audience` (`config`, `state: PublicState`, `me: PlayerView`, `dispatch`), `Preview?`. Компоненти ніколи не отримують `State`. Компонент із хуками позначайте `"use client"`.

`handleAction` не отримує конфіг: усе потрібне з нього `init` кладе в `State`.

## Форма редактора

Редактор (`/e/<editToken>`) сам генерує форму налаштувань слайда з `configSchema` — окремого UI писати не треба ([design.md зміни редактора](../openspec/changes/archive/2026-10-25-add-presentation-editor/design.md), «Форма з zod-схеми»). Генератор читає схему через `z.toJSONSchema` (вихідний тип), тож підтримуються:

| zod | поле форми |
|---|---|
| `z.string()` з `.min()`/`.max()` | текстове поле з лічильником |
| `.meta({ widget: "markdown" })` на рядку | textarea |
| `.meta({ widget: "image" })` на рядку | завантаження зображення; значення — URL у Storage інстансу |
| `.meta({ widget: "color" })` на рядку | вибір кольору |
| `z.number()` / `.int()` з межами | числове поле |
| `z.boolean()` | перемикач |
| `z.enum([...])`, `z.literal()` | radio (≤ 4 варіанти) або select |
| `z.array(...)` з `.min()`/`.max()` | список з додаванням/видаленням |
| `z.object({...})` | група полів |
| `.nullable()`, `.optional()` | перемикач «Без значення» |

Підпис поля — `.meta({ label: "<ключ>" })`, текст береться з `i18n.uk` плагіна (без перекладу показується ключ, без `label` — назва поля). `.refine()` працює (помилка показується біля поля за `path`), а `transform`, `z.record`, `union` різних типів, `z.date()` і рекурсивні схеми форма показати не може — `pnpm test` (тест «генератор форм підтримує схеми всіх плагінів реєстру») назве плагін і поле.

Сервер перевіряє, що поля з `widget: "image"` містять лише URL файлів цієї ж презентації — сторонні зображення відхиляються.

```ts
configSchema: z.object({
  question: z.string().min(1).max(200).meta({ label: "field.question" }),
  details: z.string().max(2000).meta({ label: "field.details", widget: "markdown" }),
  image: z.string().nullable().meta({ label: "field.image", widget: "image" }),
  options: z.array(z.string().min(1).max(80)).min(2).max(8).meta({ label: "field.options" }),
  mode: z.enum(["single", "multiple"]).meta({ label: "field.mode" }),
}),
```

### Превʼю

Центр редактора показує ваш `Presenter` у кадрі 16:9 з `state = toPublic(init(config, ctx))`, обчисленим **у браузері** з фіктивним `ctx` (без учасників, фіксований час, детермінований `random`). Тому `init` і `toPublic` мусять бути чистими: без мережі, без глобального стану й без звернень до `window`. `handleAction`, `tick`, `toPlayer` і `scores` у браузері не викликаються, а стан превʼю нікуди не зберігається. Якщо `Presenter` кидає виняток, редактор показує «Превʼю недоступне». Мініатюри в списку — `Preview`, якщо він є, інакше зменшений `Presenter`.

## Правила

1. **`handleAction` — чиста детермінована функція.** Час і випадковість — лише через `ctx.now()` і `ctx.random()` (криптографічний). Без `Date.now()`, `Math.random()`, мережі й мутацій вхідного стану.
2. **Секрети — лише в `State`.** Задумані числа й правильні відповіді не повертаються з `toPublic`/`toPlayer`, доки раунд не закрито. Це перевіряє тест-хелпер безпеки для кожного плагіна з реєстру.
3. **Таймери ліниві.** Плагін зберігає `endsAt` у стані (і віддає його в `PublicState` для таймера на клієнтах), а `tick(state, ctx)` закриває раунд, коли `ctx.now() >= endsAt`. Ядро викликає `tick` перед кожною дією й запитом стану; фонових процесів немає. `tick` повертає `null`, якщо нічого не змінилося.
4. **Очки** (`scoring: true`): `scores(state)` повертає цілі 0..1000 за слайд по `participantId`. Інакше ядро кидає помилку.
5. **Трансляції обмежує ядро** (не частіше ніж раз на 500 мс на сесію). Персональне — у `reply` і `toPlayer`, не в `PublicState`. `broadcast: false` — дія не змінила публічного стану.
6. **Імпорти.** Із застосунку — лише `@/lib/plugins` і `@/lib/plugins/testing`. БД, `@/lib/*`, `src/app`, `server-only`, `next/*`, `drizzle-orm` заборонені правилом ESLint для `plugins/**` (`pnpm lint`): контракт має пережити винесення плагінів у npm-пакети.

## Приклад

Мінімальний плагін «Оплески» (усе в одному файлі; у справжньому плагіні розкладіть по файлах зі схеми вище):

```ts
// plugins/applause/index.tsx
import { z } from "zod";

import { defineSlidePlugin } from "@/lib/plugins";

export interface ApplauseState {
  claps: Record<string, number>;
  limit: number;
}

export const applausePlugin = defineSlidePlugin({
  id: "applause",
  version: 1,
  meta: { title: "title", icon: "hand", category: "poll" },
  interactive: true,
  scoring: false,
  configSchema: z.object({ limit: z.number().int().min(1).max(100) }),
  defaultConfig: { limit: 10 },
  server: {
    init: (config): ApplauseState => ({ claps: {}, limit: config.limit }),
    handleAction: (state, _action, actor) => {
      if (actor.kind !== "participant") return { state, broadcast: false };
      const mine = state.claps[actor.participantId] ?? 0;
      if (mine >= state.limit) return { state, reply: { accepted: false }, broadcast: false };
      return { state: { ...state, claps: { ...state.claps, [actor.participantId]: mine + 1 } }, reply: { accepted: true } };
    },
    validateAction: z.object({ type: z.literal("clap") }),
    toPublic: (state) => ({ total: Object.values(state.claps).reduce((sum, n) => sum + n, 0) }),
    toPlayer: (state, participantId) => ({ mine: state.claps[participantId] ?? 0, limit: state.limit }),
  },
  Presenter: ({ state }) => <p>👏 {state.total}</p>,
  Audience: ({ me, dispatch }) => (
    <button disabled={me.mine >= me.limit} onClick={() => dispatch({ type: "clap" })}>
      👏 {me.mine}/{me.limit}
    </button>
  ),
  i18n: { uk: { title: "Оплески" }, en: { title: "Applause" } },
});
```

Маніфест із JSX усередині — `index.tsx`; якщо компоненти винесено в `Presenter.tsx`/`Audience.tsx`, маніфест — `index.ts`.

### Тести логіки — `server.test.ts`

Тести проходять без БД і мережі; `fakeCtx` дає фіксований час і задані `random()`. Рантайм ядра (`@/lib/plugins/runtime`) у тестах плагіна не потрібен — викликайте функції `server` напряму.

```ts
// plugins/applause/server.test.ts
import { describe, expect, it } from "vitest";

import { fakeCtx } from "@/lib/plugins/testing";

import { applausePlugin } from ".";

const { server } = applausePlugin;
const alice = { kind: "participant", participantId: "alice" } as const;

describe("applause", () => {
  it("рахує оплески до ліміту", () => {
    const ctx = fakeCtx();
    let state = server.init({ limit: 2 }, ctx);
    for (let i = 0; i < 3; i++) state = server.handleAction(state, { type: "clap" }, alice, ctx).state;
    expect(server.toPublic(state)).toEqual({ total: 2 });
    expect(server.toPlayer(state, "alice")).toEqual({ mine: 2, limit: 2 });
  });
});
```

### Фікстура безпеки — `security.fixture.ts`

Обов'язкова для кожного плагіна з реєстру. Хелпер проганяє `steps` (перед кожним кроком — `tick`, потім `validateAction` і `handleAction`) і після кожного кроку шукає `secretsOf(state)` у JSON `toPublic` і `toPlayer` кожного учасника, доки `isRoundClosed(state)` = `false`. Секрет-рядок шукається й як підрядок, число — як число або рядок. Обирайте кроки так, щоб власна спроба учасника не дорівнювала секрету (інакше `toPlayer` законно містить це значення), а для перевірки таймера використовуйте `advanceMs`.

```ts
// plugins/applause/security.fixture.ts
import type { SecurityFixture } from "@/lib/plugins/testing";

import type { ApplauseState } from ".";

export const securityFixture: SecurityFixture<{ limit: number }, ApplauseState> = {
  config: { limit: 3 },
  participants: [{ participantId: "alice", nickname: "Лис" }],
  steps: [{ actor: { kind: "participant", participantId: "alice" }, action: { type: "clap" } }],
  secretsOf: () => [], // секретів немає
  isRoundClosed: () => false,
};
```

## Додати плагін

1. Створіть `plugins/<id>/` (назва папки = `id`) з маніфестом, `server.test.ts` і `security.fixture.ts`.
2. Додайте плагін у масив `plugins/index.ts`: `import { applausePlugin } from "./applause";` → `export const plugins: readonly AnySlidePlugin[] = [applausePlugin];`.
3. Перевірте: `pnpm typecheck && pnpm lint && pnpm test`. `pnpm test` запускає `plugins/**/*.test.ts`, перевірку `defaultConfig` і тест безпеки для всіх плагінів реєстру; дубль `id` у реєстрі теж валить тести.
