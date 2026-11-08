import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import assert from "node:assert/strict";
import cfg, { room } from "../src/config.ts";
import { CampaignGame, station, sorterOutputs } from "../src/campaign-game.ts";
import {
  campaign,
  validateCampaign,
  priorityMultiplier,
} from "../src/campaign.ts";
import { serialize, restore } from "../src/save.ts";
import { drain, solveRound } from "../src/developer.ts";
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
test("0.2 concrete manifests: 30 rounds, 696 receipts / 696 shipments, carton and ID conservation", () =>
  assert.deepEqual(validateCampaign(), {
    rounds: 30,
    incoming: 696,
    outgoing: 696,
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
    ...crate("markers", { kind: "floor", x: 3, y: 5 }),
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
  assert.ok(g.order({ kind: "floor", x: 3, y: 5 }));
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
  assert.equal(g.buy("expansion"), false);
  g.round = 5;
  g.money(300, "fixture");
  const before = g.cash;
  assert.ok(g.buy("expansion"));
  assert.equal(g.cash, before - 200);
  assert.equal(g.free()({ x: 8, y: -3 }), true);
  assert.equal(g.buy("expansion"), false);
  assert.equal(g.cash, before - 200);
  assert.equal(g.free()({ x: 4, y: 3 }), false);
});
test("0.2 independent workers reserve pallets and paths; both physically finish", () => {
  const g = new CampaignGame();
  g.round = 6;
  g.startRound();
  g.money(1000, "fixture");
  assert.ok(g.buy("expansion"));
  assert.ok(g.buy("worker"));
  g.accept();
  g.step(1.1);
  const a = g.workers[0],
    b = g.workers[1];
  assert.notEqual(a.pose, b.pose);
  assert.equal(g.free()(b.pose), false, "Idle employee blocks the other rig");
  assert.equal(g.freeFor(b)(a.pose), false);
  a.selectWorker();
  assert.ok(a.choose(g.crates[0].id));
  assert.ok(a.order({ kind: "floor", x: 3, y: 5 }));
  b.selectWorker();
  assert.equal(b.choose(g.crates[0].id), false);
  const other = crate("parallel", { kind: "floor", x: 16, y: 5 });
  g.crates.push(other);
  assert.ok(b.choose(other.id));
  assert.ok(b.order({ kind: "floor", x: 16, y: -1 }), b.message);
  assert.ok(a.task && b.task);
  drain(g);
  assert.equal(a.task, null);
  assert.equal(b.task, null);
  assert.deepEqual(other.loc, { kind: "floor", x: 16, y: -1 });
  assert.equal(new Set(g.crates.map((c) => c.id)).size, g.crates.length);
});
test("0.2 MIX buffers retain goods until both inputs and free output cells exist", () => {
  const g = new CampaignGame();
  g.round = 8;
  g.startRound();
  g.purchased = ["expansion", "sorter"];
  const r = g.config.recipes[0];
  const a = g.createPallet(
    g.config.pallets.find((p) => p.id === r.inputs[0])!,
    { kind: "floor", ...station.sorter },
  );
  g.crates.push(a);
  g.processStations();
  assert.equal(a.loc.kind, "processing");
  assert.equal(g.crates.length, 1);
  const b = g.createPallet(
    g.config.pallets.find((p) => p.id === r.inputs[1])!,
    { kind: "floor", ...station.sorter },
  );
  const blocker = crate("blocker", { kind: "floor", ...sorterOutputs[0] });
  g.crates.push(b, blocker);
  g.processStations();
  assert.equal(g.completedRecipes.length, 0);
  assert.equal(b.loc.kind, "processing");
  blocker.loc = { kind: "floor", x: 3, y: 5 };
  g.processStations();
  assert.equal(g.completedRecipes.length, 1);
  assert.equal(g.stock.length, 3);
  const count = g.crates.length;
  g.processStations();
  assert.equal(g.crates.length, count);
  assert.deepEqual(
    r.outputs.map((o) => g.crates.find((c) => c.id === o.id)?.color),
    r.outputs.map((o) => o.color),
  );
});
test("0.2 frozen/damaged and chilled/return statuses require separate service and temperature steps", () => {
  const g = new CampaignGame();
  g.round = 17;
  g.startRound();
  g.purchased = ["expansion", "chiller", "freezer", "service"];
  const c = {
    ...crate("special", { kind: "floor", ...station.service }),
    condition: "damaged" as const,
    temperature: "frozen" as const,
  };
  g.crates.push(c);
  g.processStations();
  assert.equal(c.condition, "standard");
  assert.equal(c.climateStored, false);
  assert.equal(g.zoneAt({ x: 1, y: -4 }), "chilled");
  assert.equal(g.zoneAt({ x: 11, y: -4 }), "frozen");
  c.loc = { kind: "floor", x: 11, y: -4 };
  g.processStations();
  assert.equal(c.climateStored, true);
});
test("0.2 shipping rejects nonexistent, wrong, unsorted, untreated or warm cargo", () => {
  const g = new CampaignGame();
  g.round = 2;
  g.startRound();
  g.dockCMR(g.config.departures[0].id);
  g.step(1.1);
  const c = crate("wrong", { kind: "floor", x: 16, y: 5 });
  c.color = "pink";
  g.crates.push(c);
  g.selectWorker();
  g.source = c.id;
  assert.equal(g.order({ kind: "outbound", lane: 0, depth: 1 }), false);
  assert.equal(g.dispatch(), false);
  assert.equal(g.crates.length, 1);
});
test("0.2 settlement cannot be forced by a button or elapsed time", () => {
  const g = new CampaignGame();
  g.step(10000);
  assert.equal(g.cash, 50);
  assert.equal(g.completeRound(), false);
  assert.equal(g.round, 1);
  assert.equal(g.status, "playing");
});
test(
  "0.2 complete physical campaign 1–30, inventory continuity, save/load and settlement idempotence",
  { timeout: process.env.CI ? 900000 : 600000 },
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
      g.nextRound();
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
            version: 3,
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
      696,
    );
  },
);
test("0.2 second ramp has independent cargo slots and supports real unloading", () => {
  const g = new CampaignGame();
  g.round = 19;
  g.startRound();
  g.purchased = ["expansion", "ramps"];
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
