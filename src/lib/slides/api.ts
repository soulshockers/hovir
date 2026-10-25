import { z } from "zod";

import { isTokenFormat } from "@/lib/access/tokens";
import { isPresentationId } from "@/lib/admin/service";
import type { ServerEnv } from "@/lib/env/schema";
import { imageValues, pluginFormTree } from "@/lib/forms/schema";
import type { ApiDeps } from "@/lib/http/deps";
import { bearerToken, readJsonObject } from "@/lib/http/request";
import { errorResponse, jsonError, notFound, type ApiErrorCode } from "@/lib/http/responses";
import { isOwnMediaUrl } from "@/lib/media/urls";
import type { AnySlidePlugin } from "@/lib/plugins";
import { findByToken, type PresentationSummary } from "@/lib/presentations/service";

import {
  createSlide,
  deleteSlide,
  duplicateSlide,
  MAX_SLIDES,
  reorderSlides,
  saveSlideConfig,
  type SlideErrorCode,
  type SlideRecord,
} from "./service";

// API слайдів редактора (openspec/changes/archive/2026-10-25-add-presentation-editor/design.md «API редактора»): edit-токен лише в
// `Authorization: Bearer`; невалідний чи present-токен і чужий слайд — однаковий 404.

const STATUS: Record<SlideErrorCode, number> = {
  not_found: 404,
  unknown_plugin: 400,
  validation_failed: 400,
  conflict: 409,
  slide_locked: 409,
};

const slideError = (code: SlideErrorCode) => jsonError(STATUS[code], code satisfies ApiErrorCode);

export const serializeSlide = (slide: SlideRecord) => ({
  id: slide.id,
  position: slide.position,
  pluginId: slide.pluginId,
  pluginVersion: slide.pluginVersion,
  config: slide.config,
  updatedAt: slide.updatedAt.toISOString(),
});

const createSchema = z.object({ pluginId: z.string().min(1).max(100), afterSlideId: z.uuid().optional() }).strict();
const saveSchema = z.object({ config: z.unknown() }).strict();
const orderSchema = z.object({ ids: z.array(z.uuid()).max(MAX_SLIDES) }).strict();


/**
 * Спільний каркас обробників: формат токена (без БД) → тіло → конфігурація → презентація за edit-токеном у межах
 * дедлайну БД → `work`. Неочікувані помилки — 503/500 без деталей.
 */
async function withEditAccess<T>(
  request: Request,
  deps: ApiDeps,
  options: { slideId?: string; body?: z.ZodType<T> },
  work: (presentation: PresentationSummary, body: T, env: ServerEnv) => Promise<Response>,
): Promise<Response> {
  try {
    const token = bearerToken(request);
    if (!isTokenFormat(token)) return notFound();
    if (options.slideId !== undefined && !isPresentationId(options.slideId)) return notFound();
    let body = undefined as T;
    if (options.body) {
      const parsed = options.body.safeParse((await readJsonObject(request)) ?? null);
      if (!parsed.success) return jsonError(400, "validation_failed");
      body = parsed.data;
    }
    const env = deps.getEnv();
    return await deps.runDb(async () => {
      const presentation = await findByToken(deps.presentations(), "edit", token);
      return presentation ? work(presentation, body, env) : notFound();
    });
  } catch (error) {
    return errorResponse(error, deps.log, deps.connectionUrls());
  }
}

/** `POST /api/presentations/slides`: `{ pluginId, afterSlideId? }` → 201 `{ slide, order }`. */
export function handleCreateSlide(request: Request, deps: ApiDeps): Promise<Response> {
  return withEditAccess(request, deps, { body: createSchema }, async (presentation, body) => {
    const result = await createSlide(deps.slides(), deps.registry(), presentation.id, body);
    if (!result.ok) return slideError(result.code);
    return Response.json({ slide: serializeSlide(result.value.slide), order: result.value.order }, { status: 201 });
  });
}

/** Поля-зображення (`meta.widget = "image"`) приймають лише файли цієї презентації в bucket інстансу. */
const ownImagesOnly = (env: ServerEnv, presentationId: string) => (plugin: AnySlidePlugin, config: unknown) =>
  imageValues(pluginFormTree(plugin), config).every((url) => isOwnMediaUrl(url, env.NEXT_PUBLIC_SUPABASE_URL, presentationId));

/** `PUT /api/presentations/slides/{id}`: повний конфіг → `{ id, pluginVersion, updatedAt }`. */
export function handleSaveSlide(request: Request, slideId: string, deps: ApiDeps): Promise<Response> {
  return withEditAccess(request, deps, { slideId, body: saveSchema }, async (presentation, body, env) => {
    const result = await saveSlideConfig(
      deps.slides(),
      deps.registry(),
      presentation.id,
      slideId,
      body.config,
      ownImagesOnly(env, presentation.id),
    );
    if (!result.ok) return slideError(result.code);
    const { id, pluginVersion, updatedAt } = serializeSlide(result.value);
    return Response.json({ id, pluginVersion, updatedAt });
  });
}

/** `POST /api/presentations/slides/{id}/duplicate` → 201 `{ slide, order }`. */
export function handleDuplicateSlide(request: Request, slideId: string, deps: ApiDeps): Promise<Response> {
  return withEditAccess(request, deps, { slideId }, async (presentation) => {
    const result = await duplicateSlide(deps.slides(), presentation.id, slideId);
    if (!result.ok) return slideError(result.code);
    return Response.json({ slide: serializeSlide(result.value.slide), order: result.value.order }, { status: 201 });
  });
}

/** `DELETE /api/presentations/slides/{id}` → 204. */
export function handleDeleteSlide(request: Request, slideId: string, deps: ApiDeps): Promise<Response> {
  return withEditAccess(request, deps, { slideId }, async (presentation) => {
    const result = await deleteSlide(deps.slides(), presentation.id, slideId);
    return result.ok ? new Response(null, { status: 204 }) : slideError(result.code);
  });
}

/** `PUT /api/presentations/slides/order`: `{ ids }` — перестановка поточних слайдів → 204, інакше 409 `conflict`. */
export function handleReorderSlides(request: Request, deps: ApiDeps): Promise<Response> {
  return withEditAccess(request, deps, { body: orderSchema }, async (presentation, body) => {
    const result = await reorderSlides(deps.slides(), presentation.id, body.ids);
    return result.ok ? new Response(null, { status: 204 }) : slideError(result.code);
  });
}

