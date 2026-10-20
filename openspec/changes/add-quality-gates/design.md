# Design

## Context

Vitest і Playwright уже налаштовано в `bootstrap-platform` (smoke-тести без БД); e2e проти окремої dev-бази Supabase з `.env.local` (production-база окрема) додала зміна `openspec/changes/archive/2026-10-20-add-presentation-access/design.md`. Ліміти Supabase Free (орієнтовно; перевірити перед релізом): ~200 одночасних Realtime-з'єднань, обмеження на кількість повідомлень за секунду і за місяць (кожна доставка кожному клієнту рахується як повідомлення). Розрахунок для 100 учасників: throttling 2 повідомлення/с × 100 клієнтів = ~200 доставок/с у пік гри. Мотивацію див. `proposal.md`.

## Decisions

- **CSP з nonce:** nonce генерується в middleware/proxy Next.js на кожен запит і передається в заголовок і в теги скриптів; `connect-src` містить `NEXT_PUBLIC_SUPABASE_URL` (https і wss). Для `/api/*` CSP не потрібен.
- **Markdown:** рендерер без підтримки сирого HTML (наприклад, `react-markdown` без `rehype-raw`) + фільтр URL-схем посилань і зображень.
- **E2E:** один test-файл з кількома `browser.newContext()`; слухачі — мобільний viewport. Realtime у локальному прогоні: якщо локального Supabase Realtime немає, клієнти отримують стан через знімок `GET /api/sessions/:id/state` (той самий шлях, що й після перепідключення), тож сценарій перевіряє логіку без живого Supabase; окремий прогін проти розгорнутого інстансу перевіряє Realtime.
- **Навантажувальний скрипт:** Node-скрипт (`scripts/load-test.ts`, `pnpm load-test --url … --present …`) на `@supabase/supabase-js` для підписок і `fetch` для дій; рахує затримку від дії до отримання broadcast на «екрані доповідача» (окремий підписник) і час HTTP-відповіді.

## Risks / Trade-offs

- [Навантажувальний тест витрачає місячний ліміт повідомлень Free] → скрипт друкує оцінку кількості повідомлень і вимагає підтвердження перед запуском.
- [Flaky E2E через realtime-затримки] → очікування на стан через `expect.poll`, а не фіксовані паузи.
