import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/access/admin-session";
import { isInstanceProtected } from "@/lib/access/instance";
import { createAdminRepo } from "@/lib/admin/repo";
import { listPresentations, type AdminPage as AdminListPage } from "@/lib/admin/service";
import { getDb, withDbDeadline } from "@/lib/db/client";
import { getServerEnv } from "@/lib/env/server";
import { isServiceUnavailable } from "@/lib/http/responses";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Майстер-доступ", robots: { index: false, follow: false } };

async function loadPage(page: number): Promise<AdminListPage | "unavailable"> {
  try {
    return await withDbDeadline(() => listPresentations(createAdminRepo(getDb()), page));
  } catch (error) {
    if (!isServiceUnavailable(error)) throw error;
    console.error(`[admin] БД або конфігурація недоступні: ${error instanceof Error ? error.name : "error"}`);
    return "unavailable";
  }
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-16">
      <Link href="/" className="text-sm text-blue-700 underline underline-offset-4">
        ← На головну
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Майстер-доступ</h1>
      <AdminContent searchParams={searchParams} />
    </main>
  );
}

async function AdminContent({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  if (!isInstanceProtected()) {
    return (
      <div role="note" data-testid="admin-disabled" className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
        <p className="font-semibold">Майстер-доступ вимкнено</p>
        <p className="mt-1 text-sm text-slate-700">
          Щоб увімкнути його, задайте змінну <code>INSTANCE_PASSWORD</code> у Vercel → Settings → Environment Variables і зробіть
          Redeploy. Тоді тут можна буде переглядати всі презентації, відновлювати посилання й видаляти презентації.
        </p>
      </div>
    );
  }

  let password: string | undefined;
  try {
    password = getServerEnv().INSTANCE_PASSWORD;
  } catch {
    return <ServiceUnavailable />;
  }
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!verifyAdminSession(password, session, new Date())) return <AdminLogin />;

  const raw = (await searchParams).page;
  const result = await loadPage(Number(Array.isArray(raw) ? raw[0] : raw) || 1);
  if (result === "unavailable") return <ServiceUnavailable />;
  return (
    <AdminPanel
      items={result.items.map((item) => ({
        id: item.id,
        title: item.title,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))}
      page={result.page}
      pageCount={result.pageCount}
      total={result.total}
    />
  );
}
