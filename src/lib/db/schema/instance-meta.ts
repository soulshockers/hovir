import { sql } from "drizzle-orm";
import { check, pgTable, smallint, timestamp } from "drizzle-orm/pg-core";

/** Службовий запис інстансу: рівно один рядок з `id = 1`, створюється міграцією. */
export const instanceMeta = pgTable(
  "instance_meta",
  {
    id: smallint("id").primaryKey().default(1),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("instance_meta_singleton", sql`${table.id} = 1`)],
).enableRLS();
