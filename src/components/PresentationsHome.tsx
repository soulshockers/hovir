"use client";

import { useCallback, useEffect, useState } from "react";

import { NETWORK_ERROR, uiErrorFromResponse, type UiError } from "@/lib/http/messages";
import {
  browserStorage,
  readMyPresentations,
  removeMyPresentation,
  upsertMyPresentation,
  type ReadResult,
} from "@/lib/my-presentations/store";
import { editUrl, presentUrl } from "@/lib/presentations/links";

import { CopyButton } from "./CopyButton";
import { ErrorText } from "./ErrorText";
import { LinksModal, type ModalLinks } from "./LinksModal";
import { useHydrated } from "./useHydrated";

/** Створення презентації та «Мої презентації» цього браузера. */
export function PresentationsHome({ passwordRequired }: { passwordRequired: boolean }) {
  const [list, setList] = useState<ReadResult | undefined>(undefined);
  const [created, setCreated] = useState<ModalLinks | null>(null);

  const refresh = useCallback(() => setList(readMyPresentations(browserStorage())), []);
  // localStorage доступне лише після монтування.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(refresh, [refresh]);

  return (
    <>
      <CreatePresentationForm
        passwordRequired={passwordRequired}
        onCreated={(links, id) => {
          upsertMyPresentation(browserStorage(), {
            id,
            title: links.title,
            createdAt: links.createdAt.toISOString(),
            editUrl: links.editUrl,
            presentUrl: links.presentUrl,
          });
          setCreated(links);
          refresh();
        }}
      />
      <MyPresentations
        list={list}
        onRemove={(id) => {
          removeMyPresentation(browserStorage(), id);
          refresh();
        }}
      />
      {created && <LinksModal heading="Презентацію створено" links={created} onClose={() => setCreated(null)} />}
    </>
  );
}

function CreatePresentationForm({
  passwordRequired,
  onCreated,
}: {
  passwordRequired: boolean;
  onCreated: (links: ModalLinks, id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const hydrated = useHydrated();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/presentations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, ...(passwordRequired ? { password } : {}) }),
      });
      if (!response.ok) {
        setError(await uiErrorFromResponse(response));
        return;
      }
      const body = (await response.json()) as { id: string; title: string; editToken: string; presentToken: string };
      const origin = window.location.origin;
      onCreated(
        {
          title: body.title,
          createdAt: new Date(),
          editUrl: editUrl(origin, body.editToken),
          presentUrl: presentUrl(origin, body.presentToken),
        },
        body.id,
      );
      setTitle("");
      setPassword("");
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} aria-busy={!hydrated} aria-label="Створення презентації">
      {/* До гідратації форма неактивна: нативна відправка не спрацювала б, а введене зникло б. */}
      <fieldset disabled={!hydrated} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Назва
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Нова презентація"
          className="rounded-md border border-slate-300 px-3 py-2 text-base font-normal disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </label>
      {passwordRequired && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Пароль інстансу
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-base font-normal disabled:cursor-not-allowed disabled:bg-slate-100"
          />
        </label>
      )}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Створюю…" : "Створити презентацію"}
      </button>
      {error && <ErrorText error={error} />}
      </fieldset>
    </form>
  );
}

function MyPresentations({ list, onRemove }: { list: ReadResult | undefined; onRemove: (id: string) => void }) {
  return (
    <section aria-labelledby="my-presentations-title" className="flex flex-col gap-3">
      <h2 id="my-presentations-title" className="text-xl font-semibold">
        Мої презентації
      </h2>
      {list && !list.ok && (
        <p data-testid="storage-unavailable" className="text-sm text-slate-600">
          Не вдалося зберегти посилання в цьому браузері: сховище недоступне (наприклад, приватний режим). Збережіть посилання
          вручну одразу після створення.
        </p>
      )}
      {list?.ok && list.items.length === 0 && (
        <p data-testid="my-presentations-empty" className="text-sm text-slate-600">
          Тут з&apos;являться презентації, які ви створили або відкрили в цьому браузері. Посилання зберігаються лише в цьому
          браузері: на іншому пристрої їх треба відкрити вручну.
        </p>
      )}
      {list?.ok && list.items.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="my-presentations">
          {list.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3" data-testid="my-presentation">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                <time dateTime={item.createdAt} className="text-xs text-slate-500">
                  {new Date(item.createdAt).toLocaleString("uk-UA")}
                </time>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {item.editUrl && (
                  <>
                    <a href={item.editUrl} className="text-blue-700 underline underline-offset-4">
                      Редагувати
                    </a>
                    <CopyButton value={item.editUrl} label="Копіювати edit" />
                  </>
                )}
                {item.presentUrl && (
                  <>
                    <a href={item.presentUrl} className="text-blue-700 underline underline-offset-4">
                      Показати
                    </a>
                    <CopyButton value={item.presentUrl} label="Копіювати present" />
                  </>
                )}
                <button type="button" onClick={() => onRemove(item.id)} className="ml-auto text-slate-500 underline underline-offset-4">
                  Прибрати зі списку
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
