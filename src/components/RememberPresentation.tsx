"use client";

import { useEffect } from "react";

import { browserStorage, upsertMyPresentation } from "@/lib/my-presentations/store";
import { presentUrl } from "@/lib/presentations/links";

/** Додає відкриту за present-посиланням презентацію в «Мої презентації» цього браузера. */
export function RememberPresentation({ id, title, createdAt, presentToken }: { id: string; title: string; createdAt: string; presentToken: string }) {
  useEffect(() => {
    upsertMyPresentation(browserStorage(), { id, title, createdAt, presentUrl: presentUrl(window.location.origin, presentToken) });
  }, [id, title, createdAt, presentToken]);
  return null;
}
