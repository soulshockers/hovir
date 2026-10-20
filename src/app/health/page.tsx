import type { Metadata } from "next";
import Link from "next/link";

import { runHealthChecks } from "@/lib/health/checks";
import { CHECK_LABELS, ERROR_ACTIONS, ERROR_SUMMARIES, STATUS_LABELS } from "@/lib/health/messages";
import { CHECK_NAMES, type CheckResult } from "@/lib/health/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Стан інстансу · Hovir" };

const STATUS_STYLES: Record<CheckResult["status"], string> = {
  ok: "bg-emerald-100 text-emerald-900",
  error: "bg-red-100 text-red-900",
  skipped: "bg-slate-100 text-slate-700",
};

const STATUS_ICONS: Record<CheckResult["status"], string> = { ok: "✓", error: "✕", skipped: "–" };

export default async function HealthPage() {
  const report = await runHealthChecks();
  const healthy = report.status === "ok";

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-blue-700 underline underline-offset-4">
        ← На головну
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Стан інстансу</h1>

      <p
        data-testid="health-overall"
        data-status={report.status}
        className={`mt-6 rounded-lg px-4 py-3 text-lg font-semibold ${healthy ? STATUS_STYLES.ok : STATUS_STYLES.error}`}
      >
        {healthy ? "✓ Інстанс готовий до роботи" : "✕ Інстанс потребує уваги"}
      </p>

      <ul className="mt-8 space-y-4">
        {CHECK_NAMES.map((name) => {
          const check = report.checks[name];
          return (
            <li key={name} data-testid={`health-check-${name}`} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium">{CHECK_LABELS[name]}</span>
                <span className={`rounded px-2 py-0.5 text-sm font-semibold ${STATUS_STYLES[check.status]}`}>
                  {STATUS_ICONS[check.status]} {STATUS_LABELS[check.status]}
                </span>
              </div>
              {check.status === "error" && check.code && (
                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    {ERROR_SUMMARIES[check.code]} <code className="text-slate-500">({check.code})</code>
                  </p>
                  {check.issues && (
                    <ul className="list-inside list-disc">
                      {check.issues.map((issue) => (
                        <li key={issue.variable}>
                          <code>{issue.variable}</code> — {issue.problem === "missing" ? "не задано" : "некоректне значення"}
                        </li>
                      ))}
                    </ul>
                  )}
                  <ol className="list-inside list-decimal space-y-1 text-slate-700">
                    {ERROR_ACTIONS[check.code].map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-sm text-slate-500">
        Перевірено: <time dateTime={report.checkedAt}>{report.checkedAt}</time>. Машинний формат:{" "}
        <a href="/api/health" className="underline underline-offset-4">
          /api/health
        </a>
        .
      </p>
    </main>
  );
}
