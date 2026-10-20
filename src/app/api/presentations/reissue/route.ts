import { defaultApiDeps } from "@/lib/http/default-deps";
import { handleReissue } from "@/lib/presentations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleReissue(request, defaultApiDeps);
}
