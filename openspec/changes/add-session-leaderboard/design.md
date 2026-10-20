# Design

## Context

Мотивацію див. `proposal.md` (Why). Очки повертає опційний `scores?(state): Record<string /*participantId*/, number>; // 0..1000` контракту `SlidePlugin` (`openspec/changes/add-slide-plugin-system/design.md`) для плагінів зі `scoring: true`. Сесії, учасники й знімок стану — `openspec/changes/add-live-sessions`.

## Goals / Non-Goals

**Goals:** один механізм очок для всіх ігрових плагінів; лідерборд обчислюється на сервері й транслюється агреговано.

**Non-Goals:** історія лідербордів між сесіями, експорт (окремі зміни).

## Decisions

### Модель даних (чорновик)

```
scores                            -- для скрізного лідерборду
  session_id, slide_id, participant_id, points int
  pk (session_id, slide_id, participant_id)
```

- RLS увімкнено, доступ лише через service role (як і для решти таблиць).
- Upsert за pk під час закриття раунду: повторне закриття слайда перезаписує очки слайда.
- Лідерборд — `SUM(points)` по `(session_id, participant_id)` без кікнутих учасників; топ і місце конкретного учасника обчислюються на сервері.

### Трансляція
Топ лідерборду входить у `PublicState` слайда `leaderboard` і оверлею; місце й сума слухача — у його `PlayerView`/знімку стану, а не в broadcast (персональні дані йдуть через HTTP).

### Слайд `leaderboard`
Звичайний плагін у реєстрі (`plugins/leaderboard/`), без конфігу (або з опцією кількості рядків топу), `interactive: false`, `scoring: false`. Оверлей використовує той самий компонент Presenter.

## Risks / Trade-offs

- [Частий перерахунок суми на великих сесіях] → до 100 учасників × кілька слайдів — дешевий агрегатний запит; перераховується лише після закриття раунду.
