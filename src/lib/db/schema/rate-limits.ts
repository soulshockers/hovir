import { boolean, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Rate limiting з ковзним вікном: мітки часу зарахованих запитів на пару «ключ клієнта + бакет».
 * Ключ — HMAC IP-адреси, не сама адреса. `expires_at` — коли запис можна видаляти.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    clientKey: text("client_key").notNull(),
    bucket: text("bucket").notNull(),
    hits: timestamp("hits", { withTimezone: true }).array().notNull(),
    /** Чи зарахувало ліміт останнє звернення (атомарний результат `INSERT … ON CONFLICT`). */
    lastAllowed: boolean("last_allowed").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.clientKey, table.bucket] }), index("rate_limits_expires_at_idx").on(table.expiresAt)],
).enableRLS();
