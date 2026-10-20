import Link from "next/link";

/** Повідомлення, коли БД чи конфігурація інстансу недоступні. */
export function ServiceUnavailable() {
  return (
    <div role="alert" data-testid="service-unavailable" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <p className="font-semibold">Сервіс тимчасово недоступний</p>
      <p className="mt-1 text-sm">
        Не вдалося звернутися до бази даних інстансу.{" "}
        <Link href="/health" className="font-medium underline underline-offset-4">
          Перевірити стан інстансу →
        </Link>
      </p>
    </div>
  );
}
