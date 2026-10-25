import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { presentations } from "./presentations";

/**
 * Слайд презентації. `position` — щільна нумерація 0..n−1; без унікального обмеження, бо перенумерація йде всередині
 * транзакції з блокуванням рядка презентації (openspec/changes/archive/2026-10-25-add-presentation-editor/design.md «Модель даних»).
 * `plugin_version` — версія плагіна, якою записано `config`.
 */
export const slides = pgTable(
  "slides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    presentationId: uuid("presentation_id")
      .notNull()
      .references(() => presentations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    pluginId: text("plugin_id").notNull(),
    pluginVersion: integer("plugin_version").notNull(),
    config: jsonb("config").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("slides_presentation_position_idx").on(table.presentationId, table.position)],
).enableRLS();
