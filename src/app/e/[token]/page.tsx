import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Editor } from "@/components/editor/Editor";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { loadEditor } from "@/lib/editor/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Редагування презентації", robots: { index: false, follow: false } };

export default async function EditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadEditor(token);
  if (result.status === "not_found") notFound();

  if (result.status === "unavailable") {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-16">
        <Link href="/" className="text-sm text-blue-700 underline underline-offset-4">
          ← Мої презентації
        </Link>
        <ServiceUnavailable />
      </main>
    );
  }

  // Новий `key` після `router.refresh()` (конфлікт порядку) перемонтовує редактор зі свіжими даними сервера.
  const { data } = result;
  return <Editor key={`${token}:${data.loadedAt}`} data={data} editToken={token} openedAt={data.loadedAt} />;
}
