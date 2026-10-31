import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/simulation.ts";
import cfg, { room, dock, tail, same } from "../src/config.ts";
import { findPath, transition } from "../src/pathfinding.ts";
import { finish, move, roundOne, storage } from "./helpers.ts";
test("A01–A03, A06: exact geometry and initial state", () => {
  const g = new Game();
  let rooms = 0,
    docks = 0;
  for (let x = 0; x < 20; x++)
    for (let y = 0; y < 6; y++) {
      rooms += +room({ x, y });
      docks += +dock({ x, y });
    }
  assert.equal(rooms, 36);
  assert.equal(docks, 8);
  assert.equal(120 - rooms - docks, 76);
  assert.equal(g.cash, 50);
  assert.equal(g.crates.length, 0);
  assert.equal(g.outbound, "absent");
  g.assertInvariant();
});
test("B01–B06: source blocking, cancel, invalid destinations and slot lanes", () => {
  const g = new Game();
  g.accept();
  g.accept();
  g.advance(1.1);
  assert.equal(g.crates.length, 4);
  g.selectWorker();
  assert.equal(g.choose("1-0-1"), false);
  assert.ok(g.choose("1-0-0"));
  for (const p of [
    { x: 4, y: 2 },
    { x: 0, y: 2 },
    { x: 19, y: 2 },
    { x: -1, y: 0 },
  ])
    assert.equal(g.order({ kind: "floor", ...p }), false);
  g.cancel();
  assert.equal(g.task, null);
  assert.equal(g.cash, 50);
  assert.equal(g.source, null);
  move(g, "1-0-0", { kind: "floor", x: 2, y: 3 });
  assert.ok(g.accessible({ kind: "inbound", lane: 0, depth: 1 }));
  assert.equal(g.accessible({ kind: "inbound", lane: 1, depth: 1 }), false);
});
test("C01,C02,C04: oriented footprint and corner clearance", () => {
  const free = (p: any) =>
    p.x >= 0 &&
    p.x < 6 &&
    p.y >= 0 &&
    p.y < 5 &&
    !((p.x === 2 && p.y === 1) || (p.x === 1 && p.y === 2));
  assert.equal(
    transition({ x: 1, y: 1, d: 0 }, { x: 2, y: 2, d: 0 }, free),
    false,
  );
  assert.equal(
    findPath(
      { x: 1, y: 1, d: 0 },
      (p) => p.x === 4 && p.y === 1,
      (p) => p.y === 1 && p.x >= 0 && p.x <= 5,
    )?.length,
    7,
  );
});
test("E01,E02,E06,E07: discrete wages, speed, frozen end and bankruptcy", () => {
  const g = new Game();
  g.advance(59.99);
  assert.equal(g.cash, 50);
  g.advance(0.01);
  assert.equal(g.cash, 30);
  g.speed = 4;
  g.advance(15);
  assert.equal(g.cash, 10);
  g.advance(15);
  assert.equal(g.status, "lost");
  const time = g.time;
  g.advance(100);
  g.accept();
  assert.equal(g.time, time);
  assert.equal(g.crates.length, 0);
});
test("D01–D10,E03–E05,E08: play both rounds with normal movement and economy", () => {
  const g = new Game();
  roundOne(g);
  console.log("R1", g.time, g.cash);
  assert.equal(g.ledger.filter((e) => e.label === "Rozładunek").length, 4);
  assert.equal(
    g.ledger
      .filter((e) => e.label === "Przechowanie")
      .reduce((s, e) => s + e.amount, 0),
    20,
  );
  const positions = g.crates.map((c) => JSON.stringify(c.loc)),
    t = g.time;
  g.advance(100);
  assert.equal(g.time, t);
  g.nextRound();
  assert.deepEqual(
    g.crates.map((c) => JSON.stringify(c.loc)),
    positions,
  );
  assert.ok(g.crates.every((c) => c.active));
  assert.equal(g.outbound, "docked");
  g.accept();
  g.advance(1.1);
  // Dispatch each colour pair promptly: wages continue during physical transport.
  for (const [i, id] of ["1-1-0", "1-1-1", "1-0-0", "1-0-1"].entries()) {
    move(g, id, { kind: "outbound", lane: 0, depth: i % 2 === 0 ? 1 : 0 });
    if (i % 2 === 1) {
      assert.ok(g.dispatch());
      assert.equal(g.deliveryRemaining, 30);
      assert.equal(g.dispatch(), false);
      g.advance(30);
      assert.equal(g.outbound, "docked");
    }
  }
  assert.equal(g.crates.filter((c) => c.loc.kind === "delivered").length, 4);
  for (const [i, id] of ["2-0-0", "2-0-1", "2-1-0", "2-1-1"].entries()) {
    move(g, id, { kind: "floor", x: 2, y: 3 });
    move(g, id, { kind: "outbound", lane: 0, depth: i % 2 === 0 ? 1 : 0 });
    if (i % 2 === 1) {
      assert.ok(g.dispatch());
      g.advance(30);
    }
  }
  assert.equal(g.status, "won");
  assert.equal(g.crates.filter((c) => c.loc.kind === "delivered").length, 8);
  assert.equal(
    g.ledger
      .filter((e) => e.label === "Dostawa")
      .reduce((s, e) => s + e.amount, 0),
    160,
  );
  assert.equal(g.ledger.filter((e) => e.label === "Rozładunek").length, 8);
  console.log("R2", g.time, g.cash);
  g.assertInvariant();
});
test("B07,D07,D09: own-vehicle unload, single-color partial course and one-time rewards", () => {
  const g = new Game();
  roundOne(g);
  g.nextRound();
  move(g, "1-1-0", { kind: "outbound", lane: 0, depth: 1 });
  move(g, "1-1-0", { kind: "floor", x: 16, y: 4 });
  assert.equal(g.ledger.filter((e) => e.label === "Rozładunek").length, 4);
  move(g, "1-1-0", { kind: "outbound", lane: 0, depth: 0 });
  assert.ok(g.dispatch());
  assert.equal(g.deliveryRemaining, 30);
  assert.equal(g.order({ kind: "outbound", lane: 1, depth: 0 }), false);
  const deliveries = g.ledger.filter((e) => e.label === "Dostawa").length;
  g.advance(29.9);
  assert.equal(
    g.ledger.filter((e) => e.label === "Dostawa").length,
    deliveries,
  );
  g.advance(0.1);
  assert.equal(g.crates.filter((c) => c.loc.kind === "delivered").length, 1);
  assert.equal(g.ledger.at(-1)?.amount, 20);
  assert.equal(g.dispatch(), false);
});
test("C06: retain blocked task, resume original route; cancel preserves carried crate", () => {
  const g = new Game();
  g.accept();
  g.advance(1.1);
  g.selectWorker();
  g.choose("1-0-0");
  g.order({ kind: "floor", x: 17, y: 4 });
  for (let i = 0; !g.carried && i < 10000 && g.status === "playing"; i++)
    g.advance(0.05);
  assert.ok(g.carried);
  assert.ok(g.task, "The loaded task must remain active");
  const route = g.task.route;
  const target = route[Math.min(5, route.length - 1)];
  g.reservations.add(`${target.x},${target.y}`);
  for (let i = 0; i < 200; i++) g.advance(0.05);
  assert.ok(g.task?.blocked);
  assert.ok(g.carried);
  const pose = JSON.stringify(g.pose);
  g.advance(1);
  assert.equal(JSON.stringify(g.pose), pose);
  g.reservations.clear();
  finish(g);
  assert.equal(g.crates.find((c) => c.id === "1-0-0")?.loc.kind, "floor");
  g.selectWorker();
  g.choose("1-0-1");
  g.order({ kind: "floor", x: 16, y: 4 });
  for (let i = 0; !g.carried && i < 10000 && g.status === "playing"; i++)
    g.advance(0.05);
  const id = g.carried;
  g.cancel();
  for (let i = 0; g.task && i < 10000 && g.status === "playing"; i++)
    g.advance(0.05);
  assert.equal(g.carried, id);
  assert.ok(g.order({ kind: "floor", x: 2, y: 4 }));
  finish(g);
  g.assertInvariant();
});
test("E08: same commands and game time are deterministic across render speeds", () => {
  const a = new Game(),
    b = new Game();
  a.accept();
  b.accept();
  a.advance(20);
  b.speed = 4;
  b.advance(5);
  assert.equal(JSON.stringify(a.pose), JSON.stringify(b.pose));
  assert.equal(a.cash, b.cash);
  assert.equal(a.time, b.time);
  assert.deepEqual(a.crates, b.crates);
});
test("Regression: loading carry-over before accepting R2 CMR keeps the CMR waiting", () => {
  const g = new Game();
  roundOne(g);
  g.nextRound();
  move(g, "1-1-0", { kind: "outbound", lane: 0, depth: 1 });
  assert.equal(g.inbound, "waiting");
  g.accept();
  g.advance(1.1);
  assert.equal(g.crates.length, 8);
  assert.equal(g.inbound, "docked");
});
test("B01: active task refuses replacement and remains the same object", () => {
  const g = new Game();
  g.accept();
  g.advance(1.1);
  g.selectWorker();
  g.choose("1-0-0");
  assert.ok(g.order({ kind: "floor", x: 2, y: 3 }));
  const t = g.task;
  assert.equal(g.choose("1-1-0"), false);
  assert.equal(g.order({ kind: "floor", x: 3, y: 4 }), false);
  assert.equal(g.task, t);
});
test("B02,C03: mid-edge cancellation rolls back smoothly without losing cargo", () => {
  const g = new Game();
  g.accept();
  g.advance(1.1);
  g.selectWorker();
  g.choose("1-0-0");
  g.order({ kind: "floor", x: 17, y: 4 });
  for (let i = 0; !g.carried && i < 10000 && g.status === "playing"; i++)
    g.advance(0.05);
  g.advance(0.2);
  const pose = { ...g.pose },
    id = g.carried,
    elapsed = g.task!.elapsed;
  assert.ok(elapsed > 0);
  g.cancel();
  assert.ok(g.task?.cancelRequested);
  g.advance(0.05);
  assert.ok(g.task!.elapsed < elapsed);
  for (let i = 0; g.task && i < 10000 && g.status === "playing"; i++)
    g.advance(0.05);
  assert.deepEqual(g.pose, pose);
  assert.equal(g.carried, id);
  g.assertInvariant();
});
