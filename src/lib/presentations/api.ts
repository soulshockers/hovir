import { passwordGate } from "@/lib/access/password-gate";
import { isPasswordConfigured } from "@/lib/access/password";
import { hashToken, isTokenFormat } from "@/lib/access/tokens";
import type { ApiDeps } from "@/lib/http/deps";
import { bearerToken, clientKeyFor, readJsonObject } from "@/lib/http/request";
import { errorResponse, jsonError, notFound, rateLimited } from "@/lib/http/responses";
import { isOwnMediaUrl } from "@/lib/media/urls";

import { createInputSchema, createPresentation, findByToken, reissueToken } from "./service";
import { settingsPatchSchema, type PresentationSettings } from "./settings";

/** `POST /api/presentations`: ліміт створення → пароль інстансу (якщо задано) → створення. */
export async function handleCreatePresentation(request: Request, deps: ApiDeps): Promise<Response> {
  try {
    const env = deps.getEnv();
    const now = deps.now();
    const clientKey = clientKeyFor(request, env.SUPABASE_SERVICE_ROLE_KEY);
    const body = await readJsonObject(request);

    return await deps.runDb(async () => {
      const limiter = deps.limiter();
      const limit = await limiter.hit(clientKey, "create", now);
      if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

      const parsed = createInputSchema.safeParse(body ?? null);
      if (!parsed.success) return jsonError(400, "validation_failed");

      if (isPasswordConfigured(env.INSTANCE_PASSWORD)) {
        const denied = await passwordGate(limiter, clientKey, env.INSTANCE_PASSWORD, parsed.data.password, now);
        if (denied) return denied;
      }

      const created = await createPresentation(deps.presentations(), parsed.data.title);
      return Response.json(created, { status: 201 });
    });
  } catch (error) {
    return errorResponse(error, deps.log, deps.connectionUrls());
  }
}

/** `POST /api/presentations/reissue`: edit-токен у `Authorization`, вид токена — у тілі. */
export async function handleReissue(request: Request, deps: ApiDeps): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const kind = body?.kind;
    if (kind !== "edit" && kind !== "present") return jsonError(400, "validation_failed");

    const token = bearerToken(request);
    if (!token) return notFound();
    deps.getEnv();
    const result = await deps.runDb(() => reissueToken(deps.presentations(), token, kind));
    if (!result) return notFound();
    return Response.json({ id: result.presentation.id, title: result.presentation.title, kind, token: result.token });
  } catch (error) {
    return errorResponse(error, deps.log, deps.connectionUrls());
  }
}

export const serializeSettings = (settings: PresentationSettings) => ({ ...settings, updatedAt: settings.updatedAt.toISOString() });

/**
 * `PATCH /api/presentations/settings`: edit-токен у `Authorization`, тіло — частина `{ title, theme, locale }`.
 * Логотип приймається лише з bucket цієї презентації.
 */
export async function handleUpdateSettings(request: Request, deps: ApiDeps): Promise<Response> {
  try {
    const token = bearerToken(request);
    if (!isTokenFormat(token)) return notFound();
    const parsed = settingsPatchSchema.safeParse((await readJsonObject(request)) ?? null);
    if (!parsed.success) return jsonError(400, "validation_failed");
    const env = deps.getEnv();

    return await deps.runDb(async () => {
      const repo = deps.presentations();
      const presentation = await findByToken(repo, "edit", token);
      if (!presentation) return notFound();
      const logoUrl = parsed.data.theme?.logoUrl;
      if (logoUrl && !isOwnMediaUrl(logoUrl, env.NEXT_PUBLIC_SUPABASE_URL, presentation.id)) {
        return jsonError(400, "validation_failed");
      }
      const updated = await repo.updateSettings(hashToken(token), parsed.data);
      return updated ? Response.json(serializeSettings(updated)) : notFound();
    });
  } catch (error) {
    return errorResponse(error, deps.log, deps.connectionUrls());
  }
}
