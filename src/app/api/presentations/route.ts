import { defaultApiDeps } from "@/lib/http/default-deps";
import { handleCreatePresentation } from "@/lib/presentations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleCreatePresentation(request, defaultApiDeps);
}
