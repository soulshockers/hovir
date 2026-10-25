import { asc, eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { presentations, slides } from "@/lib/db/schema";

import type { SlideRecord, SlideRepo, SlideTx } from "./service";

const record = {
  id: slides.id,
  presentationId: slides.presentationId,
  position: slides.position,
  pluginId: slides.pluginId,
  pluginVersion: slides.pluginVersion,
  config: slides.config,
  updatedAt: slides.updatedAt,
};

type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

const listOf = (db: Executor, presentationId: string): Promise<SlideRecord[]> =>
  db.select(record).from(slides).where(eq(slides.presentationId, presentationId)).orderBy(asc(slides.position), asc(slides.createdAt));

export function createSlideRepo(db: Database): SlideRepo {
  return {
    list: (presentationId) => listOf(db, presentationId),

    // Транзакція блокує рядок презентації: мутації списку однієї презентації йдуть по черзі, а позиції лишаються 0..n−1.
    withPresentation(presentationId, fn) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select 1 from ${presentations} where ${presentations.id} = ${presentationId} for update`);
        const scope = sql`${slides.presentationId} = ${presentationId}`;
        const ops: SlideTx = {
          list: () => listOf(tx, presentationId),

          async insert(slide) {
            const [created] = await tx
              .insert(slides)
              .values({ presentationId, position: slide.position, pluginId: slide.pluginId, pluginVersion: slide.pluginVersion, config: slide.config })
              .returning(record);
            return created;
          },

          async remove(id) {
            await tx.delete(slides).where(sql`${slides.id} = ${id} and ${scope}`);
          },

          async setOrder(ids) {
            if (ids.length === 0) return;
            const list = sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            );
            await tx.execute(sql`
              update ${slides} set position = o.pos - 1
              from unnest(array[${list}]::uuid[]) with ordinality as o(id, pos)
              where ${slides.id} = o.id and ${scope} and ${slides.position} <> o.pos - 1
            `);
          },

          async updateConfig(id, config, pluginVersion) {
            const [updated] = await tx
              .update(slides)
              .set({ config, pluginVersion, updatedAt: sql`now()` })
              .where(sql`${slides.id} = ${id} and ${scope}`)
              .returning(record);
            return updated;
          },
        };
        const result = await fn(ops);
        await tx.update(presentations).set({ updatedAt: sql`now()` }).where(eq(presentations.id, presentationId));
        return result;
      });
    },
  };
}
