"use client";

import type { ReactNode } from "react";

/** Модальне вікно редактора (без `window.confirm`: передбачувано в e2e й доступно з клавіатури). */
export function Dialog({
  title,
  onClose,
  children,
  role = "dialog",
  testId,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  testId?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      onKeyDown={(event) => event.key === "Escape" && onClose?.()}
    >
      <div role={role} aria-modal="true" aria-label={title} data-testid={testId} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Закрити" className="rounded px-2 text-slate-500 hover:bg-slate-100">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDelete({ number, onConfirm, onCancel }: { number: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog title="Видалити слайд?" role="alertdialog" onClose={onCancel} testId="confirm-delete">
      <p className="text-sm text-slate-700">Слайд {number} буде видалено остаточно.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          Скасувати
        </button>
        <button type="button" onClick={onConfirm} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
          Видалити
        </button>
      </div>
    </Dialog>
  );
}
