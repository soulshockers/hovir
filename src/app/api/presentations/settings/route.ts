import { defaultApiDeps } from "@/lib/http/default-deps";
import { handleUpdateSettings } from "@/lib/presentations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PATCH(request: Request) {
  return handleUpdateSettings(request, defaultApiDeps);
}
