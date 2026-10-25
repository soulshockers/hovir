import { defaultApiDeps } from "@/lib/http/default-deps";
import { handleReorderSlides } from "@/lib/slides/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PUT(request: Request) {
  return handleReorderSlides(request, defaultApiDeps);
}
