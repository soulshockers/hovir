"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorText } from "@/components/ErrorText";
import { LinksModal, type ModalLinks } from "@/components/LinksModal";
import { NETWORK_ERROR, uiErrorFromResponse, type UiError } from "@/lib/http/messages";
import { editUrl, presentUrl } from "@/lib/presentations/links";

export interface AdminItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

type Pending = { id: string; action: "reissue" | "delete" } | null;

const formatDate = (iso: string) => new Date(iso).toLocaleString("uk-UA");

/** Панель власника: список усіх презентацій, відновлення посилань і видалення з підтвердженням. */
export function AdminPanel({ items, page, pageCount, total }: { items: AdminItem[]; page: number; pageCount: number; total: number }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [restored, setRestored] = useState<ModalLinks | null>(null);

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        pending.action === "reissue" ? `/api/admin/presentations/${pending.id}/reissue` : `/api/admin/presentations/${pending.id}`,
        { method: pending.action === "reissue" ? "POST" : "DELETE" },
      );
      if (!response.ok) {
        if (response.status === 401) router.refresh();
        setError(await uiErrorFromResponse(response));
        return;
      }
      if (pending.action === "reissue") {
        const body = (await response.json()) as { title: string; createdAt: string; editToken: string; presentToken: string };
        const origin = window.location.origin;
        setRestored({
          title: body.title,
          createdAt: new Date(body.createdAt),
          editUrl: editUrl(origin, body.editToken),
          presentUrl: presentUrl(origin, body.presentToken),
        });
      }
      setPending(null);
      router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-slate-600" data-testid="admin-total">
          Усього презентацій: {total}
        </p>
        <button type="button" onClick={logout} className="text-sm text-slate-600 underline underline-offset-4">
          Вийти
        </button>
      </div>
      {error && <ErrorText error={error} />}
      {items.length === 0 ? (
        <p className="text-slate-600">На цьому інстансі ще немає презентацій.</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="admin-list">
          {items.map((item) => (
            <li key={item.id} data-testid="admin-item" className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                <span className="text-xs text-slate-500">
                  створено {formatDate(item.createdAt)} · оновлено {formatDate(item.updatedAt)}
                </span>
              </div>
              {pending?.id === item.id ? (
                <div role="alertdialog" aria-label="Підтвердження" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                  <p>
                    {pending.action === "reissue"
                      ? "Буде створено нові edit- і present-посилання. Чинні посилання автора одразу перестануть діяти."
                      : "Презентацію буде видалено остаточно. Її посилання перестануть діяти, відновити її неможливо."}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={confirm}
                      className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {pending.action === "reissue" ? "Так, відновити" : "Так, видалити"}
                    </button>
                    <button type="button" onClick={() => setPending(null)} className="rounded-md border border-slate-300 px-3 py-1.5">
                      Скасувати
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setPending({ id: item.id, action: "reissue" })}
                    className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                  >
                    Відновити посилання
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending({ id: item.id, action: "delete" })}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50"
                  >
                    Видалити
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 && (
        <nav aria-label="Сторінки" className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/admin?page=${page - 1}`} className="text-blue-700 underline underline-offset-4">
              ← Новіші
            </Link>
          )}
          <span>
            Сторінка {page} з {pageCount}
          </span>
          {page < pageCount && (
            <Link href={`/admin?page=${page + 1}`} className="text-blue-700 underline underline-offset-4">
              Старіші →
            </Link>
          )}
        </nav>
      )}
      {restored && <LinksModal heading="Нові посилання" links={restored} onClose={() => setRestored(null)} />}
    </section>
  );
}
