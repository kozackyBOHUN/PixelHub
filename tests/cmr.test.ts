import { test } from "node:test";
import assert from "node:assert/strict";
import { CampaignGame, WarehouseWorker } from "../src/campaign-game.ts";
import type { Crate } from "../src/simulation.ts";
import { displayColor, remainingRounds } from "../src/shipments.ts";
import type { DestinationColor } from "../src/shipments.ts";
import { campaign, validateCampaign, upgrades } from "../src/campaign.ts";
import { serialize, restore } from "../src/save.ts";

function pallet(
  id: string,
  color: DestinationColor = "red",
  due = 2,
  x = 3,
): Crate {
  return {
    id,
    color,
    destinationColor: color,
    dispatchRound: due,
    temperature: "standard",
    condition: "standard",
    active: due <= 2,
    paid: true,
    loc: { kind: "floor", x, y: 3 },
  };
}
function fixture() {
  const g = new CampaignGame();
  g.round = 2;
  g.startRound();
  const red = pallet("red");
  g.crates.push(red);
  return { g, red, truck: g.shippingAt()! };
}
const slot = { kind: "outbound", lane: 0, depth: 1, bay: 0 } as const;
test("A/E ready red cargo can use the owned truck regardless of physical identifier", () => {
  const { g, red, truck } = fixture();
  const second = pallet("independent-id", "red", 2, 2);
  g.crates.push(second);
  assert.ok(g.canLoad(truck, red));
  assert.ok(g.canLoad(truck, second));
  g.selectWorker();
  assert.ok(g.choose(red.id), g.message);
  assert.ok(g.order(slot), g.message);
  g.advance(200);
  assert.deepEqual(red.loc, g.locateSlot(slot));
  assert.ok(g.dispatchBay());
  assert.equal(g.shipped.length, 0, "departure animation has not finished");
  const loaded = restore(serialize(g));
  loaded.step(45.1);
  assert.deepEqual(loaded.shipped, [red.id]);
  assert.equal(
    loaded.crates.find((c) => c.id === red.id)?.loc.kind,
    "delivered",
  );
  assert.ok(loaded.stock.some((c) => c.id === second.id));
  assert.equal(loaded.dispatchBay(), false);
});
test("B/C mixed colors are accepted and gray cargo is refused", () => {
  const { g, truck } = fixture();
  const blue = pallet("blue", "blue");
  const held = pallet("held", "red", 4);
  assert.equal(displayColor(held, 2), "gray");
  assert.equal(remainingRounds(held, 2), 2);
  assert.equal(g.canLoad(truck, blue), true);
  assert.equal(g.canLoad(truck, held), false);
  assert.equal(
    g.canLoad(truck, {
      ...held,
      dispatchRound: 2,
      mix: [{ color: "red", cartons: 4 }],
    }),
    false,
  );
  assert.equal(
    g.canLoad(truck, { ...held, dispatchRound: 2, condition: "damaged" }),
    false,
  );
  assert.equal(
    g.canLoad(truck, { ...held, dispatchRound: 2, temperature: "frozen" }),
    false,
  );
});
test("D two phase transitions reveal the destination and permit shipping", () => {
  const { g } = fixture();
  const held = pallet("later", "red", 4, 2);
  g.crates.push(held);
  for (let round = 3; round <= 4; round++) {
    g.status = "summary";
    assert.ok(g.beginDevelopment());
    g.nextRound();
    assert.equal(g.round, round);
    assert.equal(remainingRounds(held, round), 4 - round);
  }
  assert.equal(displayColor(held, 4), "red");
  assert.ok(g.canLoad(g.shippingAt()!, held));
});
test("F finishing round 2 depends on arrivals and dispatched pallets, without outgoing CMR", () => {
  const { g, red } = fixture();
  const blue = pallet("blue", "blue", 2, 2);
  g.crates.push(blue);
  for (let i = 0; i < 8; i++)
    g.crates.push(pallet(`stock-${i}`, "red", 4, [1, 2, 3, 4, 12, 16, 17, 18][i]));
  g.cmrs.forEach((m) => (m.state = "done"));
  assert.equal(g.roundReady, false);
  red.loc = { ...slot };
  assert.ok(g.dispatchBay());
  g.step(31.2);
  g.step(1.1);
  assert.equal(g.roundReady, false);
  blue.loc = { ...slot };
  assert.ok(g.dispatchBay());
  g.step(31.2);
  g.step(1.1);
  assert.equal(g.roundReady, false);
  assert.equal(
    g.cmrs.some((m) => String(m.kind) === "outbound"),
    false,
  );
  assert.equal(g.status, "summary");
  assert.equal(g.completeRound(), false);
  assert.equal(g.settlement?.sent, 2);
  assert.equal(g.settlement?.wages, 20);
  const cash = g.cash;
  assert.equal(restore(serialize(g)).completeRound(), false);
  assert.equal(g.cash, cash);
});
test("round 3 has selectable arrival cargo 8/8/4; all 30 dispatch schedules balance", () => {
  assert.deepEqual(
    campaign[2].arrivals.map((m) => m.palletIds.length),
    [8, 8, 4],
  );
  assert.equal(validateCampaign().outgoing, 1010);
  for (const index of [2, 0, 1]) {
    const g = new CampaignGame();
    g.round = 3;
    g.startRound();
    assert.ok(g.dockCMR(g.config.arrivals[index].id));
    assert.equal(g.crates.length, [8, 8, 4][index]);
  }
});
test("concurrent workers cannot reserve the same physical slot", () => {
  const { g, red } = fixture();
  const other = new WarehouseWorker(g);
  other.pose = { x: 17, y: 1, d: 4 };
  g.workers.push(other);
  other.task = { crate: "other", dest: slot } as typeof other.task;
  g.source = red.id;
  assert.equal(g.validOrder(g, slot), false);
  assert.match(g.message, /zarezerwowany/);
});
function legacySave(game: CampaignGame, version: 2 | 3, outgoing: object[]) {
  const envelope = JSON.parse(serialize(game));
  const payload = JSON.parse(envelope.payload);
  payload.game.cmrs.push(...outgoing);
  for (const field of [
    "trucks",
    "shipped",
    "pendingWorkers",
    "developmentRound",
    "ledgerStart",
    "roundMetrics",
    "settlement",
  ])
    delete payload.game[field];
  const text = JSON.stringify(payload);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return JSON.stringify({
    version,
    payload: text,
    checksum: (hash >>> 0).toString(16),
  });
}
for (const version of [2, 3] as const) {
  test("legacy geometry is not silently loaded as modular geometry", () => {
    assert.throws(() => restore(JSON.stringify({ version })), /wersja/);
  });
}
test("development is exclusive, purchases persist and hiring starts next round", () => {
  const g = new CampaignGame();
  g.round = 5;
  g.startRound();
  assert.equal(g.buyModule("storage"), false);
  g.status = "summary";
  assert.ok(g.beginDevelopment());
  assert.equal(g.cash, 585);
  g.money(1000, "fixture");
  assert.ok(g.buyModule("storage"));
  assert.ok(g.buy("worker"));
  assert.equal(g.workers.length, 1);
  assert.equal(g.levels.storage, 2);
  const saved = restore(serialize(g));
  assert.equal(saved.status, "development");
  assert.equal(
    saved.cash,
    1585 - 200 - upgrades.worker.cost,
  );
  assert.equal(saved.pendingWorkers.length, 1);
  saved.nextRound();
  assert.equal(saved.round, 6);
  assert.equal(saved.workers.length, 2);
  assert.equal(saved.minY, -4);
  assert.equal(saved.buy("worker"), false);
  saved.nextRound();
  assert.equal(saved.round, 6);
});
test("skip a development phase and recover missing equipment before accepting cargo", () => {
  const g = new CampaignGame();
  g.round = 7;
  g.startRound();
  g.status = "summary";
  g.money(1000, "fixture");
  g.levels.storage = 2;
  assert.ok(g.beginDevelopment());
  g.nextRound();
  assert.equal(g.round, 8);
  const id = g.cmrs[0].id;
  assert.equal(g.dockCMR(id), false);
  assert.ok(g.beginDevelopment());
  assert.ok(g.installSorter(g.findSorterSite()!), g.message);
  g.nextRound();
  assert.equal(g.round, 8);
  assert.ok(g.purchased.includes("sorter"));
  assert.ok(g.dockCMR(id));
});

test("bankruptcy at settlement excludes the shop and next round", () => {
  const g = new CampaignGame();
  g.money(10 - g.cash, "fixture");
  const other = new WarehouseWorker(g);
  other.pose = { x: 17, y: 1, d: 4 };
  g.workers.push(other);
  for (const [i, x] of [1, 2, 3, 16].entries())
    g.crates.push(pallet(`stock-${i}`, "red", 2, x));
  g.cmrs.forEach((m) => (m.state = "done"));
  assert.ok(g.completeRound());
  assert.equal(g.status, "lost");
  assert.equal(g.settlement?.wages, 40);
  assert.equal(g.beginDevelopment(), false);
  assert.equal(g.buy("worker"), false);
  g.nextRound();
  assert.equal(g.round, 1);
});
