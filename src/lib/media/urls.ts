import { MEDIA_BUCKET, MEDIA_TYPES } from "./constants";

// Публічні URL файлів у bucket `slide-media`: `<SUPABASE_URL>/storage/v1/object/public/slide-media/<presentationId>/<uuid>.<ext>`.

const FILE_NAME = new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${Object.values(MEDIA_TYPES).join("|")})$`);

export function mediaPublicPrefix(supabaseUrl: string, presentationId: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${MEDIA_BUCKET}/${presentationId}/`;
}

/** Чи вказує URL на файл цієї презентації в bucket цього інстансу. */
export function isOwnMediaUrl(url: unknown, supabaseUrl: string, presentationId: string): boolean {
  if (typeof url !== "string") return false;
  const prefix = mediaPublicPrefix(supabaseUrl, presentationId);
  return url.startsWith(prefix) && FILE_NAME.test(url.slice(prefix.length));
}
