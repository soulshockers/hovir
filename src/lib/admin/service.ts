import { generateToken, hashToken } from "@/lib/access/tokens";
import type { PresentationSummary } from "@/lib/presentations/service";

// Майстер-доступ власника інстансу (openspec/changes/add-presentation-access/specs/instance-admin).

export const ADMIN_PAGE_SIZE = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPresentationId = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);

export interface PresentationAdminRepo {
  /** Найновіші першими; без токенів і хешів. */
  list(offset: number, limit: number): Promise<{ items: PresentationSummary[]; total: number }>;
  /** Атомарно замінює обидва хеші; `null`, якщо презентації немає. */
  replaceAllTokenHashes(id: string, editHash: string, presentHash: string): Promise<PresentationSummary | null>;
  /** `false`, якщо презентації вже немає. */
  delete(id: string): Promise<boolean>;
}

export interface AdminPage {
  items: PresentationSummary[];
  page: number;
  pageCount: number;
  total: number;
}

export async function listPresentations(repo: PresentationAdminRepo, page: number): Promise<AdminPage> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const { items, total } = await repo.list((safePage - 1) * ADMIN_PAGE_SIZE, ADMIN_PAGE_SIZE);
  return { items, page: safePage, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

/** Відновлення посилань: у БД лише хеші, тож обидва токени перевипускаються. */
export async function restoreLinks(
  repo: PresentationAdminRepo,
  id: unknown,
): Promise<{ presentation: PresentationSummary; editToken: string; presentToken: string } | null> {
  if (!isPresentationId(id)) return null;
  const editToken = generateToken();
  const presentToken = generateToken();
  const presentation = await repo.replaceAllTokenHashes(id, hashToken(editToken), hashToken(presentToken));
  return presentation ? { presentation, editToken, presentToken } : null;
}

export async function deletePresentation(repo: PresentationAdminRepo, id: unknown): Promise<boolean> {
  if (!isPresentationId(id)) return false;
  return repo.delete(id);
}
