import assert from "node:assert/strict";
import test from "node:test";
import { CampaignGame } from "../src/campaign-game.ts";
import { validateCampaign } from "../src/campaign.ts";
import { restore, serialize } from "../src/save.ts";

test("base campaign balances 1010 physical pallet records", () => {
  assert.deepEqual(validateCampaign(), {
    rounds: 30,
    incoming: 1010,
    outgoing: 1010,
    stock: 0,
  });
});
test("accepted contracts produce an inbound truck, rejection is free, failure is charged once", () => {
  const g = new CampaignGame();
  g.round = 3;
  g.startRound();
  g.status = "summary";
  const [offer] = g.offers(4);
  const reject = restore(serialize(g));
  assert.ok(reject.decideContract(offer.id, false));
  assert.ok(reject.beginDevelopment());
  reject.nextRound();
  assert.ok(!reject.cmrs.some((m) => m.id === offer.id));
  assert.equal(reject.cash, g.cash);
  assert.ok(g.decideContract(offer.id, true));
  assert.ok(g.beginDevelopment());
  g.nextRound();
  assert.ok(g.dockCMR(offer.id));
  assert.equal(g.crates.length, offer.pallets.length);
  const cash = g.cash;
  assert.ok(g.failContract(offer.id));
  assert.equal(g.cash, cash - 60);
  assert.ok(!g.failContract(offer.id));
});
test("three queued movements survive reload, reject conflicts and run physically", () => {
  const g = new CampaignGame();
  assert.ok(g.dockCMR(g.cmrs[0].id));
  g.step(1.1);
  const cargo = [...g.crates];
  for (const [i, c] of cargo.entries()) {
    const dest = { kind: "floor", x: 6 + i, y: 3 } as const;
    assert.equal(g.enqueue(0, c.id, dest), i < 3);
  }
  const copy = restore(serialize(g));
  assert.equal(copy.queue(0).length, 3);
  for (let i = 0; i < 10000 && (copy.task || copy.queue(0).length); i++)
    copy.step(0.05);
  assert.equal(copy.queue(0).length, 0);
  assert.equal(copy.task, null);
  assert.equal(copy.crates.filter((c) => c.loc.kind === "floor").length, 3);
});
