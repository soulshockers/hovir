"use client";

import { downloadTextFile, linksFileName, linksFileText } from "@/lib/my-presentations/links-file";

import { LinkField } from "./LinkField";

export interface ModalLinks {
  title: string;
  createdAt: Date;
  editUrl: string;
  presentUrl: string;
}

/**
 * Модалка з новими посиланнями. Закривається лише явною кнопкою: клік поза нею чи `Esc` її не закривають,
 * бо посилання показуються один раз.
 */
export function LinksModal({ links, heading, onClose }: { links: ModalLinks; heading: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4" data-testid="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="links-modal-title" className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
        <h2 id="links-modal-title" className="text-xl font-semibold">
          {heading}
        </h2>
        <p className="mt-1 text-slate-600">«{links.title}»</p>
        <div role="note" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Збережіть обидва посилання зараз: вони показуються один раз, а відновити їх може лише власник інстансу. Будь-хто з
          edit-посиланням може змінювати презентацію.
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <LinkField label="Редагування (edit)" url={links.editUrl} testId="modal-edit-url" />
          <LinkField label="Показ (present)" url={links.presentUrl} testId="modal-present-url" />
        </div>
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <button
            type="button"
            onClick={() => downloadTextFile(linksFileName(links.title), linksFileText(links))}
            className="rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
          >
            Завантажити .txt
          </button>
          <button type="button" onClick={onClose} className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700">
            Посилання збережено — закрити
          </button>
        </div>
      </div>
    </div>
  );
}
