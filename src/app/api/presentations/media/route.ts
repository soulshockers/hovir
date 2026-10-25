import { defaultApiDeps } from "@/lib/http/default-deps";
import { handleUploadMedia } from "@/lib/media/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleUploadMedia(request, defaultApiDeps);
}
