# Плагіни слайдів

Кожен тип слайда — окрема папка `plugins/<id>/`, зареєстрована в `plugins/index.ts` (SPEC.md 5.1).

```
plugins/
  <id>/
    index.ts        # маніфест плагіна
    schema.ts       # zod-схема конфігу
    server.ts       # обробка дій, підрахунок очок
    Presenter.tsx   # екран доповідача
    Audience.tsx    # екран слухача
    i18n/{uk,en}.json
  index.ts          # реєстр
```

Контракт плагіна (`SlidePlugin`) і тест-хелпер безпеки визначає окрема зміна «контракт плагінів» (SPEC.md 5.2–5.3). Поки реєстр порожній.

Імпорт у коді застосунку: `import { plugins } from "@plugins/index";`.
