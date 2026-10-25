import { defaultApiDeps } from "@/lib/http/default-deps";
import { handleCreateSlide } from "@/lib/slides/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleCreateSlide(request, defaultApiDeps);
}
