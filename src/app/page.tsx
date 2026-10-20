import Link from "next/link";
import { Suspense } from "react";

import { HealthBanner } from "@/components/HealthBanner";
import { PresentationsHome } from "@/components/PresentationsHome";
import { isInstanceProtected } from "@/lib/access/instance";

// Банер перевіряє стан на кожен запит; без цього сторінку було б пререндерено під час білда.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const passwordRequired = isInstanceProtected();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-16">
      <Suspense fallback={null}>
        <HealthBanner />
      </Suspense>
      <h1 className="text-4xl font-bold tracking-tight">Vercel Site Manager</h1>
      <p className="text-lg text-slate-600">Платформа інтерактивних презентацій.</p>
      {!passwordRequired && (
        <div role="note" data-testid="open-instance-warning" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
          <p className="font-semibold">Інстанс відкритий</p>
          <p className="mt-1 text-sm">
            Будь-хто, хто знає адресу інстансу, може створювати презентації. Щоб обмежити створення й увімкнути майстер-доступ{" "}
            <code>/admin</code>, задайте змінну <code>INSTANCE_PASSWORD</code> у Vercel → Settings → Environment Variables і
            зробіть Redeploy.
          </p>
        </div>
      )}
      <PresentationsHome passwordRequired={passwordRequired} />
      <Link href="/health" className="text-blue-700 underline underline-offset-4 hover:text-blue-900">
        Стан інстансу
      </Link>
    </main>
  );
}
