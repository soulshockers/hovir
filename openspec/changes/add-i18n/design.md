# Design

## Context

`DEFAULT_LOCALE` уже валідується (`openspec/specs/runtime-config/spec.md`: `uk` або `en`, дефолт `uk`). Поле `presentations.locale` (`uk|en|auto`) створює `openspec/changes/add-presentation-access`. Контракт плагінів має поле `i18n: Record<Locale, Record<string, string>>` (`openspec/changes/add-slide-plugin-system`). Мотивацію див. `proposal.md`.

## Decisions

### Бібліотека
next-intl (або аналог з тими ж можливостями для App Router і серверних компонентів). Мова визначається на сервері без locale-префікса в URL: маршрути `/e/…`, `/p/…`, `/<code>` лишаються без змін, бо посилання й QR не повинні залежати від мови.

### Визначення мови
- Сторінки автора, доповідача, `/admin`, `/health`, головна — `DEFAULT_LOCALE`.
- Екрани слухача — `presentations.locale` (зі знімка сесії); для `auto` — `Accept-Language` браузера (перший з `uk`/`en`), інакше `DEFAULT_LOCALE`. Рішення для `auto` фіксується при вході слухача, щоб нік і UI були однією мовою.

### Ніки
Словники `uk` та `en` («прикметник + тварина») у репозиторії; для `uk` прикметник узгоджується з родом тварини (окремі форми чоловічого/жіночого роду). Мова ніка — мова інтерфейсу слухача. Унікальність у межах сесії забезпечує `add-live-sessions`.

### Перевірка повноти
Unit-тест порівнює ключі `messages/uk.json` ↔ `messages/en.json` і `plugins/<id>/i18n/uk.json` ↔ `en.json` для кожного зареєстрованого плагіна.

## Risks / Trade-offs

- [Слухачі з однієї сесії бачать різні мови при `auto`] → очікувано; вміст слайдів однаковий, різняться лише рядки UI.
- [Образливі поєднання слів у ніках] → словники перевіряються вручну при кожному PR.
