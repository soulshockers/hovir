import { NETWORK_ERROR, uiErrorFromResponse } from "@/lib/http/messages";
import type { SettingsPatch } from "@/lib/presentations/settings";

import { sendResultFromResponse, type SendResult } from "./autosave";

// Браузерний клієнт API редактора. Edit-токен — лише в `Authorization` (його не передасть `sendBeacon`, тому для
// `pagehide` — `fetch` з `keepalive`).

export interface ServerSlide {
  id: string;
  position: number;
  pluginId: string;
  pluginVersion: number;
  config: unknown;
  updatedAt: string;
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

const EXPIRED = "Це edit-посилання більше не дійсне. Відкрийте чинне посилання.";

export async function describeError(response: Response): Promise<string> {
  if (response.status === 404) return EXPIRED;
  return (await uiErrorFromResponse(response)).message;
}

export function createEditorClient(token: string) {
  const headers = (json: boolean): HeadersInit => ({
    authorization: `Bearer ${token}`,
    ...(json && { "content-type": "application/json" }),
  });

  async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<ApiResult<T>> {
    const { json, ...rest } = init;
    let response: Response;
    try {
      response = await fetch(path, { ...rest, headers: headers(json !== undefined), body: json === undefined ? rest.body : JSON.stringify(json) });
    } catch {
      return { ok: false, status: 0, message: NETWORK_ERROR.message };
    }
    if (!response.ok) return { ok: false, status: response.status, message: await describeError(response) };
    return { ok: true, value: (response.status === 204 ? undefined : await response.json()) as T };
  }

  async function save(path: string, method: string, body: unknown, keepalive: boolean): Promise<SendResult> {
    const response = await fetch(path, { method, headers: headers(true), body: JSON.stringify(body), keepalive });
    return sendResultFromResponse(response, describeError);
  }

  return {
    createSlide: (pluginId: string, afterSlideId?: string) =>
      call<{ slide: ServerSlide; order: string[] }>("/api/presentations/slides", { method: "POST", json: { pluginId, afterSlideId } }),
    duplicateSlide: (id: string) => call<{ slide: ServerSlide; order: string[] }>(`/api/presentations/slides/${id}/duplicate`, { method: "POST" }),
    deleteSlide: (id: string) => call<void>(`/api/presentations/slides/${id}`, { method: "DELETE" }),
    reorder: (ids: string[]) => call<void>("/api/presentations/slides/order", { method: "PUT", json: { ids } }),
    saveSlide: (id: string, config: unknown, keepalive: boolean) => save(`/api/presentations/slides/${id}`, "PUT", { config }, keepalive),
    saveSettings: (patch: SettingsPatch, keepalive: boolean) => save("/api/presentations/settings", "PATCH", patch, keepalive),
    async uploadImage(file: File): Promise<{ url: string } | { error: string }> {
      const form = new FormData();
      form.set("file", file);
      const result = await call<{ url: string }>("/api/presentations/media", { method: "POST", body: form });
      return result.ok ? { url: result.value.url } : { error: result.message };
    },
  };
}

export type EditorClient = ReturnType<typeof createEditorClient>;
