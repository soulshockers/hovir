import { count, desc, eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { presentations } from "@/lib/db/schema";

import type { PresentationAdminRepo } from "./service";

const summary = {
  id: presentations.id,
  title: presentations.title,
  createdAt: presentations.createdAt,
  updatedAt: presentations.updatedAt,
};

export function createAdminRepo(db: Database): PresentationAdminRepo {
  return {
    async list(offset, limit) {
      const [items, [{ total }]] = await Promise.all([
        db.select(summary).from(presentations).orderBy(desc(presentations.createdAt), desc(presentations.id)).limit(limit).offset(offset),
        db.select({ total: count() }).from(presentations),
      ]);
      return { items, total };
    },

    async replaceAllTokenHashes(id, editHash, presentHash) {
      const [updated] = await db
        .update(presentations)
        .set({ editTokenHash: editHash, presentTokenHash: presentHash, updatedAt: sql`now()` })
        .where(eq(presentations.id, id))
        .returning(summary);
      return updated ?? null;
    },

    async delete(id) {
      const deleted = await db.delete(presentations).where(eq(presentations.id, id)).returning({ id: presentations.id });
      return deleted.length > 0;
    },
  };
}
