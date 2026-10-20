import { createHash } from "node:crypto";

// Секретні edit/present-токени (openspec/changes/add-presentation-access/design.md «Токени»).

const TOKEN_BYTES = 32; // 256 біт
/** base64url без доповнення: 32 байти → 43 символи. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))).toString("base64url");
}

/** Перевірка формату до звернення в БД: некоректний токен не породжує запиту. */
export function isTokenFormat(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** SHA-256 у hex — так токен зберігається й шукається в БД. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
