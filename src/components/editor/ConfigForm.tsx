"use client";

import { useState } from "react";

import { defaultValue, pathKey, type FieldNode, type FieldPath, type ObjectNode } from "@/lib/forms/schema";
import { MEDIA_TYPES } from "@/lib/media/constants";

// Форма налаштувань слайда, згенерована з дерева полів (`@/lib/forms/schema`). Значення контрольоване: кожна зміна
// віддає новий конфіг цілком через `onChange(path, value)`; валідацію й помилки робить власник форми.

export type UploadImage = (file: File) => Promise<{ url: string } | { error: string }>;

interface FormContext {
  errors: Record<string, string>;
  onChange: (path: FieldPath, value: unknown) => void;
  uploadImage?: UploadImage;
  readOnly: boolean;
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-100 aria-[invalid=true]:border-red-500";

const fieldId = (path: FieldPath) => `field-${pathKey(path) || "root"}`;

export function ConfigForm({
  tree,
  value,
  errors,
  onChange,
  uploadImage,
  readOnly = false,
}: {
  tree: ObjectNode;
  value: unknown;
  errors: Record<string, string>;
  onChange: (path: FieldPath, value: unknown) => void;
  uploadImage?: UploadImage;
  readOnly?: boolean;
}) {
  const context: FormContext = { errors, onChange, uploadImage, readOnly };
  return (
    <div className="flex flex-col gap-4" data-testid="config-form">
      {errors[""] && (
        <p role="alert" className="text-sm text-red-700">
          {errors[""]}
        </p>
      )}
      <ObjectFields node={tree} value={value} path={[]} context={context} />
    </div>
  );
}

function ObjectFields({ node, value, path, context }: { node: ObjectNode; value: unknown; path: FieldPath; context: FormContext }) {
  const object = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return node.fields.map((field) => (
    <Field key={field.key} node={field} value={object[field.key]} path={[...path, field.key]} context={context} />
  ));
}

function FieldError({ path, context }: { path: FieldPath; context: FormContext }) {
  const message = context.errors[pathKey(path)];
  return message ? (
    <p id={`${fieldId(path)}-error`} role="alert" className="text-xs text-red-700">
      {message}
    </p>
  ) : null;
}

/** Поле з перемикачем «Без значення» для `.nullable()`/необов'язкових полів. */
function Field({ node, value, path, context }: { node: FieldNode; value: unknown; path: FieldPath; context: FormContext }) {
  const empty = value === null || value === undefined;
  const canBeEmpty = node.nullable || node.optional;
  const id = fieldId(path);

  return (
    <div className="flex flex-col gap-1" data-field={pathKey(path)}>
      <div className="flex items-center justify-between gap-2">
        {node.kind !== "boolean" && node.label && (
          <label htmlFor={id} className="text-sm font-medium text-slate-800">
            {node.label}
          </label>
        )}
        {canBeEmpty && (
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input
              type="checkbox"
              data-testid={`${id}-empty`}
              checked={empty}
              disabled={context.readOnly}
              onChange={(event) =>
                context.onChange(path, event.target.checked ? (node.nullable ? null : undefined) : defaultValue({ ...node, nullable: false, optional: false }))
              }
            />
            Без значення
          </label>
        )}
      </div>
      {!(canBeEmpty && empty) && <Control node={node} value={value} path={path} context={context} />}
      <FieldError path={path} context={context} />
    </div>
  );
}

function Control({ node, value, path, context }: { node: FieldNode; value: unknown; path: FieldPath; context: FormContext }) {
  const id = fieldId(path);
  const invalid = pathKey(path) in context.errors;
  const common = {
    id,
    "data-testid": id,
    disabled: context.readOnly,
    "aria-invalid": invalid,
    "aria-describedby": invalid ? `${id}-error` : undefined,
  };

  switch (node.kind) {
    case "text": {
      const text = typeof value === "string" ? value : "";
      if (node.widget === "image") return <ImageInput {...common} value={text} onChange={(url) => context.onChange(path, url)} uploadImage={context.uploadImage} />;
      if (node.widget === "color") {
        return (
          <div className="flex items-center gap-2">
            <input type="color" aria-label={node.label} value={/^#[0-9a-fA-F]{6}$/.test(text) ? text : "#000000"} disabled={context.readOnly} onChange={(event) => context.onChange(path, event.target.value)} />
            <input {...common} type="text" className={inputClass} value={text} maxLength={7} onChange={(event) => context.onChange(path, event.target.value)} />
          </div>
        );
      }
      const counter = node.maxLength !== undefined && (
        <span className="self-end text-xs text-slate-500">
          {Array.from(text).length}/{node.maxLength}
        </span>
      );
      return (
        <>
          {node.widget === "markdown" ? (
            <textarea {...common} rows={6} className={inputClass} value={text} maxLength={node.maxLength} minLength={node.minLength} onChange={(event) => context.onChange(path, event.target.value)} />
          ) : (
            <input {...common} type="text" className={inputClass} value={text} maxLength={node.maxLength} minLength={node.minLength} onChange={(event) => context.onChange(path, event.target.value)} />
          )}
          {counter}
        </>
      );
    }
    case "number":
      return (
        <input
          {...common}
          type="number"
          className={inputClass}
          min={node.min}
          max={node.max}
          step={node.integer ? 1 : "any"}
          value={typeof value === "number" && Number.isFinite(value) ? value : ""}
          onChange={(event) => context.onChange(path, event.target.value === "" ? undefined : Number(event.target.value))}
        />
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input {...common} type="checkbox" role="switch" checked={value === true} onChange={(event) => context.onChange(path, event.target.checked)} />
          {node.label}
        </label>
      );
    case "enum":
      if (node.options.length <= 4) {
        return (
          <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-3" data-testid={id}>
            {node.options.map((option) => (
              <label key={String(option)} className="flex items-center gap-1 text-sm">
                <input type="radio" name={id} value={String(option)} checked={value === option} disabled={context.readOnly} onChange={() => context.onChange(path, option)} />
                {String(option)}
              </label>
            ))}
          </div>
        );
      }
      return (
        <select {...common} className={inputClass} value={String(value ?? "")} onChange={(event) => context.onChange(path, node.options.find((option) => String(option) === event.target.value))}>
          {node.options.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      );
    case "array": {
      const items = Array.isArray(value) ? value : [];
      const canAdd = !context.readOnly && (node.maxItems === undefined || items.length < node.maxItems);
      const canRemove = !context.readOnly && items.length > (node.minItems ?? 0);
      return (
        <div className="flex flex-col gap-2" data-testid={id}>
          {items.map((item, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <Field node={{ ...node.item, label: "" }} value={item} path={[...path, index]} context={context} />
              </div>
              <button
                type="button"
                aria-label={`Видалити елемент ${index + 1}`}
                disabled={!canRemove}
                onClick={() => context.onChange(path, items.filter((_, i) => i !== index))}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            data-testid={`${id}-add`}
            disabled={!canAdd}
            onClick={() => context.onChange(path, [...items, defaultValue(node.item)])}
            className="self-start rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-40"
          >
            + Додати
          </button>
        </div>
      );
    }
    case "object":
      return (
        <fieldset className="flex flex-col gap-3 rounded-md border border-slate-200 p-3" data-testid={id}>
          <ObjectFields node={node} value={value} path={path} context={context} />
        </fieldset>
      );
  }
}

const ACCEPT = Object.keys(MEDIA_TYPES).join(",");

/** Поле зображення: превʼю, завантаження через API медіа, прибирання. Значення — публічний URL. */
export function ImageInput({
  value,
  onChange,
  uploadImage,
  disabled,
  id,
  ...rest
}: {
  value: string;
  onChange: (url: string | null) => void;
  uploadImage?: UploadImage;
  disabled?: boolean;
  id: string;
  "data-testid"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file || !uploadImage) return;
    setBusy(true);
    setError(null);
    const result = await uploadImage(file);
    setBusy(false);
    if ("url" in result) onChange(result.url);
    else setError(result.error);
  }

  return (
    <div className="flex flex-col gap-2">
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="max-h-32 w-auto self-start rounded border border-slate-200 object-contain" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          {...rest}
          id={id}
          type="file"
          accept={ACCEPT}
          disabled={disabled || busy || !uploadImage}
          aria-busy={busy}
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
          className="text-sm"
        />
        {value && (
          <button type="button" disabled={disabled} onClick={() => onChange(null)} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
            Прибрати
          </button>
        )}
      </div>
      {busy && <p className="text-xs text-slate-500">Завантаження…</p>}
      {error && (
        <p role="alert" className="text-xs text-red-700" data-testid={`${id}-upload-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
