// Спільні сталі e2e-набору з БД (без залежностей від Playwright, щоб імпортувати в конфіг).

export const E2E_PORTS = { smoke: 3100, open: 3201, protected: 3202 } as const;

/** Тестовий пароль «захищеного» інстансу (лише для локальної dev-бази). */
export const E2E_INSTANCE_PASSWORD = "e2e-instance-password";

/** Адреса тестового клієнта з документаційного діапазону 198.51.100.0/24. */
export const testClientIp = (n: number) => `198.51.100.${n}`;
