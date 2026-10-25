import "server-only";

import { createAdminRepo } from "@/lib/admin/repo";
import { getDb, withDbDeadline } from "@/lib/db/client";
import { getServerEnv, getServerEnvResult } from "@/lib/env/server";
import { createMediaStore } from "@/lib/media/store";
import { getRegistry } from "@/lib/plugins/registry";
import { createPresentationRepo } from "@/lib/presentations/repo";
import { createRateLimiter } from "@/lib/rate-limit/store";
import { createSlideRepo } from "@/lib/slides/repo";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import type { ApiDeps } from "./deps";

export const defaultApiDeps: ApiDeps = {
  getEnv: getServerEnv,
  presentations: () => createPresentationRepo(getDb()),
  admin: () => createAdminRepo(getDb()),
  limiter: () => createRateLimiter(getDb()),
  slides: () => createSlideRepo(getDb()),
  media: () => createMediaStore(getSupabaseAdmin()),
  registry: getRegistry,
  runDb: (work) => withDbDeadline(work),
  now: () => new Date(),
  log: (message) => console.error(message),
  connectionUrls: () => {
    const result = getServerEnvResult();
    if (!result.ok) return [];
    return [result.env.POSTGRES_URL, result.env.POSTGRES_URL_NON_POOLING].filter((url): url is string => !!url);
  },
};
