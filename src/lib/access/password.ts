import { createHmac, timingSafeEqual } from "node:crypto";

export type PasswordCheck = "not_configured" | "missing" | "invalid" | "ok";

// Порівнюємо HMAC-дайджести однакової довжини: час не залежить ні від довжини, ні від збігу префікса.
const digest = (value: string) => createHmac("sha256", "instance-password").update(value, "utf8").digest();

export function isPasswordConfigured(configured: string | undefined): configured is string {
  return typeof configured === "string" && configured.length > 0;
}

/** Перевіряє наданий пароль проти `INSTANCE_PASSWORD` у сталий час. */
export function checkInstancePassword(configured: string | undefined, provided: unknown): PasswordCheck {
  if (!isPasswordConfigured(configured)) return "not_configured";
  if (typeof provided !== "string" || provided.length === 0) return "missing";
  return timingSafeEqual(digest(configured), digest(provided)) ? "ok" : "invalid";
}
