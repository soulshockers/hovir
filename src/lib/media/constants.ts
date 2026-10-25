// Обмеження медіа (openspec/specs/slide-media). Клієнтський модуль, без серверних залежностей.

export const MEDIA_BUCKET = "slide-media";

/** 4 МБ: Vercel Functions приймають тіло запиту до 4,5 МБ. */
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

export const MEDIA_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type MediaType = keyof typeof MEDIA_TYPES;
