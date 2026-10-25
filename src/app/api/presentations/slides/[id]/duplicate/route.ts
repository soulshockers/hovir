import { defaultApiDeps } from "@/lib/http/default-deps";
import { handleDuplicateSlide } from "@/lib/slides/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDuplicateSlide(request, (await params).id, defaultApiDeps);
}
