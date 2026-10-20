import { handleAdminReissue } from "@/lib/admin/api";
import { defaultApiDeps } from "@/lib/http/default-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminReissue(request, (await params).id, defaultApiDeps);
}
