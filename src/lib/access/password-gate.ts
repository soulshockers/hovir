import { jsonError, rateLimited } from "@/lib/http/responses";
import type { RateLimiter } from "@/lib/rate-limit/store";

import { checkInstancePassword } from "./password";

/**
 * Перевірка `INSTANCE_PASSWORD` зі спільним лімітом невдалих спроб (створення і `/admin`).
 * Повертає відповідь-відмову або `null`, якщо пароль правильний. Коли ліміт вичерпано — 429 навіть для правильного пароля.
 */
export async function passwordGate(
  limiter: RateLimiter,
  clientKey: string,
  configured: string,
  provided: unknown,
  now: Date,
): Promise<Response | null> {
  const blocked = await limiter.peek(clientKey, "password_fail", now);
  if (!blocked.allowed) return rateLimited(blocked.retryAfterSeconds);

  const check = checkInstancePassword(configured, provided);
  if (check === "ok") return null;
  if (check === "missing") return jsonError(401, "password_required");
  await limiter.hit(clientKey, "password_fail", now);
  return jsonError(401, "invalid_password");
}
