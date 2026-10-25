import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export interface PresentationTheme {
  preset: "light" | "dark" | "bright";
  accent?: string;
  logoUrl?: string | null;
}

/** Презентація. Сирі edit/present-токени не зберігаються — лише їхні SHA-256 хеші (hex). */
export const presentations = pgTable("presentations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  theme: jsonb("theme").$type<PresentationTheme>().notNull().default({ preset: "light" }),
  locale: text("locale").notNull().default("auto"),
  editTokenHash: text("edit_token_hash").notNull().unique(),
  presentTokenHash: text("present_token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
