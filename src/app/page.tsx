import Link from "next/link";
import { Suspense } from "react";

import { HealthBanner } from "@/components/HealthBanner";

// Банер перевіряє стан на кожен запит; без цього сторінку було б пререндерено під час білда.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <Suspense fallback={null}>
        <HealthBanner />
      </Suspense>
      <h1 className="text-4xl font-bold tracking-tight">Vercel Site Manager</h1>
      <p className="text-lg text-slate-600">Платформа інтерактивних презентацій. Інстанс розгорнуто, функції з&apos;являться незабаром.</p>
      <Link href="/health" className="text-blue-700 underline underline-offset-4 hover:text-blue-900">
        Стан інстансу
      </Link>
    </main>
  );
}
