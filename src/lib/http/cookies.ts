import type { CookieOptions } from "@/lib/access/admin-session";

/** Значення cookie із заголовка `Cookie` запиту. */
export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}
