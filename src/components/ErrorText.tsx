import Link from "next/link";

import type { UiError } from "@/lib/http/messages";

export function ErrorText({ error }: { error: UiError }) {
  return (
    <p role="alert" className="text-sm text-red-700">
      {error.message}{" "}
      {error.healthLink && (
        <Link href="/health" className="font-medium underline underline-offset-4">
          Стан інстансу →
        </Link>
      )}
    </p>
  );
}
