import { ADMIN_COOKIE, adminCookieOptions, createAdminSession, verifyAdminSession } from "@/lib/access/admin-session";
import { passwordGate } from "@/lib/access/password-gate";
import { isPasswordConfigured } from "@/lib/access/password";
import { readCookie, serializeCookie } from "@/lib/http/cookies";
import type { ApiDeps } from "@/lib/http/deps";
import { clientKeyFor, isHttps, isSameOrigin, readJsonObject } from "@/lib/http/request";
import { errorResponse, jsonError, notFound } from "@/lib/http/responses";

import { deletePresentation, restoreLinks } from "./service";

// API майстер-доступу: без `INSTANCE_PASSWORD` — 404, мутації — лише з `Origin` інстансу, дані — лише з чинною сесією.

type Guarded = { ok: true; password: string } | { ok: false; response: Response };

function guard(request: Request, deps: ApiDeps, { session }: { session: boolean }): Guarded {
  const password = deps.getEnv().INSTANCE_PASSWORD;
  if (!isPasswordConfigured(password)) return { ok: false, response: notFound() };
  if (!isSameOrigin(request)) return { ok: false, response: jsonError(403, "forbidden") };
  if (session && !verifyAdminSession(password, readCookie(request, ADMIN_COOKIE), deps.now())) {
    return { ok: false, response: jsonError(401, "unauthorized") };
  }
  return { ok: true, password };
}

/** `POST /api/admin/login`: пароль зі спільним лімітом невдалих спроб → cookie сесії на 12 годин. */
export async function handleAdminLogin(request: Request, deps: ApiDeps): Promise<Response> {
  try {
    const guarded = guard(request, deps, { session: false });
    if (!guarded.ok) return guarded.response;
    const env = deps.getEnv();
    const now = deps.now();
    const body = await readJsonObject(request);
    const clientKey = clientKeyFor(request, env.SUPABASE_SERVICE_ROLE_KEY);
    const denied = await deps.runDb(() => passwordGate(deps.limiter(), clientKey, guarded.password, body?.password, now));
    if (denied) return denied;

    const session = createAdminSession(guarded.password, now);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": serializeCookie(ADMIN_COOKIE, session.value, adminCookieOptions(isHttps(request))) } },
    );
  } catch (error) {
    return errorResponse(error, deps.log, deps.connectionUrls());
  }
}

/** `POST /api/admin/logout`: видаляє cookie сесії. */
export async function handleAdminLogout(request: Request, deps: ApiDeps): Promise<Response> {
  try {
    const guarded = guard(request, deps, { session: false });
    if (!guarded.ok) return guarded.response;
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": serializeCookie(ADMIN_COOKIE, "", adminCookieOptions(isHttps(request), 0)) } },
    );
  } catch (error) {
    return errorResponse(error, deps.log, deps.connectionUrls());
  }
}

/** `POST /api/admin/presentations/{id}/reissue`: нові edit- і present-токени, старі посилання перестають діяти. */
export async function handleAdminReissue(request: Request, id: string, deps: ApiDeps): Promise<Response> {
  try {
    const guarded = guard(request, deps, { session: true });
    if (!guarded.ok) return guarded.response;
    const result = await deps.runDb(() => restoreLinks(deps.admin(), id));
    if (!result) return notFound();
    return Response.json({
      id: result.presentation.id,
      title: result.presentation.title,
      createdAt: result.presentation.createdAt.toISOString(),
      editToken: result.editToken,
      presentToken: result.presentToken,
    });
  } catch (error) {
    return errorResponse(error, deps.log, deps.connectionUrls());
  }
}

/** `DELETE /api/admin/presentations/{id}`: остаточне видалення. */
export async function handleAdminDelete(request: Request, id: string, deps: ApiDeps): Promise<Response> {
  try {
    const guarded = guard(request, deps, { session: true });
    if (!guarded.ok) return guarded.response;
    if (!(await deps.runDb(() => deletePresentation(deps.admin(), id)))) return notFound();
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, deps.log, deps.connectionUrls());
  }
}
