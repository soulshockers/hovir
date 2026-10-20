import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getClientEnv } from "@/lib/env/client";

let client: SupabaseClient | undefined;

/** Браузерний клієнт з anon-ключем — лише для підписки на Realtime-канали на читання. */
export function getSupabaseBrowser(): SupabaseClient {
  if (!client) {
    const env = getClientEnv();
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
