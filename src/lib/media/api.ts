import { isTokenFormat } from "@/lib/access/tokens";
import type { ApiDeps } from "@/lib/http/deps";
import { bearerToken, clientKeyFor } from "@/lib/http/request";
import { errorResponse, jsonError, notFound, rateLimited } from "@/lib/http/responses";
import { findByToken } from "@/lib/presentations/service";

import { MAX_MEDIA_BYTES } from "./constants";
import { detectImageType } from "./sniff";

/** Запас на multipart-обгортку понад сам файл. */
const MULTIPART_OVERHEAD = 64 * 1024;

const tooLarge = () => jsonError(413, "payload_too_large");

/**
 * `POST /api/presentations/media` (multipart, поле `file`): edit-токен → презентація → ліміт `upload` → розмір →
 * тип за сигнатурою → Storage → 201 `{ url }`. Тіло читається лише після перевірки токена й ліміту.
 */
export async function handleUploadMedia(request: Request, deps: ApiDeps): Promise<Response> {
  try {
    const token = bearerToken(request);
    if (!isTokenFormat(token)) return notFound();
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES + MULTIPART_OVERHEAD) return tooLarge();
    const env = deps.getEnv();
    const now = deps.now();

    const gate = await deps.runDb(async () => {
      const presentation = await findByToken(deps.presentations(), "edit", token);
      if (!presentation) return { response: notFound() };
      const limit = await deps.limiter().hit(clientKeyFor(request, env.SUPABASE_SERVICE_ROLE_KEY), "upload", now);
      if (!limit.allowed) return { response: rateLimited(limit.retryAfterSeconds) };
      return { presentation };
    });
    if (!gate.presentation) return gate.response;

    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get("file");
    } catch {
      return jsonError(400, "validation_failed");
    }
    if (!(file instanceof Blob)) return jsonError(400, "validation_failed");
    if (file.size > MAX_MEDIA_BYTES) return tooLarge();

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) return jsonError(415, "unsupported_media_type");

    const url = await deps.media().upload(gate.presentation.id, bytes, type);
    return Response.json({ url }, { status: 201 });
  } catch (error) {
    return errorResponse(error, deps.log, deps.connectionUrls());
  }
}
