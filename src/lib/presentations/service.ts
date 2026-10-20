import { z } from "zod";

import { generateToken, hashToken, isTokenFormat } from "@/lib/access/tokens";

// Модель доступу до презентацій без акаунтів (openspec/specs/presentation-access).

export const DEFAULT_TITLE = "Нова презентація";
export const MAX_TITLE_LENGTH = 120;

export type TokenKind = "edit" | "present";

export interface PresentationSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Доступ до таблиці `presentations`. Приймає лише хеші токенів — сирі токени сюди не потрапляють. */
export interface PresentationRepo {
  insert(row: { title: string; editTokenHash: string; presentTokenHash: string }): Promise<PresentationSummary>;
  findByTokenHash(kind: TokenKind, hash: string): Promise<PresentationSummary | null>;
  /** Атомарна заміна хешу `kind`-токена презентації з edit-хешем `editHash`; `null`, якщо такої вже немає. */
  replaceTokenHash(editHash: string, kind: TokenKind, newHash: string): Promise<PresentationSummary | null>;
}

/** Назва: обрізається, порожня → «Нова презентація», не довша за 120 символів. */
export const titleSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() || DEFAULT_TITLE)
  .refine((value) => Array.from(value).length <= MAX_TITLE_LENGTH, { message: "title_too_long" });

export const createInputSchema = z.object({
  title: titleSchema,
  password: z.string().max(1024).optional(),
});

export interface CreatedPresentation {
  id: string;
  title: string;
  editToken: string;
  presentToken: string;
}

/** Створює порожню презентацію. Токени повертаються лише цього разу. */
export async function createPresentation(repo: PresentationRepo, title: string): Promise<CreatedPresentation> {
  const editToken = generateToken();
  const presentToken = generateToken();
  const row = await repo.insert({ title, editTokenHash: hashToken(editToken), presentTokenHash: hashToken(presentToken) });
  return { id: row.id, title: row.title, editToken, presentToken };
}

/** Презентація за токеном; некоректний за форматом токен відхиляється без запиту до БД. */
export async function findByToken(repo: PresentationRepo, kind: TokenKind, token: unknown): Promise<PresentationSummary | null> {
  if (!isTokenFormat(token)) return null;
  return repo.findByTokenHash(kind, hashToken(token));
}

/** Перевипуск edit- або present-токена власником edit-посилання. `null` — однакова відповідь «не знайдено». */
export async function reissueToken(
  repo: PresentationRepo,
  editToken: unknown,
  kind: TokenKind,
): Promise<{ presentation: PresentationSummary; token: string } | null> {
  if (!isTokenFormat(editToken)) return null;
  const token = generateToken();
  const presentation = await repo.replaceTokenHash(hashToken(editToken), kind, hashToken(token));
  return presentation ? { presentation, token } : null;
}
