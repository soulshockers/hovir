import { createClient } from "@supabase/supabase-js";
import type postgres from "postgres";

import { createMediaStore, type MediaStore } from "../../src/lib/media/store";

// Прибирання файлів тестових презентацій у dev-bucket: слайди видаляє каскад БД, а Storage — ні.
// Відносні імпорти — модуль використовують і Vitest, і Playwright (`e2e/db/fixtures.ts`).

let store: MediaStore | undefined;

/** Сховище медіа з service role з `.env.local`. */
export function testMediaStore(): MediaStore {
  store ??= createMediaStore(
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );
  return store;
}

/** Видаляє файли всіх презентацій, назва яких починається з `titlePrefix`. */
export async function removeTestMedia(sql: postgres.Sql, titlePrefix: string): Promise<void> {
  const rows = await sql<{ id: string }[]>`select id from presentations where title like ${titlePrefix + "%"}`;
  for (const { id } of rows) await testMediaStore().removePrefix(id);
}
