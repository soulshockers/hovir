"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorText } from "@/components/ErrorText";
import { useHydrated } from "@/components/useHydrated";
import { NETWORK_ERROR, uiErrorFromResponse, type UiError } from "@/lib/http/messages";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const hydrated = useHydrated();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(await uiErrorFromResponse(response));
        return;
      }
      setPassword("");
      router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4" aria-label="Вхід у майстер-доступ">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Пароль інстансу
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-base font-normal"
        />
      </label>
      <button type="submit" disabled={busy || !hydrated} className="self-start rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50">
        Увійти
      </button>
      {error && <ErrorText error={error} />}
    </form>
  );
}
