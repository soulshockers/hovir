import { handleAdminDelete } from "@/lib/admin/api";
import { defaultApiDeps } from "@/lib/http/default-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminDelete(request, (await params).id, defaultApiDeps);
}
