import { deriveClientKey, clientIpFromHeaders } from "./client-key";

/** JSON-тіло запиту як об'єкт; `undefined`, якщо тіло не є JSON-об'єктом. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Токен із `Authorization: Bearer <token>`; токени в query-рядку не приймаються. */
export function bearerToken(request: Request): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1];
}

export function clientKeyFor(request: Request, serviceRoleKey: string): string {
  return deriveClientKey(clientIpFromHeaders(request.headers), serviceRoleKey);
}

/** `Origin` збігається з адресою інстансу (захист мутацій від міжсайтових запитів). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Чи прийшов запит по HTTPS (для атрибута `Secure` cookie). */
export function isHttps(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (proto ?? new URL(request.url).protocol.replace(":", "")) === "https";
}
