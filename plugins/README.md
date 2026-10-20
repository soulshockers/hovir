# Плагіни слайдів

Кожен тип слайда — окрема папка `plugins/<id>/`, зареєстрована в `plugins/index.ts` (масив плагінів). Новий тип слайда додається через PR у основний репозиторій або у власний форк.

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

Контракт плагіна (`SlidePlugin`) і тест-хелпер безпеки визначає окрема зміна «контракт плагінів»: [openspec/changes/add-slide-plugin-system/design.md](../openspec/changes/add-slide-plugin-system/design.md). Поки реєстр порожній.

Імпорт у коді застосунку: `import { plugins } from "@plugins/index";`.
