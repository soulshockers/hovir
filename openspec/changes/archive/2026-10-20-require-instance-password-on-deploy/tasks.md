# Tasks

## 1. Кнопка деплою

- [x] 1.1 Додати до URL кнопки «Deploy to Vercel» у `README.md` параметри `env=INSTANCE_PASSWORD`, `envDescription` (українською: пароль на створення презентацій і майстер-доступ `/admin`, щонайменше 12 символів, збережіть його) і `envLink=https://github.com/soulshockers/hovir#instance_password`, без `envDefaults`; перевірка: розкодування URL скриптом показує наявні `repository-url`, `project-name`, `repository-name`, `stores` і нові `env`, `envDescription`, `envLink` з очікуваними значеннями, а `envDefaults` відсутній

## 2. Документація

- [x] 2.1 Додати в `README.md` розділ `## INSTANCE_PASSWORD` (навіщо пароль, рекомендована довжина ≥ 12 символів, як змінити у Vercel і що це завершує сесії `/admin`, відкритий інстанс після видалення змінної з попередженням на головній); перевірка: GitHub-якір заголовка дорівнює `instance_password`, тобто збігається з `envLink`
- [x] 2.2 Оновити кроки деплою в `README.md` (майстер попросить `INSTANCE_PASSWORD`) і таблицю змінних (`INSTANCE_PASSWORD` — «обов'язкова при деплої кнопкою», опис із посиланням на розділ), а також коментар до `INSTANCE_PASSWORD` у `.env.example`; перевірка: README і `.env.example` не містять тверджень, що деплой кнопкою створює відкритий інстанс, і відповідають сценаріям дельт `instance-deployment` і `runtime-config`

## 3. Перевірка

- [x] 3.1 Прогнати `pnpm lint`, `pnpm typecheck`, `pnpm test` і `openspec validate require-instance-password-on-deploy --strict`; перевірка: усі команди завершуються з кодом 0

## Workflow follow-up

- Заархівувати зміну (`/opsx:archive`) із синхронізацією `instance-deployment` і `runtime-config` в `openspec/specs/`.
