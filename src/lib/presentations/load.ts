import "server-only";

import { isTokenFormat } from "@/lib/access/tokens";
import { getDb, withDbDeadline } from "@/lib/db/client";
import { getServerEnv } from "@/lib/env/server";
import { isServiceUnavailable } from "@/lib/http/responses";

import { createPresentationRepo } from "./repo";
import { findByToken, type PresentationSummary, type TokenKind } from "./service";

export type LoadResult =
  | { status: "ok"; presentation: PresentationSummary }
  | { status: "not_found" }
  | { status: "unavailable" };

/** Презентація для сторінок `/e` і `/p`. Некоректний токен — «не знайдено» без звернення до БД. */
export async function loadPresentation(kind: TokenKind, token: string): Promise<LoadResult> {
  if (!isTokenFormat(token)) return { status: "not_found" };
  try {
    getServerEnv();
    const presentation = await withDbDeadline(() => findByToken(createPresentationRepo(getDb()), kind, token));
    return presentation ? { status: "ok", presentation } : { status: "not_found" };
  } catch (error) {
    if (!isServiceUnavailable(error)) throw error;
    console.error(`[${kind}] БД або конфігурація недоступні: ${error instanceof Error ? error.name : "error"}`);
    return { status: "unavailable" };
  }
}
