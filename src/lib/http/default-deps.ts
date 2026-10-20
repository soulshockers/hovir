import "server-only";

import { createAdminRepo } from "@/lib/admin/repo";
import { getDb, withDbDeadline } from "@/lib/db/client";
import { getServerEnv, getServerEnvResult } from "@/lib/env/server";
import { createPresentationRepo } from "@/lib/presentations/repo";
import { createRateLimiter } from "@/lib/rate-limit/store";

import type { ApiDeps } from "./deps";

export const defaultApiDeps: ApiDeps = {
  getEnv: getServerEnv,
  presentations: () => createPresentationRepo(getDb()),
  admin: () => createAdminRepo(getDb()),
  limiter: () => createRateLimiter(getDb()),
  runDb: (work) => withDbDeadline(work),
  now: () => new Date(),
  log: (message) => console.error(message),
  connectionUrls: () => {
    const result = getServerEnvResult();
    if (!result.ok) return [];
    return [result.env.POSTGRES_URL, result.env.POSTGRES_URL_NON_POOLING].filter((url): url is string => !!url);
  },
};
