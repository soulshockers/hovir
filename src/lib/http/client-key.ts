import { createHmac } from "node:crypto";

// Ідентифікація клієнта для rate limiting без збереження IP (openspec/specs/rate-limiting).

interface HeaderSource {
  get(name: string): string | null;
}

/** IP, визначена платформою хостингу: `x-real-ip`, інакше перший елемент `x-forwarded-for`. */
export function clientIpFromHeaders(headers: HeaderSource): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/** Непрозорий ключ клієнта: HMAC IP-адреси з секретом, виведеним із `SUPABASE_SERVICE_ROLE_KEY`. */
export function deriveClientKey(ip: string, serviceRoleKey: string): string {
  const secret = createHmac("sha256", serviceRoleKey).update("rate-limit").digest();
  return createHmac("sha256", secret).update(ip).digest("hex");
}
