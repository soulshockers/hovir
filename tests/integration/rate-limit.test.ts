import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/rate-limit/store";

import { cleanupTestData, hasDatabase, openTestDb, testClientKey } from "./db";

const TEST_IP = "198.51.100.200";
const STALE_IP = "198.51.100.201";

describe.skipIf(!hasDatabase)("rate limiting у Postgres", () => {
  const { sql, db } = hasDatabase ? openTestDb() : ({} as ReturnType<typeof openTestDb>);
  const limiter = hasDatabase ? createRateLimiter(db) : undefined!;
  const key = testClientKey(TEST_IP);
  const staleKey = testClientKey(STALE_IP);

  beforeEach(() => cleanupTestData(sql, [key, staleKey]));
  afterAll(async () => {
    await cleanupTestData(sql, [key, staleKey]);
    await sql.end();
  });

  it("20 паралельних звернень до create — рівно 10 дозволених", async () => {
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 20 }, () => limiter.hit(key, "create", now)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    const rejected = results.filter((r) => !r.allowed);
    expect(rejected).toHaveLength(10);
    for (const r of rejected) if (!r.allowed) expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("після спливу вікна лічильник починається заново", async () => {
    const start = new Date();
    for (let i = 0; i < 10; i++) await limiter.hit(key, "create", start);
    expect((await limiter.hit(key, "create", start)).allowed).toBe(false);

    const afterWindow = new Date(start.getTime() + 10 * 60_000 + 1000);
    expect((await limiter.hit(key, "create", afterWindow)).allowed).toBe(true);
    const [row] = await sql<{ n: number }[]>`
      select cardinality(hits) as n from rate_limits where client_key = ${key} and bucket = 'create'`;
    expect(row.n).toBe(1);
  });

  it("peek не зараховує звернення й бачить вичерпаний ліміт", async () => {
    const now = new Date();
    expect((await limiter.peek(key, "password_fail", now)).allowed).toBe(true);
    for (let i = 0; i < 5; i++) await limiter.hit(key, "password_fail", now);
    const result = await limiter.peek(key, "password_fail", now);
    expect(result.allowed).toBe(false);
    const [row] = await sql<{ n: number }[]>`
      select cardinality(hits) as n from rate_limits where client_key = ${key} and bucket = 'password_fail'`;
    expect(row.n).toBe(5);
  });

  it("прострочені записи видаляються під час наступного звернення", async () => {
    await sql`
      insert into rate_limits (client_key, bucket, hits, last_allowed, expires_at)
      values (${staleKey}, 'create', array[now() - interval '1 day'], true, now() - interval '1 hour')`;
    await limiter.hit(key, "create", new Date());
    const rows = await sql`select 1 from rate_limits where client_key = ${staleKey}`;
    expect(rows).toHaveLength(0);
  });

  it("у сховищі немає сирої IP-адреси", async () => {
    await limiter.hit(key, "create", new Date());
    const rows = await sql`select 1 from rate_limits where client_key like ${"%" + TEST_IP + "%"}`;
    expect(rows).toHaveLength(0);
    const [stored] = await sql<{ client_key: string }[]>`select client_key from rate_limits where client_key = ${key}`;
    expect(stored.client_key).toMatch(/^[0-9a-f]{64}$/);
  });
});
