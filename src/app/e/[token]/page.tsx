import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EditLinks } from "@/components/EditLinks";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { loadPresentation } from "@/lib/presentations/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Редагування презентації", robots: { index: false, follow: false } };

export default async function EditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadPresentation("edit", token);
  if (result.status === "not_found") notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-16">
      <Link href="/" className="text-sm text-blue-700 underline underline-offset-4">
        ← Мої презентації
      </Link>
      {result.status === "unavailable" ? (
        <ServiceUnavailable />
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">{result.presentation.title}</h1>
          <p className="text-slate-600">Редактор слайдів з&apos;явиться згодом. Поки що тут можна керувати посиланнями презентації.</p>
          <EditLinks
            key={token}
            id={result.presentation.id}
            title={result.presentation.title}
            createdAt={result.presentation.createdAt.toISOString()}
            editToken={token}
          />
        </>
      )}
    </main>
  );
}
