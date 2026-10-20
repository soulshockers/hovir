import { sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";

import { LIMITS, retryAfterSeconds, windowCutoff, type Bucket, type LimitResult } from "./policy";

export interface RateLimiter {
  /** Атомарно зараховує звернення, якщо у вікні є місце. */
  hit(clientKey: string, bucket: Bucket, now: Date): Promise<LimitResult>;
  /** Перевіряє, чи ліміт уже вичерпано, нічого не зараховуючи. */
  peek(clientKey: string, bucket: Bucket, now: Date): Promise<LimitResult>;
}

type Executor = Pick<Database, "execute">;

const asDate = (value: unknown) => (value instanceof Date ? value : new Date(String(value)));

/**
 * Ліміти в Postgres, спільні для всіх екземплярів функцій. Один `INSERT … ON CONFLICT … DO UPDATE`
 * блокує рядок, тож паралельні запити одного клієнта не обходять ліміт.
 */
export function createRateLimiter(db: Executor): RateLimiter {
  async function cleanup(now: Date) {
    await db.execute(sql`delete from rate_limits where expires_at < ${now.toISOString()}::timestamptz`);
  }

  return {
    async hit(clientKey, bucket, now) {
      const policy = LIMITS[bucket];
      const at = sql`${now.toISOString()}::timestamptz`;
      const cutoff = sql`${windowCutoff(now, policy).toISOString()}::timestamptz`;
      const expires = sql`${new Date(now.getTime() + policy.windowMs).toISOString()}::timestamptz`;
      const kept = sql`array(select h from unnest(rate_limits.hits) h where h > ${cutoff} order by h)`;
      const hasRoom = sql`cardinality(${kept}) < ${policy.limit}`;

      await cleanup(now);
      const rows = await db.execute<{ last_allowed: boolean; oldest: unknown }>(sql`
        insert into rate_limits (client_key, bucket, hits, last_allowed, expires_at)
        values (${clientKey}, ${bucket}, array[${at}], true, ${expires})
        on conflict (client_key, bucket) do update set
          hits = case when ${hasRoom} then ${kept} || ${at} else ${kept} end,
          last_allowed = ${hasRoom},
          expires_at = case when ${hasRoom} then ${expires} else rate_limits.expires_at end
        returning last_allowed, (select min(h) from unnest(hits) h) as oldest
      `);
      const row = rows[0];
      if (row.last_allowed) return { allowed: true };
      return { allowed: false, retryAfterSeconds: retryAfterSeconds(asDate(row.oldest), now, policy) };
    },

    async peek(clientKey, bucket, now) {
      const policy = LIMITS[bucket];
      const cutoff = sql`${windowCutoff(now, policy).toISOString()}::timestamptz`;
      const rows = await db.execute<{ count: number; oldest: unknown }>(sql`
        select count(h)::int as count, min(h) as oldest
        from rate_limits, unnest(hits) h
        where client_key = ${clientKey} and bucket = ${bucket} and h > ${cutoff}
      `);
      const row = rows[0];
      if (!row || row.count < policy.limit) return { allowed: true };
      return { allowed: false, retryAfterSeconds: retryAfterSeconds(asDate(row.oldest), now, policy) };
    },
  };
}
