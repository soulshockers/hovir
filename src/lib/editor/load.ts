import "server-only";

import { isTokenFormat } from "@/lib/access/tokens";
import { getDb, withDbDeadline } from "@/lib/db/client";
import { getServerEnv } from "@/lib/env/server";
import { isServiceUnavailable } from "@/lib/http/responses";
import { resolveConfig } from "@/lib/plugins/config";
import { getRegistry, type PluginRegistry } from "@/lib/plugins/registry";
import { createPresentationRepo } from "@/lib/presentations/repo";
import { findByToken } from "@/lib/presentations/service";
import { createSlideRepo } from "@/lib/slides/repo";
import type { SlideRecord } from "@/lib/slides/service";

import type { EditorData, EditorSlide } from "./types";

export type EditorLoadResult = { status: "ok"; data: EditorData } | { status: "not_found" } | { status: "unavailable" };

/** Конфіг слайда для редактора: міграція й валідація (`resolveConfig`) поточним плагіном з реєстру. */
export function toEditorSlide(slide: SlideRecord, registry: PluginRegistry): EditorSlide {
  const base = { id: slide.id, pluginId: slide.pluginId, pluginVersion: slide.pluginVersion };
  const plugin = registry.get(slide.pluginId);
  if (!plugin) return { ...base, status: "unknown_plugin", config: slide.config };
  const result = resolveConfig(plugin, slide.config, slide.pluginVersion);
  if (result.ok) return { ...base, status: slide.pluginVersion < plugin.version ? "migrated" : "ok", config: result.config };
  return { ...base, status: result.reason, config: slide.config, message: result.issues.map((issue) => issue.message).join("; ") };
}

/** Презентація й слайди для `/e/<editToken>` в межах одного дедлайну БД. Некоректний токен — без запиту до БД. */
export async function loadEditor(token: string, registry: PluginRegistry = getRegistry()): Promise<EditorLoadResult> {
  if (!isTokenFormat(token)) return { status: "not_found" };
  try {
    getServerEnv();
    return await withDbDeadline(async () => {
      const db = getDb();
      const presentations = createPresentationRepo(db);
      const found = await findByToken(presentations, "edit", token);
      if (!found) return { status: "not_found" } as const;
      const [settings, slides] = await Promise.all([presentations.getSettings(found.id), createSlideRepo(db).list(found.id)]);
      if (!settings) return { status: "not_found" } as const;
      return {
        status: "ok",
        data: {
          presentation: {
            id: found.id,
            title: settings.title,
            createdAt: found.createdAt.toISOString(),
            theme: settings.theme,
            locale: settings.locale,
          },
          slides: slides.map((slide) => toEditorSlide(slide, registry)),
          loadedAt: Date.now(),
        },
      } as const;
    });
  } catch (error) {
    if (!isServiceUnavailable(error)) throw error;
    console.error(`[edit] БД або конфігурація недоступні: ${error instanceof Error ? error.name : "error"}`);
    return { status: "unavailable" };
  }
}
