import { randomUUID } from "node:crypto";

import type { PresentationAdminRepo } from "@/lib/admin/service";
import { parseServerEnv, type ServerEnv } from "@/lib/env/schema";
import type { ApiDeps } from "@/lib/http/deps";
import type { MediaStore } from "@/lib/media/store";
import { mediaPublicPrefix } from "@/lib/media/urls";
import { createRegistry } from "@/lib/plugins/registry";
import type { PresentationRepo, PresentationSummary } from "@/lib/presentations/service";
import type { PresentationSettings } from "@/lib/presentations/settings";
import { StorageUnavailableError } from "@/lib/db/errors";
import { MEDIA_TYPES } from "@/lib/media/constants";
import { evaluate, LIMITS } from "@/lib/rate-limit/policy";
import type { RateLimiter } from "@/lib/rate-limit/store";
import type { SlideRecord, SlideRepo, SlideTx } from "@/lib/slides/service";

import { editorSamplePlugin } from "../fixtures/plugins/editor-sample";
import { fixturePlugins } from "./plugin-fixtures";

// Підставні залежності API-обробників: БД у пам'яті та ліміти на чистій логіці вікна.

export const BASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-secret",
  POSTGRES_URL: "postgres://postgres.abcd:pw-Secret1@db-host.internal:6543/postgres",
};

export function serverEnv(overrides: Record<string, string> = {}): ServerEnv {
  const result = parseServerEnv({ ...BASE_ENV, ...overrides });
  if (!result.ok) throw new Error("invalid test env");
  return result.env;
}

interface Row extends PresentationSummary {
  editTokenHash: string;
  presentTokenHash: string;
  theme: PresentationSettings["theme"];
  locale: PresentationSettings["locale"];
}

export function memoryDb() {
  const rows: Row[] = [];
  const calls: unknown[][] = [];
  const summary = ({ id, title, createdAt, updatedAt }: Row): PresentationSummary => ({ id, title, createdAt, updatedAt });
  const settings = ({ id, title, theme, locale, updatedAt }: Row): PresentationSettings => ({ id, title, theme, locale, updatedAt });
  let tick = 0;

  const presentations: PresentationRepo = {
    async insert(row) {
      calls.push(["insert", row]);
      const createdAt = new Date(Date.UTC(2026, 0, 1) + tick++ * 1000);
      const created: Row = { id: randomUUID(), createdAt, updatedAt: createdAt, theme: { preset: "light" }, locale: "auto", ...row };
      rows.push(created);
      return summary(created);
    },
    async findByTokenHash(kind, hash) {
      calls.push(["find", kind, hash]);
      const row = rows.find((r) => (kind === "edit" ? r.editTokenHash : r.presentTokenHash) === hash);
      return row ? summary(row) : null;
    },
    async replaceTokenHash(editHash, kind, newHash) {
      calls.push(["replace", editHash, kind, newHash]);
      const row = rows.find((r) => r.editTokenHash === editHash);
      if (!row) return null;
      if (kind === "edit") row.editTokenHash = newHash;
      else row.presentTokenHash = newHash;
      return summary(row);
    },
    async getSettings(id) {
      calls.push(["getSettings", id]);
      const row = rows.find((r) => r.id === id);
      return row ? settings(row) : null;
    },
    async updateSettings(editHash, patch) {
      calls.push(["updateSettings", editHash, patch]);
      const row = rows.find((r) => r.editTokenHash === editHash);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: new Date(row.updatedAt.getTime() + 1000) });
      return settings(row);
    },
  };

  const admin: PresentationAdminRepo = {
    async list(offset, limit) {
      const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { items: sorted.slice(offset, offset + limit).map(summary), total: rows.length };
    },
    async replaceAllTokenHashes(id, editHash, presentHash) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      row.editTokenHash = editHash;
      row.presentTokenHash = presentHash;
      return summary(row);
    },
    async delete(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
  };

  return { rows, calls, presentations, admin };
}

export function memoryLimiter(): RateLimiter & { hits: Map<string, Date[]> } {
  const hits = new Map<string, Date[]>();
  return {
    hits,
    async hit(key, bucket, now) {
      const list = hits.get(`${key}:${bucket}`) ?? [];
      const result = evaluate(list, now, LIMITS[bucket]);
      if (result.allowed) hits.set(`${key}:${bucket}`, [...list, now]);
      return result;
    },
    async peek(key, bucket, now) {
      return evaluate(hits.get(`${key}:${bucket}`) ?? [], now, LIMITS[bucket]);
    },
  };
}

export function fakeDeps(overrides: Partial<ApiDeps> & { env?: Record<string, string> } = {}) {
  const db = memoryDb();
  const limiter = memoryLimiter();
  const slides = memorySlides();
  const media = memoryMedia();
  const logs: string[] = [];
  const { env, ...rest } = overrides;
  const deps: ApiDeps = {
    getEnv: () => serverEnv(env),
    presentations: () => db.presentations,
    admin: () => db.admin,
    limiter: () => limiter,
    slides: () => slides.repo,
    media: () => media.store,
    registry: () => createRegistry([...fixturePlugins, editorSamplePlugin]),
    runDb: (work) => work(),
    now: () => new Date("2026-10-20T10:00:00Z"),
    log: (message) => logs.push(message),
    connectionUrls: () => [BASE_ENV.POSTGRES_URL],
    ...rest,
  };
  return { deps, db, limiter, logs, slides, media };
}

export const ORIGIN = "https://instance.example";

export function jsonRequest(path: string, body: unknown, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...init.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** `SlideRepo` у пам'яті: `withPresentation` виконується по черзі для кожної презентації, як під блокуванням рядка. */
export function memorySlides() {
  const rows: SlideRecord[] = [];
  const queues = new Map<string, Promise<unknown>>();
  let tick = 0;
  const sorted = (presentationId: string) =>
    rows.filter((row) => row.presentationId === presentationId).sort((a, b) => a.position - b.position).map((row) => ({ ...row }));

  const repo: SlideRepo = {
    async list(presentationId) {
      return sorted(presentationId);
    },
    withPresentation(presentationId, fn) {
      const tx: SlideTx = {
        list: async () => sorted(presentationId),
        async insert(slide) {
          const created: SlideRecord = { id: randomUUID(), presentationId, updatedAt: new Date(Date.UTC(2026, 0, 1) + tick++ * 1000), ...slide };
          rows.push(created);
          return { ...created };
        },
        async remove(id) {
          const index = rows.findIndex((row) => row.id === id && row.presentationId === presentationId);
          if (index >= 0) rows.splice(index, 1);
        },
        async setOrder(ids) {
          ids.forEach((id, position) => {
            const row = rows.find((r) => r.id === id && r.presentationId === presentationId);
            if (row) row.position = position;
          });
        },
        async updateConfig(id, config, pluginVersion) {
          const row = rows.find((r) => r.id === id && r.presentationId === presentationId)!;
          Object.assign(row, { config, pluginVersion, updatedAt: new Date(Date.UTC(2026, 0, 1) + tick++ * 1000) });
          return { ...row };
        },
      };
      const run = (queues.get(presentationId) ?? Promise.resolve()).then(() => fn(tx));
      queues.set(presentationId, run.catch(() => {}));
      return run;
    },
  };
  return { rows, repo };
}

/** Storage у пам'яті: шляхи файлів і журнал викликів. `failing = true` імітує недоступний Storage. */
export function memoryMedia() {
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  const calls: string[] = [];
  const state = { failing: false };
  const store: MediaStore = {
    async upload(presentationId, bytes, type) {
      calls.push(`upload:${presentationId}`);
      if (state.failing) throw new StorageUnavailableError("down");
      const name = `${randomUUID()}.${MEDIA_TYPES[type]}`;
      files.set(`${presentationId}/${name}`, { bytes, type });
      return `${mediaPublicPrefix(BASE_ENV.NEXT_PUBLIC_SUPABASE_URL, presentationId)}${name}`;
    },
    async removePrefix(presentationId) {
      calls.push(`remove:${presentationId}`);
      if (state.failing) throw new StorageUnavailableError("down");
      for (const path of [...files.keys()]) if (path.startsWith(`${presentationId}/`)) files.delete(path);
    },
  };
  return { files, calls, state, store };
}
