// Throttling трансляцій `PublicState` (openspec/changes/archive/2026-10-21-add-slide-plugin-system/design.md «Throttling»): не частіше ніж
// раз на вікно на сесію, зміни всередині вікна об'єднуються — надсилається лише останній стан.

export const BROADCAST_WINDOW_MS = 500;

/**
 * Облік трансляцій однієї сесії. Пам'ять serverless-функції не переживає запит, тому ledger зберігає
 * openspec/changes/add-live-sessions (у БД, разом зі станом сесії); вона ж публікує `send` у канал `session:<id>`
 * через Supabase Realtime Broadcast і викликає `flushDue` на наступних запитах до сесії.
 */
export interface BroadcastLedger {
  /** Час останньої трансляції (мс) або `null`, якщо ще не було. */
  lastSentAt: number | null;
  /** Відкладений стан, що чекає кінця вікна. */
  pending: { publicState: unknown } | null;
}

export interface BroadcastPlan {
  ledger: BroadcastLedger;
  /** Що надіслати зараз; `null` — нічого. */
  send: { publicState: unknown } | null;
  /** Коли надіслати відкладений стан (`flushDue`), якщо його відкладено. */
  flushAt: number | null;
}

export const emptyLedger = (): BroadcastLedger => ({ lastSentAt: null, pending: null });

/**
 * Рішення для нового `PublicState`: надіслати одразу, якщо вікно минуло, або відкласти, замінивши попередній
 * відкладений стан. `broadcast: false` (з `ActionResult`) нічого не планує. Функція чиста — час передає виклик.
 */
export function planBroadcast(
  ledger: BroadcastLedger,
  update: { publicState: unknown; broadcast?: boolean },
  now: number,
  windowMs = BROADCAST_WINDOW_MS,
): BroadcastPlan {
  if (update.broadcast === false) return { ledger, send: null, flushAt: flushTime(ledger, windowMs) };
  if (ledger.lastSentAt === null || now - ledger.lastSentAt >= windowMs) {
    return { ledger: { lastSentAt: now, pending: null }, send: { publicState: update.publicState }, flushAt: null };
  }
  return {
    ledger: { lastSentAt: ledger.lastSentAt, pending: { publicState: update.publicState } },
    send: null,
    flushAt: ledger.lastSentAt + windowMs,
  };
}

/** Надсилає відкладений стан, якщо вікно вже минуло; інакше нічого не змінює. */
export function flushDue(ledger: BroadcastLedger, now: number, windowMs = BROADCAST_WINDOW_MS): BroadcastPlan {
  const flushAt = flushTime(ledger, windowMs);
  if (flushAt === null || !ledger.pending) return { ledger, send: null, flushAt: null };
  if (now < flushAt) return { ledger, send: null, flushAt };
  return { ledger: { lastSentAt: now, pending: null }, send: ledger.pending, flushAt: null };
}

function flushTime(ledger: BroadcastLedger, windowMs: number): number | null {
  return ledger.pending ? (ledger.lastSentAt ?? 0) + windowMs : null;
}
