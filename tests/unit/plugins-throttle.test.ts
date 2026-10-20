import { describe, expect, it } from "vitest";

import { emptyLedger, flushDue, planBroadcast, type BroadcastLedger } from "@/lib/plugins/throttle";

describe("throttling трансляцій", () => {
  it("100 оновлень за 1 с: не більше 3 надсилань, останнє — фінальний стан", () => {
    let ledger: BroadcastLedger = emptyLedger();
    const sent: unknown[] = [];
    for (let i = 0; i < 100; i++) {
      const plan = planBroadcast(ledger, { publicState: { answers: i + 1 } }, i * 10);
      ledger = plan.ledger;
      if (plan.send) sent.push(plan.send.publicState);
    }
    const flush = flushDue(ledger, 1000);
    if (flush.send) sent.push(flush.send.publicState);

    expect(sent.length).toBeLessThanOrEqual(3);
    expect(sent.at(-1)).toEqual({ answers: 100 });
  });

  it("відкладений стан надсилається першим викликом після вікна, не раніше", () => {
    const first = planBroadcast(emptyLedger(), { publicState: 1 }, 0);
    const deferred = planBroadcast(first.ledger, { publicState: 2 }, 100);
    expect(deferred).toMatchObject({ send: null, flushAt: 500 });

    expect(flushDue(deferred.ledger, 499)).toMatchObject({ send: null, flushAt: 500 });
    const flushed = flushDue(deferred.ledger, 500);
    expect(flushed.send).toEqual({ publicState: 2 });
    expect(flushed.ledger).toEqual({ lastSentAt: 500, pending: null });
    expect(flushDue(flushed.ledger, 2000).send).toBeNull();
  });

  it("нова зміна після вікна надсилається одразу й замінює відкладену", () => {
    const first = planBroadcast(emptyLedger(), { publicState: 1 }, 0);
    const deferred = planBroadcast(first.ledger, { publicState: 2 }, 100);
    const next = planBroadcast(deferred.ledger, { publicState: 3 }, 600);
    expect(next.send).toEqual({ publicState: 3 });
    expect(next.ledger.pending).toBeNull();
  });

  it("broadcast: false нічого не планує", () => {
    const ledger = emptyLedger();
    expect(planBroadcast(ledger, { publicState: 1, broadcast: false }, 0)).toEqual({ ledger, send: null, flushAt: null });
  });
});
