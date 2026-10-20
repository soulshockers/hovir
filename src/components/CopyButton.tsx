"use client";

import { useState } from "react";

/** Кнопка «Копіювати» з підтвердженням. */
export function CopyButton({ value, label = "Копіювати" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
    >
      {state === "copied" ? "Скопійовано ✓" : state === "failed" ? "Не вдалося" : label}
    </button>
  );
}
