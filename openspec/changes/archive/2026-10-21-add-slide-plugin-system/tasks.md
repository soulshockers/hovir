# Tasks

## 1. Контракт і реєстр

- [x] 1.1 Створити `src/lib/plugins/contract.ts` з `SlidePlugin`, допоміжними типами (`Actor`, `ActionResult`, `ServerCtx`, `ParticipantInfo`, `FeedEvent`, `PresenterControls`, `I18nKey`), `Locale` = `(typeof LOCALES)[number]` з `src/lib/env/schema.ts`, тип-стертим `AnySlidePlugin` і `defineSlidePlugin`, плюс `src/lib/plugins/index.ts` з реекспортом; перевірка: `pnpm typecheck` проходить, а `tests/unit/plugins-contract.test.ts` з `// @ts-expect-error` на `category: 'quiz'` і на `Audience`, що приймає `State`, не дає помилок `tsc` (тобто обидва порушення ловляться типами)
- [x] 1.2 Типізувати `plugins/index.ts` як `readonly AnySlidePlugin[]` (поки порожній) і додати `src/lib/plugins/registry.ts` з `getPlugin(id)` та перевіркою унікальності `id` при першому зверненні; перевірка: `tests/unit/plugins-registry.test.ts` — пошук за `id`, `undefined` для невідомого, помилка з назвою дубля для двох фікстурних плагінів з однаковим `id`
- [x] 1.3 Додати фікстурні плагіни для тестів ядра в `tests/unit/plugin-fixtures.ts` (лічильник без секретів; «вгадай число» з секретом, таймером `endsAt`/`tick`, `scores`, `version: 2` з `migrateConfig`); перевірка: `pnpm typecheck` і використання в тестах груп 2–5

## 2. Конфіг і міграція конфігу

- [x] 2.1 Реалізувати `resolveConfig(plugin, raw, storedVersion)` у `src/lib/plugins/config.ts`: `migrateConfig`, якщо `storedVersion < version`; помилка, якщо міграції немає або `storedVersion > version`; валідація `configSchema` з результатом `{ ok: true, config } | { ok: false, issues }`; перевірка: `tests/unit/plugins-config.test.ts` — v1→v2 мігрує й проходить схему, невалідний конфіг дає `ok: false` з issues, поточна версія не викликає `migrateConfig`
- [x] 2.2 Додати параметризований реєстром тест `configSchema.parse(defaultConfig)` для кожного плагіна з `plugins/index.ts` (і для фікстурних); перевірка: `pnpm test` проходить, а зламаний `defaultConfig` у фікстурі валить тест з `id` плагіна

## 3. Рантайм: стан, дії, таймери, очки

- [x] 3.1 Описати порт `SlideStateStore` (`withSlideState(key, fn)`, ключ — сесія + слайд) і `memorySlideStateStore` з серіалізацією на ключ у `src/lib/plugins/store.ts`, а контрактний набір тестів порту винести в `src/lib/plugins/testing/store-contract.ts` (для повторного використання Postgres-реалізацією в `add-live-sessions`); перевірка: `tests/unit/plugins-store.test.ts` проганяє набір для пам'яті — 50 паралельних інкрементів одного ключа дають 50, різні ключі не чекають один одного
- [x] 3.2 Додати `createServerCtx` (`Date.now`, криптографічний `random` через `crypto.getRandomValues`) у `src/lib/plugins/ctx.ts` і `fakeCtx({ now, randoms, participants, locale })` у `src/lib/plugins/testing/`; перевірка: unit-тест — `random()` у `[0, 1)`, `fakeCtx` повертає задані значення по черзі
- [x] 3.3 Реалізувати `ensureSlideState` у `src/lib/plugins/runtime.ts`: `init(config, ctx)` лише за відсутності збереженого стану; перевірка: `tests/unit/plugins-runtime.test.ts` — повторний виклик для того самого слайда не викликає `init` і повертає змінений раніше стан
- [x] 3.4 Реалізувати `runAction` і `runTick`: `validateAction` (до блокування стану), далі в серіалізованій секції `tick` (якщо є) → `handleAction` → збереження; результат `{ reply, publicState, playerView, broadcast, events }`; невалідна дія — помилка валідації без виклику `handleAction`; перевірка: unit-тести — невалідна дія (шпигун `handleAction` не викликано), дія після `endsAt` закриває раунд через `tick` і не зараховується, `publicState` містить `endsAt`, `broadcast: false` прокидається, дві паралельні дії через `memorySlideStateStore` обидві в стані, детермінованість (двічі той самий вхід з `fakeCtx` → однаковий результат)
- [x] 3.5 Реалізувати `collectScores(plugin, state)`: `{}` для `scoring: false`, помилка з `id` плагіна для нецілого значення чи поза 0..1000; перевірка: unit-тести на всі три випадки на фікстурі «вгадай число»

## 4. Throttling трансляцій

- [x] 4.1 Реалізувати чисте `planBroadcast(ledger, publicState, now)` з вікном 500 мс у `src/lib/plugins/throttle.ts` і порт `BroadcastLedger` (останній час надсилання + відкладений стан); рішення — «надіслати зараз» або «відкласти й об'єднати», а `flushDue(ledger, now)` надсилає відкладений стан після вікна; перевірка: `tests/unit/plugins-throttle.test.ts` з фіктивним годинником — 100 оновлень за 1 с дають ≤ 3 надсилання, останнє надіслане — фінальний стан, відкладений стан надсилається першим викликом після вікна, `broadcast: false` нічого не планує
- [x] 4.2 Додати JSDoc до `planBroadcast`/`BroadcastLedger` про те, що сховище ledger-а й публікацію в канал `session:<id>` дає `add-live-sessions`; перевірка: `pnpm lint` і `pnpm typecheck` проходять

## 5. Тест-хелпер безпеки

- [x] 5.1 Реалізувати `SecurityFixture` і `checkPluginSecrets(plugin, fixture)` у `src/lib/plugins/testing/security.ts`: прогін дій з `fakeCtx`, серіалізація `toPublic` і `toPlayer` кожного учасника після кожного кроку, пошук секретів (`secretsOf`) у JSON, доки `isRoundClosed` = false; помилка називає плагін, крок, функцію і JSON-шлях; перевірка: `tests/unit/plugins-security-helper.test.ts` — «протікаючий» фікстурний плагін падає з очікуваним повідомленням, коректний проходить, розкриття після закриття раунду не є помилкою
- [x] 5.2 Додати `tests/unit/plugins-security.test.ts`, що під час запуску (`readdirSync` + динамічний `import()`; `import.meta.glob` відкинуто, бо його результат застаряє в персистентному кеші трансформацій Vitest) знаходить `plugins/*/security.fixture.ts` і проганяє `checkPluginSecrets` для кожного плагіна з реєстру; плагін без фікстури — падіння з його `id`; перевірка: `pnpm test` проходить з порожнім реєстром, а тимчасовий плагін у реєстрі без фікстури валить тест (прибрати після перевірки)

## 6. Межі плагінів і тестова інфраструктура

- [x] 6.1 Розширити `include` у `vitest.config.mts` на `plugins/**/*.test.ts`; перевірка: тимчасовий `plugins/_probe/server.test.ts` виконується в `pnpm test` (прибрати після перевірки)
- [x] 6.2 Додати в `eslint.config.mjs` блок `files: ["plugins/**"]` з `no-restricted-imports`: дозволено `@/lib/plugins`, заборонено інші `@/…`, `server-only`, `next/*`, `postgres`, `drizzle-orm`; перевірка: тимчасовий імпорт `@/lib/db/client` у файлі `plugins/**` валить `pnpm lint` з повідомленням правила, після видалення `pnpm lint` проходить
- [x] 6.3 Додати `src/lib/plugins/AudienceSlot.tsx`: для `interactive: false` — екран «Дивіться на екран», інакше `Audience` з `config`, `state`, `me`, `dispatch`; перевірка: `tests/unit/plugins-audience-slot.test.ts` через `renderToString` з `react-dom/server` — неінтерактивний плагін дає текст «Дивіться на екран», інтерактивний — розмітку `Audience`

## 7. Документація для авторів плагінів

- [x] 7.1 Переписати `plugins/README.md`: дерево файлів плагіна (з `security.fixture.ts`), `defineSlidePlugin` і короткий опис контракту, правила (чистий `handleAction`, секрети лише в `State`, `endsAt` + `tick`, очки 0..1000, дозволені імпорти лише `@/lib/plugins`), як написати `server.test.ts` і фікстуру безпеки, кроки додавання плагіна в реєстр; перевірка: приклад коду з README компілюється як тимчасовий плагін (`pnpm typecheck`, `pnpm lint`, `pnpm test` проходять; прибрати після перевірки), а команди в README виконуються як написано
- [x] 7.2 Оновити рядок «Статус» і таблицю команд у `README.md`: `pnpm test` запускає також тести з `plugins/` і тест безпеки плагінів; перевірка: перегляд diff `README.md` і `pnpm test`

## 8. Інтеграційна перевірка

- [x] 8.1 Прогнати повний набір перевірок: `pnpm typecheck && pnpm lint && pnpm test` проходять без `.env.local` (без живого Supabase), і `pnpm exec next build` (без кроку міграцій) збирається з новими модулями
- [x] 8.2 Звірити реалізацію зі специфікаціями: кожна вимога `slide-plugin-contract` і `slide-plugin-runtime` має тест або перевірку типів/лінту з груп 1–7; `openspec validate add-slide-plugin-system --strict` проходить

## Workflow follow-up

- Postgres-реалізацію `SlideStateStore` і `BroadcastLedger`, HTTP-маршрути дій/стану й інтеграційні тести з dev-базою робить `openspec/changes/add-live-sessions` (з контрактним набором з 3.1).
- Архівувати зміну після рев'ю; перевірити, що `openspec/specs/slide-plugin-contract` і `openspec/specs/slide-plugin-runtime` з'явилися після архіву.
