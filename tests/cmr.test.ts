import { test } from "node:test";
import assert from "node:assert/strict";
import { CampaignGame, WarehouseWorker } from "../src/campaign-game.ts";
import type { Crate } from "../src/simulation.ts";
import { displayColor, matchCargo } from "../src/shipments.ts";
import { campaign, validateCampaign } from "../src/campaign.ts";
import { serialize, restore } from "../src/save.ts";
function pallet(id: string, color: Crate["color"] = "red", due = 2): Crate {
  return {
    id,
    color,
    destinationColor: color as "red",
    dispatchRound: due,
    temperature: "standard",
    condition: "standard",
    active: due <= 2,
    paid: false,
    loc: { kind: "floor", x: 0, y: 0 },
  };
}
function fixture() {
  const g = new CampaignGame();
  g.round = 2;
  g.startRound();
  const m = g.cmrs.find((m) => m.kind === "outbound")!;
  m.requirements = [{ color: "red", quantity: 2 }];
  g.dockCMR(m.id);
  g.step(1.1);
  return { g, m };
}
function load(c: Crate, lane: number, depth = 0) {
  c.loc = { kind: "outbound", lane, depth, bay: 0 };
}
test("A any pair of three different ready red physical IDs satisfies the same CMR", () => {
  for (const pair of [
    [0, 1],
    [0, 2],
    [1, 2],
  ]) {
    const { g, m } = fixture();
    const cs = ["a", "b", "c"].map((id) => pallet(id));
    g.crates.push(...cs);
    pair.forEach((i, n) => {
      assert.ok(g.canLoad(m, cs[i]));
      load(cs[i], n);
    });
    assert.ok(g.progress(m).complete);
    assert.ok(g.dispatchBay());
    assert.deepEqual(
      new Set(m.shippedPalletIds),
      new Set(pair.map((i) => cs[i].id)),
    );
  }
});
test("B future red remains gray and cannot satisfy or reserve a present red order", () => {
  const { g, m } = fixture();
  const now = pallet("now"),
    future = pallet("future", "red", 4);
  g.crates.push(now, future);
  assert.equal(displayColor(future, 2), "gray");
  assert.ok(g.canLoad(m, now));
  assert.equal(g.canLoad(m, future), false);
  g.source = future.id;
  assert.equal(g.validOrder(g, { kind: "outbound", lane: 0, depth: 0 }), false);
});
test("C date automatically exposes destination color and permits shipping at the due round", () => {
  const { g, m } = fixture();
  const c = pallet("later", "red", 4);
  g.crates.push(c);
  g.round = 4;
  assert.equal(displayColor(c, g.round), "red");
  assert.ok(g.canLoad(m, c));
});
test("D/E color ticks reflect physical cargo, unloading reverses progress, fourth red rejected", () => {
  const { g, m } = fixture();
  m.requirements = [
    { color: "red", quantity: 3 },
    { color: "blue", quantity: 2 },
  ];
  const cs = [
    pallet("b", "blue"),
    pallet("r1"),
    pallet("r2"),
    pallet("r3"),
    pallet("b2", "blue"),
    pallet("r4"),
  ];
  g.crates.push(...cs);
  for (let i = 0; i < 5; i++) {
    assert.ok(g.canLoad(m, cs[i]));
    load(cs[i], i % 2, Math.floor(i / 2));
    assert.equal(g.progress(m).loaded, i + 1);
  }
  assert.deepEqual(g.progress(m).counts, [3, 2]);
  assert.equal(g.canLoad(m, cs[5]), false);
  cs[1].loc = { kind: "floor", x: 0, y: 0 };
  assert.deepEqual(g.progress(m).counts, [2, 2]);
  assert.ok(g.canLoad(m, cs[5]));
});
test("F save/load preserves physical load, colors, dates and derived CMR progress", () => {
  const { g, m } = fixture();
  const a = pallet("actual"),
    b = pallet("held", "blue", 4);
  load(a, 0);
  b.loc = { kind: "floor", x: 1, y: 5 };
  g.crates.push(a, b);
  const restored = restore(serialize(g));
  assert.deepEqual(restored.crates, g.crates);
  assert.deepEqual(
    restored.progress(restored.cmrs.find((x) => x.id === m.id)!),
    g.progress(m),
  );
  assert.equal(displayColor(restored.crates[1], 2), "gray");
  assert.equal(
    restored.canLoad(
      restored.cmrs.find((x) => x.id === m.id)!,
      restored.crates[1],
    ),
    false,
  );
});
test("G round 3 has independently selectable arrival cargo 8/8/4", () => {
  assert.deepEqual(
    campaign[2].arrivals.map((m) => m.palletIds.length),
    [8, 8, 4],
  );
  for (const index of [2, 0, 1]) {
    const g = new CampaignGame();
    g.round = 3;
    g.startRound();
    assert.ok(g.dockCMR(g.config.arrivals[index].id));
    assert.equal(g.crates.length, [8, 8, 4][index]);
  }
});
test("H all30 color manifests balance, no gray destination or ID based outgoing orders", () => {
  assert.equal(validateCampaign().outgoing, 696);
  for (const r of campaign) {
    for (const m of r.departures) {
      assert.equal(m.palletIds.length, 0);
      assert.ok(m.requirements?.length);
    }
    for (const c of [...r.pallets, ...r.recipes.flatMap((x) => x.outputs)]) {
      assert.notEqual(c.destinationColor, "gray");
      assert.equal(c.dispatchRound, c.dueRound);
    }
  }
});
test("concurrent workers reserve the remaining color quota before physical loading", () => {
  const { g, m } = fixture();
  m.requirements = [{ color: "red", quantity: 1 }];
  const a = pallet("a"),
    b = pallet("b");
  g.crates.push(a, b);
  const other = new WarehouseWorker(g);
  g.workers.push(other);
  other.task = {
    crate: a.id,
    dest: { kind: "outbound", lane: 0, depth: 0 },
  } as typeof other.task;
  assert.equal(g.canLoad(m, b, g), false);
  other.task = null;
  assert.ok(g.canLoad(m, b, g));
});
test("explicit thermal requirements are matched separately and duplicate physical cargo is rejected", () => {
  const req = [
    { color: "red" as const, quantity: 1 },
    { color: "red" as const, quantity: 1, temperature: "chilled" as const },
  ];
  const a = pallet("cold"),
    b = pallet("normal");
  a.temperature = "chilled";
  a.climateStored = true;
  assert.ok(matchCargo(req, [a, b], 2).complete);
  assert.equal(matchCargo(req, [b, b], 2).complete, false);
});
test("legacy v2 saves migrate gray destination and dispatched evidence without moving cargo", () => {
  const { g, m } = fixture();
  const c = pallet("R01-P001");
  c.color = "gray";
  delete c.destinationColor;
  delete c.dispatchRound;
  c.dueRound = 2;
  load(c, 0);
  g.crates.push(c);
  m.palletIds = [c.id];
  delete m.requirements;
  const env = JSON.parse(serialize(g));
  env.version = 2;
  const loaded = restore(JSON.stringify(env));
  assert.equal(
    loaded.crates[0].destinationColor,
    campaign[0].pallets[0].destinationColor,
  );
  assert.deepEqual(loaded.crates[0].loc, c.loc);
  assert.ok(loaded.cmrs.find((x) => x.id === m.id)!.requirements?.length);
  assert.equal(loaded.crates[0].dispatchRound, 2);
});
