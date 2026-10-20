import { handleAdminLogin } from "@/lib/admin/api";
import { defaultApiDeps } from "@/lib/http/default-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleAdminLogin(request, defaultApiDeps);
}
