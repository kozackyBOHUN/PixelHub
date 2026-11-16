import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CampaignGame,
  WarehouseWorker,
  sorterPorts,
} from "../src/campaign-game.ts";
import { COLORS } from "../src/campaign.ts";
import { drain } from "../src/developer.ts";
import { createRegistry } from "../src/graphics/assets.ts";
import { SceneBuilder } from "../src/graphics/scene.ts";
import { restore, serialize } from "../src/save.ts";
import type { Crate } from "../src/simulation.ts";

const site = { x: 6, y: -3, d: 0 };
function preparing() {
  const g = new CampaignGame();
  g.round = 7;
  g.startRound();
  g.levels.storage = 2;
  g.money(700, "fixture");
  g.status = "summary";
  assert.ok(g.beginDevelopment());
  return g;
}
function pallet(
  id: string,
  color: "red" | "blue",
  x: number,
  dispatchRound: number,
): Crate {
  return {
    id,
    color,
    destinationColor: color,
    dispatchRound,
    active: true,
    paid: true,
    temperature: "standard",
    condition: "standard",
    loc: { kind: "floor", x, y: 3 },
  };
}
test("retained label uses the destination colour through 3, 2, 1 and then switches to the full destination sprite", () => {
  let g = new CampaignGame();
  g.crates.push(pallet("held", "red", 3, 4));
  const loc = g.crates[0].loc;
  const scene = new SceneBuilder(createRegistry());
  for (const round of [1, 2, 3, 4]) {
    g.round = round;
    g.startRound();
    g = restore(serialize(g));
    scene.build(g);
    const box = scene.queue.commands.find((c) => c.id === "cargo/held/box");
    const label = scene.queue.commands.find(
      (c) => c.id === "cargo/held/recipient-label",
    );
    const badge = scene.queue.commands.find((c) => c.id === "cargo/held/due");
    assert.deepEqual(g.crates[0].loc, loc);
    assert.ok(box?.kind === "asset");
    assert.equal(box.assetId, round < 4 ? "cargo/box/gray" : "cargo/box/red");
    if (round < 4) {
      assert.ok(label?.kind === "fill" && badge?.kind === "badge");
      assert.equal(label.color, COLORS.red);
      assert.equal(badge.text, String(4 - round));
    } else assert.ok(!label && !badge);
  }
});
test("the same neutral vehicle delivers blue then red with fixed capacity and no outgoing CMR", () => {
  const g = new CampaignGame();
  g.round = 2;
  g.startRound();
  g.crates.push(pallet("blue", "blue", 3, 2), pallet("red", "red", 16, 2));
  let id = "";
  for (const color of ["blue", "red"] as const) {
    const truck = g.shippingAt()!;
    id ||= truck.id;
    assert.equal(truck.id, id);
    assert.equal(truck.capacity, 4);
    g.selectWorker();
    assert.ok(g.choose(color), g.message);
    assert.ok(
      g.order({ kind: "outbound", lane: 0, depth: 1, bay: 0 }),
      g.message,
    );
    drain(g);
    assert.ok(g.dispatchBay());
    g.step(31.2);
    g.step(1.1);
    assert.equal(g.shippingAt()?.id, id);
  }
  assert.deepEqual(g.shipped, ["blue", "red"]);
  assert.ok(g.cmrs.every((m) => m.kind === "inbound"));
});
test("install charges only a reachable footprint and restores orientation", () => {
  const g = preparing(),
    cash = g.cash;
  assert.equal(g.buy("sorter"), false);
  assert.equal(g.installSorter({ x: 1, y: -6, d: 0 }), false);
  assert.match(g.message, /wolnych pól|podjazdu/);
  assert.equal(g.cash, cash);
  assert.equal(g.sorter, null);
  assert.ok(g.installSorter(site), g.message);
  assert.equal(g.cash, cash - 300);
  assert.equal(g.installSorter(site), false);
  assert.equal(g.cash, cash - 300);
  assert.deepEqual(restore(serialize(g)).sorter, site);
  assert.deepEqual(sorterPorts(site), {
    input: { x: 5, y: -3 },
    input2: { x: 4, y: -3 },
    output: { x: 7, y: -3 },
    output2: { x: 8, y: -3 },
  });
});
test("two independent rigs avoid the sorter and occupied ports", () => {
  const g = preparing();
  assert.ok(g.installSorter(site), g.message);
  g.nextRound();
  const { input, output } = sorterPorts(site);
  const recipe = g.config.recipes[0];
  const mix = g.config.pallets.find((p) => p.id === recipe.inputs[0])!;
  const load = g.createPallet(mix, { kind: "floor", ...input });
  // A reserved input stays on the floor while its depositing rig withdraws.
  load.owner = 0;
  g.crates.push(load, {
    ...pallet("outlet", "blue", 3, 9),
    loc: { kind: "floor", ...output },
  });
  const w = new WarehouseWorker(g);
  w.pose = { x: 17, y: 1, d: 4 };
  g.workers.push(w);
  assert.equal(g.freeFor(w)(site), false);
  assert.equal(g.freeFor(w)(output), false);
  assert.ok(g.moveTo({ x: 4, y: -1 }), g.message);
  assert.ok(w.moveTo({ x: 10, y: -3 }), w.message);
  for (let i = 0; i < 2000 && (g.task || w.task); i++) {
    g.step(0.05);
    g.assertInvariant();
  }
  assert.equal(g.task, null);
  assert.equal(w.task, null);
  assert.deepEqual([g.pose.x, g.pose.y, w.pose.x, w.pose.y], [4, -1, 10, -3]);
});

test("a migrated paid sorter can be placed after clearing space without another charge", () => {
  const g = preparing();
  g.purchased.push("sorter");
  g.nextRound();
  assert.ok(g.sorterNeedsPlacement);
  const cash = g.cash;
  assert.ok(g.installSorter(site), g.message);
  assert.equal(g.cash, cash);
  assert.equal(g.purchased.filter((id) => id === "sorter").length, 1);
  assert.equal(g.sorterNeedsPlacement, false);
});
