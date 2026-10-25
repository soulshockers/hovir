"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EditLinks } from "@/components/EditLinks";
import { useHydrated } from "@/components/useHydrated";
import { createSaveQueue, type SaveQueue, type SaveStatus } from "@/lib/editor/autosave";
import { createEditorClient, type ServerSlide } from "@/lib/editor/client";
import type { EditorData } from "@/lib/editor/types";
import { pluginFormTree, setIn, type FieldPath } from "@/lib/forms/schema";
import { browserStorage, upsertMyPresentation } from "@/lib/my-presentations/store";
import { editUrl } from "@/lib/presentations/links";
import { getRegistry } from "@/lib/plugins/registry";
import { editorTitleSchema, type SettingsPatch } from "@/lib/presentations/settings";

import { ConfigForm } from "./ConfigForm";
import { ConfirmDelete, Dialog } from "./Dialog";
import { SettingsDialog, type SettingsDraft } from "./SettingsDialog";
import { pluginTitle, SlideList } from "./SlideList";
import { SlideFrame } from "./SlidePreview";
import { applyDraft, moveItem, reorderById, toLocalSlide, type LocalSlide } from "./state";

// Редактор презентації (openspec/specs/presentation-editor): список слайдів | превʼю |
// форма. Усі зміни зберігаються автоматично чергами `createSaveQueue` (одна на слайд і одна на налаштування).

type Tab = "slides" | "preview" | "form";
type DialogState = null | "settings" | "links" | "add" | { delete: string };
type QueueState = { status: SaveStatus; error: string | null };

const SETTINGS_QUEUE = "settings";

const fromServer = (slide: ServerSlide): LocalSlide =>
  toLocalSlide({ id: slide.id, pluginId: slide.pluginId, pluginVersion: slide.pluginVersion, status: "ok", config: slide.config });

const button = "rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export function Editor({ data, editToken, openedAt }: { data: EditorData; editToken: string; openedAt: number }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const registry = getRegistry();
  const client = useMemo(() => createEditorClient(editToken), [editToken]);
  const { presentation } = data;

  const [slides, setSlides] = useState<LocalSlide[]>(() => data.slides.map(toLocalSlide));
  const [selectedId, setSelectedId] = useState<string | null>(data.slides[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("slides");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(presentation.title);
  const [settings, setSettings] = useState<SettingsDraft>({ title: presentation.title, theme: presentation.theme, locale: presentation.locale });
  const [titleError, setTitleError] = useState<string | null>(null);
  const [queueStates, setQueueStates] = useState<Record<string, QueueState>>({});

  const slidesRef = useRef(slides);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);
  const queues = useRef(new Map<string, SaveQueue<unknown>>());

  const trackQueue = useCallback((key: string) => (status: SaveStatus, error: string | null) => {
    setQueueStates((current) => ({ ...current, [key]: { status, error } }));
  }, []);

  const slideQueue = useCallback(
    (id: string) => {
      let queue = queues.current.get(id);
      if (!queue) {
        queue = createSaveQueue<unknown>({
          onChange: trackQueue(id),
          send: async (config, { keepalive }) => {
            const result = await client.saveSlide(id, config, keepalive);
            if (result.ok) {
              setSlides((current) =>
                current.map((slide) =>
                  slide.id === id && slide.status === "migrated"
                    ? { ...slide, status: "ok", pluginVersion: registry.get(slide.pluginId)?.version ?? slide.pluginVersion }
                    : slide,
                ),
              );
            }
            return result;
          },
        });
        queues.current.set(id, queue);
      }
      return queue;
    },
    [client, registry, trackQueue],
  );

  const settingsQueue = useCallback(() => {
    let queue = queues.current.get(SETTINGS_QUEUE);
    if (!queue) {
      queue = createSaveQueue<unknown>({
        onChange: trackQueue(SETTINGS_QUEUE),
        send: async (patch, { keepalive }) => {
          const result = await client.saveSettings(patch as SettingsPatch, keepalive);
          const saved = (patch as SettingsPatch).title;
          if (result.ok && saved) {
            setTitle(saved);
            upsertMyPresentation(browserStorage(), { id: presentation.id, title: saved, createdAt: presentation.createdAt });
          }
          return result;
        },
      });
      queues.current.set(SETTINGS_QUEUE, queue);
    }
    return queue;
  }, [client, presentation.id, presentation.createdAt, trackQueue]);

  const flushAll = useCallback((keepalive: boolean) => {
    for (const queue of queues.current.values()) queue.flush({ keepalive });
  }, []);

  // Відкрите edit-посилання поповнює «Мої презентації» цього браузера (openspec/specs/my-presentations).
  useEffect(() => {
    upsertMyPresentation(browserStorage(), {
      id: presentation.id,
      title: presentation.title,
      createdAt: presentation.createdAt,
      editUrl: editUrl(window.location.origin, editToken),
    });
  }, [presentation.id, presentation.title, presentation.createdAt, editToken]);

  // Слайди старої версії плагіна одразу зберігаються з мігрованим конфігом.
  useEffect(() => {
    for (const slide of slidesRef.current) {
      if (slide.status === "migrated") slideQueue(slide.id).update(slide.lastValid);
    }
  }, [slideQueue]);

  // Незбережене відправляється при закритті чи схованні вкладки (`keepalive`); діалог виходу — лише якщо збереження
  // не вдається й повторюється.
  useEffect(() => {
    const onHide = () => flushAll(true);
    const onVisibility = () => document.visibilityState === "hidden" && flushAll(true);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const failing = [...queues.current.values()].some((queue) => queue.status() === "error" && queue.hasUnsaved());
      if (failing) event.preventDefault();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      flushAll(true);
    };
  }, [flushAll]);

  const selectedIndex = slides.findIndex((slide) => slide.id === selectedId);
  const selected = selectedIndex >= 0 ? slides[selectedIndex] : undefined;
  const selectedPlugin = selected ? registry.get(selected.pluginId) : undefined;

  function updateSlide(id: string, update: (slide: LocalSlide) => LocalSlide) {
    setSlides((current) => current.map((slide) => (slide.id === id ? update(slide) : slide)));
  }

  function changeField(path: FieldPath, value: unknown) {
    if (!selected || !selectedPlugin) return;
    const { slide, valid } = applyDraft(selected, selectedPlugin, setIn(selected.draft, path, value));
    updateSlide(selected.id, () => slide);
    if (valid) slideQueue(selected.id).update(slide.lastValid);
  }

  function resetSlide() {
    if (!selected || !selectedPlugin) return;
    const { slide } = applyDraft({ ...selected, status: "ok" }, selectedPlugin, structuredClone(selectedPlugin.defaultConfig));
    updateSlide(selected.id, () => slide);
    slideQueue(selected.id).update(slide.lastValid);
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  function insertFromServer(slide: ServerSlide, order: string[]) {
    setSlides((current) => reorderById([...current, fromServer(slide)], order));
    setSelectedId(slide.id);
  }

  const addSlide = (pluginId: string) =>
    runAction(async () => {
      const result = await client.createSlide(pluginId, selectedId ?? undefined);
      if (!result.ok) return setActionError(result.message);
      insertFromServer(result.value.slide, result.value.order);
      setDialog(null);
      setTab("form");
    });

  const duplicate = (id: string) =>
    runAction(async () => {
      // Копія робиться із збереженого на сервері конфігу — спершу дочекаймося відкладених правок.
      await queues.current.get(id)?.settle();
      const result = await client.duplicateSlide(id);
      if (!result.ok) return setActionError(result.message);
      insertFromServer(result.value.slide, result.value.order);
    });

  const remove = (id: string) =>
    runAction(async () => {
      setDialog(null);
      queues.current.get(id)?.dispose();
      queues.current.delete(id);
      const result = await client.deleteSlide(id);
      if (!result.ok) return setActionError(result.message);
      const index = slidesRef.current.findIndex((slide) => slide.id === id);
      const rest = slidesRef.current.filter((slide) => slide.id !== id);
      setSlides(rest);
      setQueueStates((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
      setSelectedId(rest[Math.min(index, rest.length - 1)]?.id ?? null);
    });

  const move = (from: number, to: number) =>
    runAction(async () => {
      const previous = slidesRef.current;
      if (to < 0 || to >= previous.length) return;
      const next = moveItem(previous, from, to);
      setSlides(next);
      const result = await client.reorder(next.map((slide) => slide.id));
      if (result.ok) return;
      if (result.status === 409) {
        // Список змінився в іншій вкладці: зберігаємо відкладене й перечитуємо список із сервера.
        flushAll(true);
        setActionError(result.message);
        router.refresh();
        return;
      }
      setSlides(previous);
      setActionError(result.message);
    });

  function changeSettings(next: SettingsDraft) {
    setSettings(next);
    const parsedTitle = editorTitleSchema.safeParse(next.title);
    setTitleError(parsedTitle.success ? null : (parsedTitle.error.issues[0]?.message ?? "title_required"));
    settingsQueue().update({ theme: next.theme, locale: next.locale, ...(parsedTitle.success && { title: parsedTitle.data }) });
  }

  const states = Object.values(queueStates);
  const failed = states.find((state) => state.status === "error");
  const saving = states.some((state) => state.status === "saving" || state.status === "pending");
  const statusText = failed ? `Помилка збереження: ${failed.error ?? ""}` : saving ? "Зберігається…" : "Усі зміни збережено";

  const panel = (name: Tab) => (tab === name ? "flex" : "hidden lg:flex");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Link href="/" className="text-sm text-blue-700 underline underline-offset-4">
          ← Мої презентації
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight" data-testid="editor-title">
          {title}
        </h1>
        <p role="status" aria-live="polite" data-testid="save-status" data-state={failed ? "error" : saving ? "saving" : "saved"} className={`text-sm ${failed ? "text-red-700" : "text-slate-600"}`}>
          {statusText}
        </p>
        <fieldset disabled={!hydrated} aria-busy={!hydrated} className="flex gap-2">
          <button type="button" className={button} onClick={() => setDialog("settings")}>
            Налаштування
          </button>
          <button type="button" className={button} onClick={() => setDialog("links")}>
            Посилання
          </button>
        </fieldset>
      </header>

      {actionError && (
        <p role="alert" data-testid="action-error" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {actionError}
        </p>
      )}

      {/* До гідратації контроли неактивні: клік по них нічого б не зробив. */}
      <fieldset disabled={!hydrated} aria-busy={!hydrated} data-testid="editor-controls" className="flex min-h-0 flex-1 flex-col">
        <nav className="flex gap-1 border-b border-slate-200 px-4 py-2 lg:hidden" aria-label="Розділи редактора">
          {(
            [
              ["slides", "Слайди"],
              ["preview", "Превʼю"],
              ["form", "Налаштування слайда"],
            ] as const
          ).map(([name, label]) => (
            <button
              key={name}
              type="button"
              aria-pressed={tab === name}
              onClick={() => setTab(name)}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === name ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_380px]">
          <section aria-label="Список слайдів" className={`${panel("slides")} flex-col gap-3`}>
            <button type="button" disabled={busy} className={`${button} bg-slate-900 font-medium text-white hover:bg-slate-700`} onClick={() => setDialog("add")}>
              + Додати слайд
            </button>
            {slides.length === 0 ? (
              <p className="text-sm text-slate-500" data-testid="no-slides">
                Слайдів ще немає.
              </p>
            ) : (
              <SlideList
                slides={slides}
                selectedId={selectedId}
                openedAt={openedAt}
                plugin={(id) => registry.get(id)}
                onSelect={setSelectedId}
                onMove={move}
                onDuplicate={duplicate}
                onDelete={(id) => setDialog({ delete: id })}
              />
            )}
          </section>

          <section aria-label="Превʼю" className={`${panel("preview")} min-w-0 flex-col gap-2`}>
            {selected && selectedPlugin && (selected.status === "ok" || selected.status === "migrated") ? (
              <SlideFrame plugin={selectedPlugin} config={selected.lastValid} openedAt={openedAt} />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                {selected ? "Превʼю для цього слайда недоступне." : "Оберіть або додайте слайд."}
              </div>
            )}
          </section>

          <section aria-label="Налаштування слайда" className={`${panel("form")} min-w-0 flex-col gap-3`} data-testid="slide-settings">
            {selected && <SlidePanel slide={selected} pluginTitle={selectedPlugin ? pluginTitle(selectedPlugin) : selected.pluginId} />}
            {selected && selectedPlugin && (selected.status === "ok" || selected.status === "migrated" || selected.status === "newer_version") && (
              <ConfigForm
                tree={pluginFormTree(selectedPlugin)}
                value={selected.draft}
                errors={selected.errors}
                onChange={changeField}
                uploadImage={client.uploadImage}
                readOnly={selected.status === "newer_version"}
              />
            )}
            {selected && selectedPlugin && (selected.status === "invalid_config" || selected.status === "no_migration") && (
              <button type="button" className={button} onClick={resetSlide}>
                Скинути до типових налаштувань
              </button>
            )}
          </section>
        </div>
      </fieldset>

      {dialog === "add" && (
        <Dialog title="Додати слайд" onClose={() => setDialog(null)} testId="add-slide-dialog">
          {registry.all.length === 0 ? (
            <p className="text-sm text-slate-600" data-testid="no-plugins">
              Типи слайдів ще не встановлено.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {registry.all.map((plugin) => (
                <li key={plugin.id}>
                  <button type="button" disabled={busy} data-testid={`add-${plugin.id}`} className={`${button} w-full text-left`} onClick={() => addSlide(plugin.id)}>
                    {pluginTitle(plugin)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}

      {dialog === "settings" && (
        <SettingsDialog draft={settings} titleError={titleError} onChange={changeSettings} uploadImage={client.uploadImage} onClose={() => setDialog(null)} />
      )}

      {dialog === "links" && (
        <Dialog title="Посилання" onClose={() => setDialog(null)} testId="links-dialog">
          <EditLinks key={editToken} id={presentation.id} title={title} createdAt={presentation.createdAt} editToken={editToken} />
        </Dialog>
      )}

      {typeof dialog === "object" && dialog !== null && (
        <ConfirmDelete
          number={slides.findIndex((slide) => slide.id === dialog.delete) + 1}
          onCancel={() => setDialog(null)}
          onConfirm={() => remove(dialog.delete)}
        />
      )}
    </div>
  );
}

function SlidePanel({ slide, pluginTitle: title }: { slide: LocalSlide; pluginTitle: string }) {
  const messages: Partial<Record<LocalSlide["status"], string>> = {
    unknown_plugin: `Невідомий тип слайда «${slide.pluginId}»: плагіна немає в цьому інстансі. Слайд можна перемістити або видалити, його дані не змінюються.`,
    invalid_config: "Налаштування слайда не проходять перевірку поточною версією плагіна.",
    no_migration: "Налаштування слайда записано старою версією плагіна, і їх не вдається перенести.",
    newer_version: "Слайд записано новішою версією застосунку — тут його можна лише переглядати.",
  };
  const message = messages[slide.status];
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-semibold">{title}</h2>
      {message && (
        <p role="note" data-testid="slide-status-message" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {message}
          {slide.message && <span className="mt-1 block text-xs text-amber-800">{slide.message}</span>}
        </p>
      )}
    </div>
  );
}
