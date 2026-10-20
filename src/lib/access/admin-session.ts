import { createHmac, timingSafeEqual } from "node:crypto";

// Сесія майстер-доступу: cookie `<exp>.<підпис>`, ключ підпису виведено з `INSTANCE_PASSWORD`,
// тож зміна пароля інвалідовує всі сесії без окремої env-змінної.

export const ADMIN_COOKIE = "vsm_admin";
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

const sessionKey = (password: string) => createHmac("sha256", password).update("admin-session").digest();
const sign = (password: string, exp: number) =>
  createHmac("sha256", sessionKey(password)).update(`admin:${exp}`).digest("base64url");

export function createAdminSession(password: string, now: Date): { value: string; expiresAt: Date } {
  const exp = Math.floor(now.getTime() / 1000) + ADMIN_SESSION_TTL_SECONDS;
  return { value: `${exp}.${sign(password, exp)}`, expiresAt: new Date(exp * 1000) };
}

export function verifyAdminSession(password: string | undefined, value: string | undefined, now: Date): boolean {
  if (!password || !value) return false;
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return false;
  const exp = Number(match[1]);
  if (exp * 1000 <= now.getTime()) return false;
  const expected = Buffer.from(sign(password, exp));
  const actual = Buffer.from(match[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface CookieOptions {
  httpOnly: true;
  sameSite: "strict";
  secure: boolean;
  path: "/";
  maxAge: number;
}

/** Атрибути cookie сесії; `Secure` — коли запит прийшов по HTTPS. */
export function adminCookieOptions(secure: boolean, maxAge = ADMIN_SESSION_TTL_SECONDS): CookieOptions {
  return { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge };
}
