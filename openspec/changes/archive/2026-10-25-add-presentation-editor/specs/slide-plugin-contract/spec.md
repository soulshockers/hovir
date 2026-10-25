# Spec Delta

## Purpose

Єдиний контракт типів слайдів-плагінів; ця зміна дозволяє редактору обчислювати публічний стан для превʼю в браузері, не послаблюючи серверне виконання логіки сесій.

## MODIFIED Requirements

### Requirement: Серверна частина плагіна
Плагін SHALL надавати серверні функції: `init(config, ctx)` (стан при першому показі), `handleAction(state, action, actor, ctx)` (новий стан + відповідь актору), `validateAction` (zod), `toPublic(state)`, `toPlayer(state, participantId)`, і опційно `tick`, `scores`, `exportRows`. Для живих сесій вони MUST виконуватися лише на сервері (в API routes); єдиний виняток описує вимога «Превʼю редактора в браузері».

#### Scenario: Невалідна дія
- **WHEN** учасник надсилає дію, що не проходить `validateAction`
- **THEN** сервер відхиляє її без виклику `handleAction`

## ADDED Requirements

### Requirement: Превʼю редактора в браузері
Для превʼю редактора `init` і `toPublic` MAY виконуватися в браузері над конфігом самого автора з фіктивним `ctx` без учасників. Такий стан MUST NOT зберігатися чи надсилатися на сервер, а `handleAction`, `tick`, `toPlayer` і `scores` у браузері MUST NOT викликатися.

#### Scenario: Превʼю в редакторі
- **WHEN** автор редагує слайд у редакторі
- **THEN** превʼю отримує стан з `toPublic(init(config, ctx))`, обчислений у браузері, і жоден запит до API сесій не надсилається
