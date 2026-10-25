import { defaultApiDeps } from "@/lib/http/default-deps";
import { handleDeleteSlide, handleSaveSlide } from "@/lib/slides/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleSaveSlide(request, (await params).id, defaultApiDeps);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDeleteSlide(request, (await params).id, defaultApiDeps);
}
