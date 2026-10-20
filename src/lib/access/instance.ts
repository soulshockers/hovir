import "server-only";

import { getServerEnvResult } from "@/lib/env/server";

import { isPasswordConfigured } from "./password";

/** Чи задано `INSTANCE_PASSWORD` (для UI). Значення пароля клієнту не передається. */
export function isInstanceProtected(): boolean {
  const result = getServerEnvResult();
  const value = result.ok ? result.env.INSTANCE_PASSWORD : process.env.INSTANCE_PASSWORD?.trim() || undefined;
  return isPasswordConfigured(value);
}
