import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { CampaignGame, WarehouseWorker } from "../src/campaign-game.ts";
import { restore, serialize } from "../src/save.ts";
import type { Pose, Point } from "../src/config.ts";

function worker(game: CampaignGame, pose: Pose) {
  const w = new WarehouseWorker(game);
  w.pose = pose;
  game.workers.push(w);
  return w;
}
function tick(game: CampaignGame, until: () => boolean, limit = 2000) {
  const start = game.time;
  for (let i = 0; i < limit && !until(); i++) {
    game.step(0.05);
    game.assertInvariant();
  }
  assert.ok(until(), game.workers.map((w) => w.message).join(" | "));
  return game.time - start;
}
function hall(pose: Pose, expanded = true) {
  const g = new CampaignGame();
  g.pose = pose;
  if (expanded) g.levels.storage = 2;
  return g;
}
function reached(w: WarehouseWorker | CampaignGame, target: Point) {
  assert.deepEqual({ x: w.pose.x, y: w.pose.y }, target);
}

test("A crossing an unoccupied future path while the long trip is still running", () => {
  const g = hall({ x: 3, y: 1, d: 0 });
  const b = worker(g, { x: 8, y: -2, d: 2 });
  assert.ok(g.moveTo({ x: 17, y: 1 }));
  assert.ok(
    g.freeFor(b)({ x: 8, y: 1 }),
    "future path has no physical occupancy",
  );
  assert.ok(b.moveTo({ x: 8, y: 2 }));
  tick(g, () => !b.task);
  reached(b, { x: 8, y: 2 });
  assert.ok(g.task);
  tick(g, () => !g.task);
});

test("B/G opposite approaches wait, yield into a safe space and both finish", () => {
  const g = hall({ x: 8, y: 1, d: 0 });
  const b = new WarehouseWorker(g);
  b.pose = { x: 11, y: 1, d: 4 };
  // Two independently planned routes reach the same corridor from opposite ends.
  assert.ok(g.moveTo({ x: 16, y: 1 }));
  g.workers = [b];
  assert.ok(b.moveTo({ x: 2, y: 1 }));
  g.workers = [g, b];
  let mutual = false;
  let yielded = false;
  tick(g, () => {
    mutual ||= !!g.task?.blocked && !!b.task?.blocked;
    yielded ||= !!g.task?.yielded || !!b.task?.yielded;
    return !g.task && !b.task;
  });
  assert.ok(mutual);
  assert.ok(yielded);
  reached(g, { x: 16, y: 1 });
  reached(b, { x: 2, y: 1 });
});

test("D an idle rig can be repositioned and clears the occupied passage", () => {
  const g = hall({ x: 3, y: 1, d: 0 });
  const b = worker(g, { x: 8, y: 1, d: 0 });
  assert.equal(g.free()({ x: 8, y: 1 }), false);
  assert.ok(b.moveTo({ x: 10, y: -3 }), b.message);
  tick(g, () => !b.task);
  assert.equal(g.free()({ x: 8, y: 1 }), true);
  reached(b, { x: 10, y: -3 });
});

test("E a full physical barrier stops the rig and reports the blockage", () => {
  const g = hall({ x: 3, y: 1, d: 0 }, false);
  assert.ok(g.moveTo({ x: 14, y: 1 }));
  worker(g, { x: 8, y: 1, d: 0 });
  for (const y of [0, 2, 3])
    g.crates.push({
      id: `barrier-${y}`,
      color: "blue",
      active: false,
      paid: true,
      loc: { kind: "floor", x: 8, y },
    });
  tick(g, () => g.message.startsWith("Przejazd zablokowany"));
  assert.ok(g.task?.blocked);
  assert.ok(g.transportGeometry.head.x < 7);
});

test("C/F/H four employees work across both ramps in round 19 and resume a live save", () => {
  let g = new CampaignGame();
  g.round = 19;
  g.startRound();
  g.levels.storage = 4;
  g.money(3000, "Test");
  g.purchased = ["sorter", "chiller", "service", "freezer"];
  g.status = "development";
  g.developmentRound = 19;
  assert.ok(g.buyModule("receiving"));
  assert.ok(g.buyModule("shipping"));
  for (let i = 0; i < 3; i++) assert.ok(g.buy("worker"));
  g.nextRound();
  for (let bay = 0; bay < 2; bay++)
    assert.ok(g.dockCMR(g.config.arrivals[bay].id, bay));
  g.step(1.1);
  const cargo = ["R19-P001", "R19-P010"];
  const targets = [
    { x: 14, y: -2 },
    { x: 15, y: -2 },
  ];
  for (const [i, id] of cargo.entries()) {
    const w = g.workers[i];
    w.selectWorker();
    assert.ok(w.choose(id), w.message);
    assert.ok(w.order({ kind: "floor", ...targets[i] }), w.message);
  }
  assert.ok(g.workers[2].moveTo({ x: 14, y: 0 }));
  assert.ok(g.workers[3].moveTo({ x: 15, y: -8 }));
  const serialTravelTime = g.workers.reduce((n, w) => n + w.task!.cost, 0);
  const start = g.time;
  tick(g, () => !!g.workers[0].carried && !!g.workers[1].task);
  const snapshot = g.workers.map((w) => [
    w.transportGeometry,
    w.task,
    w.carried,
  ]);
  g = restore(serialize(g));
  assert.deepEqual(
    g.workers.map((w) => [w.transportGeometry, w.task, w.carried]),
    snapshot,
  );
  tick(g, () => g.workers.every((w) => !w.task));
  assert.ok(
    g.time - start < serialTravelTime * 0.75,
    `parallel ${g.time - start}, sum ${serialTravelTime}`,
  );
  for (const [i, id] of cargo.entries())
    assert.deepEqual(g.crates.find((c) => c.id === id)?.loc, {
      kind: "floor",
      ...targets[i],
    });
  assert.equal(new Set(g.crates.map((c) => c.id)).size, g.crates.length);
  console.log(
    `R19: ${(g.time - start).toFixed(1)} s parallel, ${serialTravelTime.toFixed(1)} s total planned travel`,
  );
});
