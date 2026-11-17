import { AnimationController } from "../src/graphics/animation.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { CampaignGame } from "../src/campaign-game.ts";
import { drain, solveRound } from "../src/developer.ts";
import { restore, serialize } from "../src/save.ts";
import { storyOffers } from "../src/story.ts";

test("free briefing stays identical through investments and reload", () => {
  const g = new CampaignGame(true);
  g.round = 30;
  g.startRound();
  g.status = "won";
  g.money(2000, "fixture");
  const plan = structuredClone(g.plan(31));
  g.beginDevelopment();
  assert.ok(g.buyModule("storage"));
  assert.deepEqual(g.plan(31), plan);
  const saved = restore(serialize(g));
  assert.deepEqual(saved.plan(31), plan);
  saved.nextRound();
  assert.deepEqual(saved.config, plan);
  assert.deepEqual(restore(serialize(saved)).config, plan);
  assert.equal(new Set(plan.pallets.map((p) => p.color)).size > 1, true);
});

test("regular clients are stable and one-off stories become ongoing cooperation", () => {
  const g = new CampaignGame(true);
  const offers = g.offers(12);
  assert.deepEqual(restore(serialize(g)).offers(12), offers);
  assert.ok(offers.every((o) => o.client));
  const free = Array.from({ length: 20 }, (_, i) =>
    storyOffers(31 + i, () => true),
  ).flat();
  assert.ok(free.length);
  assert.ok(free.every((o) => !o.line.includes("przewoźnik")));
  assert.ok(free.every((o) => !o.line.includes("prezenty dla dzieci")));
  for (let n = 31; n <= 50; n++) {
    const ids = storyOffers(n, () => true).map((o) => o.client);
    assert.equal(ids.length, new Set(ids).size);
  }
});

test("cleaning cancellation and loaded progress do not charge twice", async () => {
  const g = new CampaignGame(true);
  await solveRound(g);
  g.beginDevelopment();
  g.nextRound();
  const target = g.clutter[0],
    before = g.cash;
  assert.ok(g.clean(target));
  g.cancel();
  drain(g);
  g.advance(3);
  assert.ok(g.isClutter(target));
  assert.equal(g.cash, before);
  assert.ok(g.clean(target));
  drain(g);
  g.advance(0.5);
  assert.ok(g.isClutter(target));
  const resumed = restore(serialize(g));
  resumed.advance(3);
  assert.equal(resumed.cash, before - 5);
  assert.equal(resumed.isClutter(target), false);
  const again = restore(serialize(resumed));
  again.advance(10);
  assert.equal(again.cash, before - 5);
});
test("older accepted standard contracts retain their payout and client identity", () => {
  const game = new CampaignGame(true);
  game.round = 3;
  game.startRound();
  game.status = "summary";
  const offer = game.offers(4).find((o) => o.type !== "story")!;
  game.decideContract(offer.id, true);
  const envelope = JSON.parse(serialize(game));
  const payload = JSON.parse(envelope.payload);
  for (const field of ["bonus", "penalty", "client"])
    delete payload.game.contractLoads[offer.id][field];
  envelope.payload = JSON.stringify(payload);
  let hash = 2166136261;
  for (let i = 0; i < envelope.payload.length; i++)
    hash = Math.imul(hash ^ envelope.payload.charCodeAt(i), 16777619);
  envelope.checksum = (hash >>> 0).toString(16);
  const restored = restore(JSON.stringify(envelope));
  assert.equal(restored.contractLoads[offer.id].bonus, offer.bonus);
  assert.equal(restored.contractLoads[offer.id].client, offer.client);
  assert.equal(restored.contractLoads[offer.id].penalty, 60);
});
test("worker keeps facing the pallet through insertion and lift", () => {
  const game = new CampaignGame(true);
  game.dockCMR(game.cmrs[0].id);
  game.step(1.1);
  const crate = game.crates.find((c) => game.accessible(c.loc))!;
  game.selectWorker();
  assert.ok(game.choose(crate.id));
  assert.ok(game.order({ kind: "floor", x: 14, y: 3 }));
  const controller = new AnimationController();
  let insertion: number | undefined;
  let lifting = false;
  let lowering = false;
  for (let index = 0; game.task && index < 10000; index++) {
    const sample = controller.sample(game);
    if (game.transportState === "INSERT_FORKS") insertion = sample.direction;
    if (game.transportState === "LIFT") {
      assert.equal(sample.state, "push");
      assert.equal(sample.direction, insertion);
      lifting = true;
    }
    if (game.transportState === "LOWER") {
      assert.equal(sample.state, "push");
      lowering = true;
    }
    game.step(0.05);
  }
  assert.ok(lifting && lowering);
  assert.equal(game.task, null);
});
