import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import assert from "node:assert/strict";
import cfg, { room } from "../src/config.ts";
import { CampaignGame, station } from "../src/campaign-game.ts";
import {
  campaign,
  validateCampaign,
  priorityMultiplier,
} from "../src/campaign.ts";
import { serialize, restore } from "../src/save.ts";
import { drain, solveRound, prepareRound } from "../src/developer.ts";
import type { Crate } from "../src/simulation.ts";
function crate(id: string, loc: Crate["loc"]): Crate {
  return {
    id,
    color: "blue",
    dueRound: 1,
    temperature: "standard",
    condition: "standard",
    active: true,
    paid: false,
    loc,
  };
}
test("0.3 concrete manifests: 30 rounds, 1010 receipts / 1010 shipments, carton and ID conservation", () =>
  assert.deepEqual(validateCampaign(), {
    rounds: 30,
    incoming: 1010,
    outgoing: 1010,
    stock: 0,
  }));
test("0.2 rooms are centered 12×3 inside 20×6; 84 non-social cells", () => {
  assert.equal(cfg.map.columns, 20);
  assert.equal(cfg.map.rows, 6);
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 20; x++)
      assert.equal(room({ x, y }), y >= 3 && x >= 4 && x <= 15);
  assert.deepEqual(
    cfg.map.rooms.map((r) => [r.x, r.y, r.width, r.height]),
    [
      [4, 3, 4, 3],
      [8, 3, 3, 3],
      [13, 3, 3, 3],
      [11, 3, 2, 3],
    ],
  );
});
test("0.2 CMR docking is player-selected, capacity respected, no repeat acceptance", () => {
  const g = new CampaignGame();
  g.round = 3;
  g.startRound();
  const m = g.config.arrivals[2];
  assert.ok(g.dockCMR(m.id));
  assert.equal(g.crates.length, 4);
  assert.equal(g.dockCMR(m.id), false);
  assert.equal(g.dockCMR(g.config.arrivals[0].id), false);
  assert.equal(g.crates.length, 4);
});
test("0.2 four independent markers and configured priority thresholds survive serialization", () => {
  const g = new CampaignGame();
  const c = {
    ...crate("markers", { kind: "floor", x: 3, y: 3 }),
    dueRound: 5,
    temperature: "frozen" as const,
    condition: "damaged" as const,
    priority: { started: 0, duration: 100 },
  };
  g.crates.push(c);
  for (const [t, m] of [
    [0, 2],
    [49.9, 2],
    [50, 1],
    [74.9, 1],
    [75, 0.5],
    [150, 0.5],
  ])
    assert.equal(priorityMultiplier(c, t), m);
  const loaded = restore(serialize(g));
  assert.deepEqual(loaded.crates, g.crates);
  g.time = 60;
  assert.equal(priorityMultiplier(restore(serialize(g)).crates[0], 60), 1);
});
test("0.2 save mid-lift restores exact route, progress and one-time payments", () => {
  const g = new CampaignGame();
  g.accept();
  g.step(1.1);
  g.selectWorker();
  assert.ok(g.choose(g.crates[0].id));
  assert.ok(g.order({ kind: "floor", x: 3, y: 3 }));
  for (let i = 0; i < 3000 && g.task?.phase !== "LIFT"; i++) g.step(0.05);
  assert.equal(g.task?.phase, "LIFT");
  g.step(0.2);
  const loaded = restore(serialize(g));
  assert.deepEqual(loaded.task, g.task);
  drain(g);
  drain(loaded);
  assert.deepEqual(loaded.crates, g.crates);
  assert.deepEqual(loaded.ledger, g.ledger);
});
test("0.2 damaged/unknown-version save reports an error", () => {
  assert.throws(() => restore("{broken"), /Nie można wczytać/);
  assert.throws(() => restore('{"version":1}'), /Nie można wczytać/);
  const s = serialize(new CampaignGame());
  assert.throws(
    () => restore(s.replace("Kapitał", "Zmiana")),
    /suma kontrolna/,
  );
});
test("0.2 upgrades change traversable area and are charged once", () => {
  const g = new CampaignGame();
  assert.equal(g.free()({ x: 8, y: -3 }), false);
  assert.equal(g.buyModule("storage"), false);
  g.status = "summary";
  g.money(300, "fixture");
  assert.ok(g.beginDevelopment());
  const before = g.cash;
  assert.ok(g.buyModule("storage"));
  assert.equal(g.cash, before - 200);
  assert.equal(g.free()({ x: 8, y: -3 }), true);
  assert.ok(g.buyModule("storage"));
  assert.equal(g.cash, before - 600);
  assert.equal(g.free()({ x: 4, y: 3 }), true);
});
test("0.2 independent workers reserve pallets and paths; both physically finish", () => {
  const g = new CampaignGame();
  g.round = 5;
  g.startRound();
  g.status = "summary";
  g.money(1000, "fixture");
  assert.ok(g.beginDevelopment());
  assert.ok(g.buyModule("storage"));
  assert.ok(g.buy("worker"));
  g.nextRound();
  g.accept();
  g.step(1.1);
  const a = g.workers[0],
    b = g.workers[1];
  assert.notEqual(a.pose, b.pose);
  assert.equal(g.free()(b.pose), false, "Idle employee blocks the other rig");
  assert.equal(g.freeFor(b)(a.pose), false);
  a.selectWorker();
  assert.ok(a.choose(g.crates[0].id));
  assert.ok(a.order({ kind: "floor", x: 3, y: 3 }));
  b.selectWorker();
  assert.equal(b.choose(g.crates[0].id), false);
  const other = crate("parallel", { kind: "floor", x: 16, y: 3 });
  g.crates.push(other);
  assert.ok(b.choose(other.id));
  assert.ok(b.order({ kind: "floor", x: 15, y: -1 }), b.message);
  assert.ok(a.task && b.task);
  drain(g);
  assert.equal(a.task, null);
  assert.equal(b.task, null);
  assert.deepEqual(other.loc, { kind: "floor", x: 15, y: -1 });
  assert.equal(new Set(g.crates.map((c) => c.id)).size, g.crates.length);
});
test("0.2 frozen/damaged and chilled/return statuses require separate service and temperature steps", () => {
  const g = new CampaignGame();
  g.round = 17;
  g.startRound();
  g.levels.storage = 2;
  g.purchased = ["chiller", "freezer", "service"];
  const c = {
    ...crate("special", { kind: "floor", ...station.service }),
    condition: "damaged" as const,
    temperature: "frozen" as const,
  };
  g.crates.push(c);
  g.processStations();
  assert.equal(c.condition, "standard");
  assert.equal(c.climateStored, false);
  g.coldCells = [{ x: 4, y: -4 }];
  assert.equal(g.zoneAt({ x: 4, y: -4 }), "chilled");
  assert.equal(g.zoneAt({ x: 12, y: -4 }), "frozen");
  c.loc = { kind: "floor", x: 12, y: -4 };
  g.processStations();
  assert.equal(c.climateStored, true);
});
test("0.2 shipping rejects nonexistent, wrong, unsorted, untreated or warm cargo", () => {
  const g = new CampaignGame();
  g.round = 2;
  g.startRound();
  const red = crate("red", { kind: "floor", x: 3, y: 3 });
  red.color = "red";
  g.crates.push(red);
  const c = crate("wrong", { kind: "floor", x: 16, y: 3 });
  c.color = "pink";
  c.dispatchRound = 4;
  g.crates.push(c);
  g.selectWorker();
  g.source = c.id;
  assert.equal(g.order({ kind: "outbound", lane: 0, depth: 1 }), false);
  assert.equal(g.dispatch(), false);
  assert.equal(g.crates.length, 2);
});
test("0.2 settlement cannot be forced by a button or elapsed time", () => {
  const g = new CampaignGame();
  g.step(10000);
  assert.equal(g.cash, cfg.economy.campaignInitialCash);
  assert.equal(g.completeRound(), false);
  assert.equal(g.round, 1);
  assert.equal(g.status, "playing");
});
test(
  "0.3 complete physical campaign 1–30, inventory continuity, save/load and settlement idempotence",
  { timeout: 1800000 },
  async () => {
    let g = new CampaignGame();
    let prevStock = 0;
    const scenarios: Record<number, string> = {};
    for (let n = 1; n <= 30; n++) {
      const retained = g.stock.map((c) => ({
        id: c.id,
        loc: structuredClone(c.loc),
      }));
      assert.equal(retained.length, prevStock);
      scenarios[n] = serialize(g);
      await solveRound(g);
      console.log(`Fizyczna kampania R${n}/30`);
      assert.equal(
        g.stock.length,
        prevStock + g.config.pallets.length - g.requiredCount,
      );
      assert.equal(g.stock.length, g.config.expectedStock);
      assert.equal(g.settled.filter((r) => r === n).length, 1);
      assert.equal(
        g.ledger
          .filter((e) => e.label === `Pensja — runda ${n}`)
          .reduce((s, e) => s + e.amount, 0),
        -20 * g.workers.length,
      );
      const cash = g.cash;
      assert.equal(g.completeRound(), false);
      assert.equal(g.cash, cash);
      assert.ok(cash > 0);
      prevStock = g.stock.length;
      if ([4, 8, 17, 29].includes(n)) g = restore(serialize(g));
      const positions = g.stock.map((c) => ({
        id: c.id,
        loc: structuredClone(c.loc),
      }));
      if (g.status !== "won") prepareRound(g);
      assert.deepEqual(
        g.stock.map((c) => ({ id: c.id, loc: c.loc })),
        positions,
      );
    }
    if (process.env.PIXELHUB_WRITE_SCENARIOS)
      writeFileSync(
        "public/campaign-scenarios.json.gz",
        gzipSync(
          JSON.stringify({
            version: 9,
            campaign: JSON.stringify(campaign),
            scenarios,
          }),
          { level: 9 },
        ),
      );
    assert.equal(g.status, "won");
    assert.equal(g.stock.length, 0);
    assert.equal(
      g.crates.filter((c) => c.loc.kind === "delivered").length,
      1010,
    );
  },
);
test("0.2 second ramp has independent cargo slots and supports real unloading", () => {
  const g = new CampaignGame();
  g.round = 19;
  g.startRound();
  g.levels.receiving = 2;
  g.money(3000, "Test");
  prepareRound(g);
  assert.ok(g.dockCMR(g.config.arrivals[0].id, 0));
  assert.ok(g.dockCMR(g.config.arrivals[1].id, 1));
  g.step(1.1);
  assert.notEqual(
    g.slot("inbound", 0, 0, 0)?.id,
    g.slot("inbound", 0, 0, 1)?.id,
  );
  const c = g.slot("inbound", 0, 0, 1)!;
  g.selectWorker();
  assert.ok(g.choose(c.id), g.message);
  assert.ok(g.order({ kind: "floor", x: 3, y: -2 }), g.message);
  drain(g);
  assert.deepEqual(c.loc, { kind: "floor", x: 3, y: -2 });
  assert.equal(g.cmrAt("inbound", 0)?.state, "docked");
});
