import { eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { presentations } from "@/lib/db/schema";

import type { PresentationRepo, PresentationSummary, TokenKind } from "./service";
import type { PresentationSettings } from "./settings";

const summary = {
  id: presentations.id,
  title: presentations.title,
  createdAt: presentations.createdAt,
  updatedAt: presentations.updatedAt,
};

const settings = {
  id: presentations.id,
  title: presentations.title,
  theme: presentations.theme,
  locale: presentations.locale,
  updatedAt: presentations.updatedAt,
};

const asSettings = (row: typeof presentations.$inferSelect | Record<string, unknown>) => row as unknown as PresentationSettings;

const hashColumn = (kind: TokenKind) => (kind === "edit" ? presentations.editTokenHash : presentations.presentTokenHash);

export function createPresentationRepo(db: Database): PresentationRepo {
  return {
    async insert(row) {
      const [created] = await db.insert(presentations).values(row).returning(summary);
      return created;
    },

    async findByTokenHash(kind, hash) {
      const [found] = await db.select(summary).from(presentations).where(eq(hashColumn(kind), hash)).limit(1);
      return found ?? null;
    },

    // Один `UPDATE … WHERE edit_token_hash = $old RETURNING`: з двох одночасних перевипусків успішний лише один.
    async replaceTokenHash(editHash, kind, newHash): Promise<PresentationSummary | null> {
      const [updated] = await db
        .update(presentations)
        .set(kind === "edit" ? { editTokenHash: newHash, updatedAt: sql`now()` } : { presentTokenHash: newHash, updatedAt: sql`now()` })
        .where(eq(presentations.editTokenHash, editHash))
        .returning(summary);
      return updated ?? null;
    },

    async getSettings(id) {
      const [found] = await db.select(settings).from(presentations).where(eq(presentations.id, id)).limit(1);
      return found ? asSettings(found) : null;
    },

    async updateSettings(editHash, patch) {
      const [updated] = await db
        .update(presentations)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(presentations.editTokenHash, editHash))
        .returning(settings);
      return updated ? asSettings(updated) : null;
    },
  };
}
