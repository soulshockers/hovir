import type { CheckName, CheckResult, HealthErrorCode } from "./types";

export const CHECK_LABELS: Record<CheckName, string> = {
  config: "Конфігурація (env-змінні)",
  database: "Підключення до Postgres",
  supabaseApi: "Supabase API",
  schema: "Схема БД (міграції)",
};

export const STATUS_LABELS: Record<CheckResult["status"], string> = {
  ok: "Справно",
  error: "Помилка",
  skipped: "Пропущено",
};

export const ERROR_SUMMARIES: Record<HealthErrorCode, string> = {
  config_invalid: "Відсутні або некоректні змінні середовища.",
  unreachable: "Сервіс не відповідає. Ймовірно, безкоштовний проєкт Supabase призупинено через неактивність.",
  auth_failed: "БД відхилила облікові дані підключення.",
  invalid_key: "Supabase відхилив API-ключ.",
  schema_not_initialized: "БД доступна, але міграції ще не застосовано.",
  unknown: "Неочікувана помилка. Деталі — у логах функцій Vercel.",
};

export const ERROR_ACTIONS: Record<HealthErrorCode, string[]> = {
  config_invalid: [
    "Відкрийте проєкт у Vercel → Settings → Environment Variables.",
    "Задайте змінні, перелічені вище (обов'язкові ставить інтеграція Supabase з Vercel Marketplace).",
    "Перезапустіть деплой (Deployments → Redeploy), щоб зміни набули чинності.",
  ],
  unreachable: [
    "Відкрийте дашборд Supabase (supabase.com/dashboard) і знайдіть проєкт цього інстансу.",
    "Якщо проєкт позначено як Paused, натисніть «Restore project» і зачекайте кілька хвилин.",
    "Оновіть цю сторінку. Порада: відкривайте її за день до виступу, бо Supabase Free засинає після 7 днів неактивності.",
  ],
  auth_failed: [
    "Перевірте, чи не змінювали пароль БД у Supabase.",
    "Перепідключіть інтеграцію Supabase у Vercel (Storage) або оновіть POSTGRES_URL і перезапустіть деплой.",
  ],
  invalid_key: [
    "Перевірте NEXT_PUBLIC_SUPABASE_ANON_KEY у Vercel → Settings → Environment Variables.",
    "Якщо ключі в Supabase перевипускали, перепідключіть інтеграцію й перезапустіть деплой.",
  ],
  schema_not_initialized: [
    "Перезапустіть деплой (Deployments → Redeploy): міграції застосовуються автоматично під час білда.",
    "Якщо не допомогло, перегляньте лог білда (рядки з «[migrate]»).",
  ],
  unknown: ["Перегляньте логи функцій у Vercel (рядки з «[health]»)."],
};
