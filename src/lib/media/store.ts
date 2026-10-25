import type { SupabaseClient } from "@supabase/supabase-js";

import { StorageUnavailableError, TimeoutError } from "../db/errors";

import { MEDIA_BUCKET, MEDIA_TYPES, type MediaType } from "./constants";

/** Файли презентацій у Supabase Storage. */
export interface MediaStore {
  /** Зберігає файл під непрогнозованим шляхом `<presentationId>/<uuid>.<ext>` і повертає публічний URL. */
  upload(presentationId: string, bytes: Uint8Array, type: MediaType): Promise<string>;
  /** Видаляє всі файли презентації. */
  removePrefix(presentationId: string): Promise<void>;
}

/** Дедлайн одного звернення до Storage. */
export const STORAGE_DEADLINE_MS = 8000;

const PAGE = 100;
const MAX_PAGES = 1000;

async function withStorageDeadline<T>(work: () => Promise<T>, ms = STORAGE_DEADLINE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError("storage", ms)), ms);
  });
  try {
    return await Promise.race([work(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error || result.data === null) throw new StorageUnavailableError(result.error?.message ?? "порожня відповідь");
  return result.data;
}

/** Реалізація на клієнті Supabase з service role (`getSupabaseAdmin()` у застосунку, власний клієнт у тестах). */
export function createMediaStore(client: SupabaseClient): MediaStore {
  const bucket = () => client.storage.from(MEDIA_BUCKET);

  return {
    async upload(presentationId, bytes, type) {
      const path = `${presentationId}/${crypto.randomUUID()}.${MEDIA_TYPES[type]}`;
      await withStorageDeadline(async () =>
        unwrap(await bucket().upload(path, bytes, { contentType: type, upsert: false, cacheControl: "31536000" })),
      );
      return bucket().getPublicUrl(path).data.publicUrl;
    },

    // Список сторінками й видалення, доки папка не спорожніє. Пряме `DELETE FROM storage.objects` Supabase забороняє.
    async removePrefix(presentationId) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const files = await withStorageDeadline(async () => unwrap(await bucket().list(presentationId, { limit: PAGE })));
        if (files.length === 0) return;
        const paths = files.map((file) => `${presentationId}/${file.name}`);
        await withStorageDeadline(async () => unwrap(await bucket().remove(paths)));
      }
      throw new StorageUnavailableError(`Забагато файлів у ${presentationId}/`);
    },
  };
}
