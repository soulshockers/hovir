import { z } from "zod";

// «Мої презентації»: посилання автора в `localStorage` цього браузера (openspec/changes/add-presentation-access/specs/my-presentations).
// Без синхронізації між пристроями; сховище може бути недоступним або містити пошкоджені дані.

export const STORAGE_KEY = "vsm:my-presentations:v1";

const entrySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  createdAt: z.string(),
  editUrl: z.string().optional(),
  presentUrl: z.string().optional(),
});

export type MyPresentation = z.infer<typeof entrySchema>;

/** Мінімальний інтерфейс `Storage`; будь-який виклик може кинути виняток (приватний режим, заблоковане сховище). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type ReadResult = { ok: true; items: MyPresentation[] } | { ok: false };

/** `window.localStorage` або `null`, якщо доступ заборонено. */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Список, найновіші першими. Пошкоджені записи ігноруються. */
export function readMyPresentations(storage: StorageLike | null): ReadResult {
  if (!storage) return { ok: false };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { ok: false };
  }
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  const items = (Array.isArray(parsed) ? parsed : [])
    .map((value) => entrySchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, items };
}

function write(storage: StorageLike, items: MyPresentation[]): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

/** Додає або оновлює запис за `id`: нові посилання замінюють старі, відсутні поля зберігаються. */
export function upsertMyPresentation(storage: StorageLike | null, entry: MyPresentation): boolean {
  const current = readMyPresentations(storage);
  if (!storage || !current.ok) return false;
  const existing = current.items.find((item) => item.id === entry.id);
  const merged: MyPresentation = {
    ...existing,
    ...Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)),
  } as MyPresentation;
  return write(storage, [merged, ...current.items.filter((item) => item.id !== entry.id)]);
}

/** Прибирає запис зі списку; на презентацію на сервері не впливає. */
export function removeMyPresentation(storage: StorageLike | null, id: string): boolean {
  const current = readMyPresentations(storage);
  if (!storage || !current.ok) return false;
  return write(storage, current.items.filter((item) => item.id !== id));
}
