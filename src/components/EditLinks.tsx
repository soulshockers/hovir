"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { browserStorage, readMyPresentations, upsertMyPresentation } from "@/lib/my-presentations/store";
import { editPath, editUrl, presentUrl } from "@/lib/presentations/links";
import type { TokenKind } from "@/lib/presentations/service";

import { LinkField } from "./LinkField";
import { useHydrated } from "./useHydrated";

interface Props {
  id: string;
  title: string;
  createdAt: string;
  editToken: string;
}

const KIND_LABEL: Record<TokenKind, string> = { edit: "edit-посилання", present: "present-посилання" };

/** Керування посиланнями на `/e`: present-посилання з «Моїх презентацій» і перевипуск обох. */
export function EditLinks({ id, title, createdAt, editToken }: Props) {
  const router = useRouter();
  const [present, setPresent] = useState<string | null | undefined>(undefined);
  const [editLink, setEditLink] = useState("");
  const [confirming, setConfirming] = useState<TokenKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  useEffect(() => {
    const origin = window.location.origin;
    const storage = browserStorage();
    upsertMyPresentation(storage, { id, title, createdAt, editUrl: editUrl(origin, editToken) });
    const saved = readMyPresentations(storage);
    // Синхронізація з localStorage можлива лише після монтування.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditLink(editUrl(origin, editToken));
    setPresent((saved.ok && saved.items.find((item) => item.id === id)?.presentUrl) || null);
  }, [id, title, createdAt, editToken]);

  async function reissue(kind: TokenKind) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/presentations/reissue", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${editToken}` },
        body: JSON.stringify({ kind }),
      });
      if (!response.ok) {
        setError(
          response.status === 404
            ? "Це edit-посилання більше не дійсне. Відкрийте чинне посилання."
            : "Не вдалося перевипустити посилання. Перевірте стан інстансу на /health і спробуйте ще раз.",
        );
        return;
      }
      const { token } = (await response.json()) as { token: string };
      const origin = window.location.origin;
      const storage = browserStorage();
      if (kind === "present") {
        upsertMyPresentation(storage, { id, title, createdAt, presentUrl: presentUrl(origin, token) });
        setPresent(presentUrl(origin, token));
        setConfirming(null);
      } else {
        upsertMyPresentation(storage, { id, title, createdAt, editUrl: editUrl(origin, token) });
        router.replace(editPath(token));
      }
    } catch {
      setError("Не вдалося з'єднатися із сервером. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4" aria-label="Посилання">
      <h2 className="text-lg font-semibold">Посилання</h2>
      {editLink && <LinkField label="Редагування (edit)" url={editLink} testId="edit-url" />}
      {present === null && (
        <p data-testid="present-unknown" className="text-sm text-slate-700">
          Present-посилання не збережено в цьому браузері. Якщо воно загубилося, перевипустіть його: старе перестане діяти.
        </p>
      )}
      {present && <LinkField label="Показ (present)" url={present} testId="present-url" />}

      {confirming ? (
        <div role="alertdialog" aria-label="Підтвердження перевипуску" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p>Старе {KIND_LABEL[confirming]} одразу перестане діяти. Перевипустити?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => reissue(confirming)}
              className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Так, перевипустити
            </button>
            <button type="button" onClick={() => setConfirming(null)} className="rounded-md border border-slate-300 px-3 py-1.5">
              Скасувати
            </button>
          </div>
        </div>
      ) : (
        // До гідратації кнопки неактивні: клік по них нічого б не зробив.
        <fieldset disabled={!hydrated} aria-busy={!hydrated} className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirming("present")} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Перевипустити present-посилання
          </button>
          <button type="button" onClick={() => setConfirming("edit")} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Перевипустити edit-посилання
          </button>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
