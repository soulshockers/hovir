import Link from "next/link";

import { runHealthChecks } from "@/lib/health/checks";
import { ERROR_SUMMARIES } from "@/lib/health/messages";
import { CHECK_NAMES } from "@/lib/health/types";

/** Попередження на головній, якщо інстанс несправний. Збій перевірки не ламає сторінку. */
export async function HealthBanner() {
  let summary: string | undefined;
  try {
    const report = await runHealthChecks();
    if (report.status === "ok") return null;
    const failed = CHECK_NAMES.map((name) => report.checks[name]).find((check) => check.status === "error");
    summary = failed?.code ? ERROR_SUMMARIES[failed.code] : ERROR_SUMMARIES.unknown;
  } catch (error) {
    console.error("[health] banner:", error instanceof Error ? error.name : "error");
    return null;
  }

  return (
    <div role="alert" data-testid="health-banner" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <p className="font-semibold">Інстанс потребує уваги</p>
      <p className="mt-1 text-sm">
        {summary}{" "}
        <Link href="/health" className="font-medium underline underline-offset-4">
          Деталі та інструкції →
        </Link>
      </p>
    </div>
  );
}
