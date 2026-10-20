// Тексти помилок API для UI (клієнтський модуль, без серверних залежностей).

export type UiError = { message: string; healthLink?: boolean };

/** Час очікування з `Retry-After` людською мовою. */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  return `${Math.ceil(seconds / 60)} хв`;
}

export async function uiErrorFromResponse(response: Response): Promise<UiError> {
  let code: string | undefined;
  try {
    code = ((await response.json()) as { error?: { code?: string } }).error?.code;
  } catch {
    code = undefined;
  }
  switch (code) {
    case "password_required":
      return { message: "Введіть пароль інстансу." };
    case "invalid_password":
      return { message: "Неправильний пароль інстансу." };
    case "validation_failed":
      return { message: "Назва має містити не більше 120 символів." };
    case "rate_limited": {
      const seconds = Number(response.headers.get("Retry-After")) || 60;
      return { message: `Забагато спроб. Спробуйте знову через ${formatWait(seconds)}.` };
    }
    case "unauthorized":
      return { message: "Сесія майстер-доступу завершилась. Увійдіть знову." };
    case "not_found":
      return { message: "Презентацію не знайдено." };
    case "service_unavailable":
      return { message: "Сервіс тимчасово недоступний: не вдалося звернутися до бази даних.", healthLink: true };
    default:
      return { message: "Щось пішло не так. Спробуйте ще раз.", healthLink: true };
  }
}

export const NETWORK_ERROR: UiError = { message: "Не вдалося з'єднатися із сервером. Перевірте мережу й спробуйте ще раз." };
