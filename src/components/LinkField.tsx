import { CopyButton } from "./CopyButton";

/** Секретне посилання з кнопкою копіювання. */
export function LinkField({ label, url, testId }: { label: string; url: string; testId?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        <code data-testid={testId} className="min-w-0 flex-1 truncate rounded-md bg-slate-100 px-3 py-2 text-sm" title={url}>
          {url}
        </code>
        <CopyButton value={url} />
      </div>
    </div>
  );
}
