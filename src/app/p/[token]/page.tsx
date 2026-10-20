import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RememberPresentation } from "@/components/RememberPresentation";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { loadPresentation } from "@/lib/presentations/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Показ презентації", robots: { index: false, follow: false } };

export default async function PresentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadPresentation("present", token);
  if (result.status === "not_found") notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      {result.status === "unavailable" ? (
        <ServiceUnavailable />
      ) : (
        <>
          <h1 className="text-4xl font-bold tracking-tight">{result.presentation.title}</h1>
          <p className="text-lg text-slate-600">Показ презентації та сесії зі слухачами з&apos;являться згодом.</p>
          <RememberPresentation
            id={result.presentation.id}
            title={result.presentation.title}
            createdAt={result.presentation.createdAt.toISOString()}
            presentToken={token}
          />
        </>
      )}
    </main>
  );
}
