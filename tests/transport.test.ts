import { test } from "node:test";
import assert from "node:assert/strict";
import cfg, { dirs, tail, same } from "../src/config.ts";
import type { Point, Pose } from "../src/config.ts";
import {
  DRAWBAR_LENGTH,
  geometry,
  geometryFree,
  neighbors,
  rig,
  transition,
  edgeCost,
  findPath,
  sweptCells,
} from "../src/pathfinding.ts";
import { Game, locationPoint } from "../src/simulation.ts";
import { planTransport } from "../src/transport.ts";
import { workerVisual } from "../src/renderer.ts";
import { finish, move } from "./helpers.ts";
const open = (p: Point) => p.x >= 0 && p.x < 10 && p.y >= 0 && p.y < 8;
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function ready() {
  const g = new Game();
  g.accept();
  g.advance(1.1);
  return g;
}
function ordered() {
  const g = ready();
  g.selectWorker();
  assert.ok(g.choose("1-0-0"));
  assert.ok(g.order({ kind: "floor", x: 2, y: 3 }), g.message);
  return g;
}
function until(g: Game, predicate: () => boolean) {
  for (let n = 0; n < 10000 && g.status === "playing"; n++) {
    if (predicate()) return;
    g.advance(0.05);
    g.assertInvariant();
  }
  assert.fail(`Condition not reached: ${g.transportState}, ${g.message}`);
}
const straight = rig({ x: 4, y: 3, d: 0 });
test("01–04: pickup requires an axial three-position approach and free insertion space", () => {
  const g = ready(),
    l = { kind: "inbound" as const, lane: 0, depth: 0 };
  assert.ok(g.contact(l, { x: 1, y: 2, d: 0 }));
  assert.equal(g.contact(l, { x: 1, y: 2, d: 2 }), false);
  assert.equal(g.contact(l, { x: 1, y: 3, d: 0 }), false);
  assert.equal(g.contact(l, { x: 0, y: 2, d: 0 }), false);
  assert.equal(g.accessible({ kind: "inbound", lane: 0, depth: 1 }), false);
  g.reservations.add("0,2");
  g.selectWorker();
  assert.equal(g.choose("1-0-0"), false);
  assert.equal(g.task, null);
});
test("05: forks actually enter beneath a stationary source before ownership changes", () => {
  const g = ordered(),
    c = g.crates.find((c) => c.id === "1-0-0")!;
  until(g, () => g.task?.phase === "INSERT_FORKS");
  const source = locationPoint(c.loc)!,
    start = { ...g.transportGeometry.back };
  g.advance(0.4);
  assert.deepEqual(locationPoint(c.loc), source);
  assert.equal(g.carried, null);
  assert.ok(
    Math.hypot(
      g.transportGeometry.back.x - source.x,
      g.transportGeometry.back.y - source.y,
    ) < Math.hypot(start.x - source.x, start.y - source.y),
  );
  until(g, () => g.task?.phase === "LIFT");
  close(g.transportGeometry.back.x, source.x);
  close(g.transportGeometry.back.y, source.y);
  until(g, () => !!g.carried);
  assert.equal(c.loc.kind, "worker");
  assert.equal(g.carried, c.id);
  close(g.transportGeometry.back.x, source.x);
  close(g.transportGeometry.back.y, source.y);
});
test("06,08: straight pull and push use different times and the same connected rig", () => {
  const forward = { ...straight, x: 5 };
  close(edgeCost(straight, forward, true), 1.2);
  const push = { ...straight, mode: "push" as const },
    back = { ...push, x: 3 };
  close(edgeCost(push, back, true), 1.8);
  for (const [a, b] of [
    [straight, forward],
    [push, back],
  ])
    for (let n = 0; n <= 40; n++) {
      const g = geometry(a, b, n / 40);
      close(
        Math.hypot(g.head.x - g.hitch.x, g.head.y - g.hitch.y),
        DRAWBAR_LENGTH,
      );
      close(g.head.y, 3);
      close(g.back.y, 3);
      assert.ok(transition(a, b, open));
    }
});
test("07,09: pulling and reverse pushing arcs keep the wheel velocity axial in intermediate frames", () => {
  const a = straight,
    b = neighbors(a).find((p) => p.d === 2)!;
  const pa = { ...b, mode: "push" as const },
    pb = { ...a, mode: "push" as const };
  for (let n = 1; n < 100; n++) {
    const f = n / 100,
      g = geometry(a, b, f),
      before = geometry(a, b, f - 1e-5),
      after = geometry(a, b, f + 1e-5);
    const dx = after.back.x - before.back.x,
      dy = after.back.y - before.back.y;
    close(dx * g.heading.y - dy * g.heading.x, 0);
    const reverse = geometry(pa, pb, 1 - f);
    close(reverse.back.x, g.back.x);
    close(reverse.back.y, g.back.y);
    close(
      Math.hypot(g.head.x - g.hitch.x, g.head.y - g.hitch.y),
      DRAWBAR_LENGTH,
    );
  }
});
test("10–12: both direction switches cost 0.8 seconds without moving any element", () => {
  for (const a of [straight, { ...straight, mode: "push" as const }]) {
    const b = neighbors(a)[0];
    close(edgeCost(a, b, true), 0.8);
    for (let i = 0; i <= 20; i++)
      assert.deepEqual(geometry(a, b, i / 20), geometry(a));
  }
});
test("13: lateral translations and stationary rotations are not legal graph edges", () => {
  assert.equal(transition(straight, { ...straight, y: 4 }, open), false);
  assert.equal(transition(straight, { ...straight, d: 2 }, open), false);
  assert.equal(transition(straight, { ...straight, d: 4 }, open), false);
  for (const a of [straight, { ...straight, mode: "push" as const }])
    for (const b of neighbors(a))
      if (a.d === b.d && !same(a, b)) {
        const v = dirs[a.d];
        close((b.x - a.x) * v.y - (b.y - a.y) * v.x, 0);
      }
});
test("14: a swept corner collision is rejected even when both endpoints are clear", () => {
  let found = false;
  const originalRadius = cfg.worker.turnRadiusTiles;
  cfg.worker.turnRadiusTiles = 1;
  try {
    for (const d of [0, 2, 4, 6]) {
      const a = rig({ x: 4, y: 4, d }),
        b = neighbors(a).find((p) => p.d === (d + 2) % 8)!;
      for (const obstacle of sweptCells(a, b)) {
        const free = (p: Point) => !same(p, obstacle);
        if (
          geometryFree(geometry(a), free) &&
          geometryFree(geometry(b), free)
        ) {
          assert.equal(transition(a, b, free), false);
          found = true;
        }
      }
    }
  } finally {
    cfg.worker.turnRadiusTiles = originalRadius;
  }
  assert.ok(found, "The test must exercise an intermediate-only collision");
});
test("15: a quarter turn fits two columns; U-turns are sequences of rolling arcs", () => {
  const a = rig({ x: 2, y: 2, d: 0 }),
    b = neighbors(a).find((p) => p.d === 2)!;
  assert.ok(
    transition(a, b, (p) => p.x >= 1 && p.x <= 2 && p.y >= 1 && p.y <= 4),
  );
  const path = findPath(
    rig({ x: 3, y: 3, d: 0 }),
    (p) => p.d === 4,
    open,
    true,
  )!;
  assert.ok(path);
  assert.ok(path.filter((p, i) => i && p.d !== path[i - 1].d).length >= 2);
  for (let i = 1; i < path.length; i++)
    assert.ok(transition(path[i - 1], path[i], open));
});
test("16: whole-job cost includes insertion, lift, switches, transport, lowering and exactly one-tile withdrawal", () => {
  const g = ordered(),
    t = g.task!;
  close(
    t.cost,
    t.steps.reduce((s, e) => s + e.duration, 0),
  );
  for (const phase of [
    "INSERT_FORKS",
    "LIFT",
    "PULL",
    "SWITCH_DIRECTION",
    "PUSH_TO_TARGET",
    "LOWER",
    "WITHDRAW_FORKS",
  ])
    assert.ok(
      t.steps.some((s) => s.phase === phase),
      phase,
    );
  assert.equal(t.steps.find((s) => s.phase === "LIFT")?.duration, 1.5);
  assert.equal(t.steps.find((s) => s.phase === "LOWER")?.duration, 1.5);
  // Independent exhaustive comparison of all allowed pickup sides in a bounded world.
  const free = (p: Point) => p.x >= 0 && p.x < 6 && p.y >= 0 && p.y < 6;
  const source = { x: 1, y: 2 },
    dest = { x: 4, y: 3 },
    start = { x: 3, y: 1, d: 0 };
  const all = planTransport(
    start,
    source,
    dest,
    (p) => free(p) && !same(p, source),
    free,
  )!;
  const choices = [0, 2, 4, 6]
    .map((d) =>
      planTransport(
        start,
        source,
        dest,
        (p) => free(p) && !same(p, source),
        free,
        d,
      ),
    )
    .filter((p) => !!p);
  close(all.cost, Math.min(...choices.map((p) => p!.cost)));
});
test("17–18: lowering never slides cargo; completion and rewards follow full withdrawal", () => {
  const g = ordered();
  until(g, () => g.task?.phase === "LOWER");
  const dest = locationPoint(g.task!.dest)!;
  assert.ok(same(tail(g.pose), dest));
  while (g.task?.phase === "LOWER") {
    close(g.transportGeometry.back.x, dest.x);
    close(g.transportGeometry.back.y, dest.y);
    g.advance(0.05);
  }
  assert.equal(g.carried, null);
  assert.ok(g.task);
  assert.equal(g.ledger.filter((e) => e.label === "Rozładunek").length, 0);
  until(g, () => g.task?.phase === "WITHDRAW_FORKS");
  g.advance(0.3);
  assert.deepEqual(locationPoint(g.crates[0].loc), dest);
  assert.ok(g.task);
  finish(g);
  assert.equal(g.ledger.filter((e) => e.label === "Rozładunek").length, 1);
  assert.ok(
    Math.hypot(
      g.transportGeometry.back.x - dest.x,
      g.transportGeometry.back.y - dest.y,
    ) >= 1,
  );
});
test("19: reject an apparently free target with no legal one-tile withdrawal", () => {
  const g = ready();
  for (const p of [
    { x: 1, y: 5 },
    { x: 2, y: 4 },
    { x: 3, y: 5 },
  ])
    g.reservations.add(`${p.x},${p.y}`);
  g.selectWorker();
  assert.ok(g.choose("1-0-0"));
  assert.equal(g.order({ kind: "floor", x: 2, y: 5 }), false);
  assert.equal(g.task, null);
});
test("20–21: rear cargo blocks deep cargo; deep pickup physically enters the cargo bay", () => {
  const g = ready();
  g.selectWorker();
  assert.equal(g.choose("1-0-1"), false);
  move(g, "1-0-0", { kind: "floor", x: 3, y: 5 });
  g.selectWorker();
  assert.ok(g.choose("1-0-1"));
  assert.ok(g.order({ kind: "floor", x: 2, y: 5 }));
  until(g, () => g.task?.phase === "LIFT");
  assert.equal(g.pose.x, -1);
  assert.equal(tail(g.pose).x, -2);
  assert.equal(g.inbound, "docked");
  finish(g);
});
test("22–24: front/rear loading, own-bus unloading, and departure lock use physical bay cells", () => {
  const g = ready();
  g.round = 2;
  g.outbound = "docked";
  g.crates.forEach((c) => (c.active = true));
  move(g, "1-0-0", { kind: "outbound", lane: 0, depth: 1 });
  assert.equal(g.slot("outbound", 0, 1)?.id, "1-0-0");
  assert.equal(g.vehicleOccupied("outbound"), false);
  move(g, "1-0-1", { kind: "outbound", lane: 0, depth: 0 });
  g.selectWorker();
  assert.equal(g.choose("1-0-0"), false);
  move(g, "1-0-1", { kind: "floor", x: 16, y: 4 });
  assert.ok(g.accessible({ kind: "outbound", lane: 0, depth: 1 }));
  move(g, "1-0-0", { kind: "floor", x: 17, y: 5 });
  assert.equal(g.crates.filter((c) => c.loc.kind === "outbound").length, 0);
  g.crates.push({
    id: "parked",
    color: "red",
    active: true,
    paid: true,
    loc: { kind: "outbound", lane: 1, depth: 1 },
  });
  g.pose = { x: 20, y: 2, d: 4 };
  assert.equal(g.dispatch(), false);
  g.pose = { x: 19.5, y: 2, d: 4 };
  assert.equal(
    g.dispatch(),
    false,
    "a body crossing the door still occupies the vehicle",
  );
});
test("25: dynamic obstruction freezes the exact intermediate pose and resumes the original job", () => {
  const g = ordered();
  until(g, () => !!g.carried && g.task!.steps[0].phase === "PULL");
  g.advance(0.1);
  const t = g.task!,
    s = t.steps[0],
    f = g.transportGeometry;
  const obstacle = sweptCells(s.a, s.b).find((p) =>
    geometryFree(f, (q) => !same(p, q), true),
  );
  assert.ok(obstacle);
  g.reservations.add(`${obstacle.x},${obstacle.y}`);
  g.advance(0.1);
  assert.ok(g.task?.blocked);
  const frozen = structuredClone(g.transportGeometry);
  g.advance(0.5);
  assert.deepEqual(g.transportGeometry, frozen);
  assert.equal(g.task, t);
  g.reservations.clear();
  finish(g);
});
test("26–27: cancellation with cargo reverses continuously and never duplicates or loses the crate", () => {
  const g = ordered();
  until(g, () => !!g.carried);
  g.advance(0.2);
  const id = g.carried,
    at = g.transportGeometry;
  g.cancel();
  let previous = at;
  while (g.task) {
    g.advance(0.05);
    g.assertInvariant();
    const now = g.transportGeometry;
    assert.ok(
      Math.hypot(now.back.x - previous.back.x, now.back.y - previous.back.y) <
        0.2,
    );
    previous = now;
  }
  assert.equal(g.carried, id);
  assert.equal(g.crates.length, 4);
  assert.equal(g.crates.filter((c) => c.loc.kind === "worker").length, 1);
  assert.ok(g.order({ kind: "floor", x: 3, y: 4 }));
  finish(g);
});
test("cancelling partially inserted forks withdraws them before clearing the job", () => {
  const g = ordered();
  until(g, () => g.task?.phase === "LIFT");
  g.advance(0.2);
  g.cancel();
  until(g, () => !g.task);
  assert.equal(g.carried, null);
  assert.equal(g.crates[0].loc.kind, "inbound");
  g.assertInvariant();
});
test("cancelling a blocked job at its starting node is allowed", () => {
  const g = ordered(),
    s = g.task!.steps.find((s) => !same(s.a, s.b))!;
  until(g, () => g.task!.steps[0] === s);
  g.reservations.add(`${s.b.x},${s.b.y}`);
  g.advance(0.05);
  g.cancel();
  g.advance(0.05);
  assert.equal(g.task, null);
});
test("31: x1/x2/x4 produce identical transport poses, ownership and wages at equal game time", () => {
  const games = [1, 2, 4].map((speed) => {
    const g = ordered();
    g.speed = speed;
    g.advance(12 / speed);
    return g;
  });
  for (const g of games.slice(1)) {
    assert.deepEqual(g.transportGeometry, games[0].transportGeometry);
    assert.deepEqual(g.crates, games[0].crates);
    assert.deepEqual(g.ledger, games[0].ledger);
  }
});
test("32: rendering reads the exact logical geometry on every intermediate frame", () => {
  const g = ordered();
  let frames = 0;
  while (g.task && g.status === "playing") {
    g.advance(0.05);
    g.assertInvariant();
    assert.deepEqual(workerVisual(g), g.transportGeometry);
    const v = g.transportGeometry;
    close(
      Math.hypot(v.head.x - v.hitch.x, v.head.y - v.hitch.y),
      DRAWBAR_LENGTH,
    );
    frames++;
  }
  assert.ok(frames > 200);
  assert.equal(g.task, null);
});
test("16 regression: a longer pulling route beats the shortest route measured in metres", () => {
  const start = rig({ x: 3, y: 3, d: 0 }),
    goal = (p: Pose) => p.x === 1 && p.y === 1 && p.d === 0;
  const free = (p: Point) => p.x >= 0 && p.x < 14 && p.y >= 0 && p.y < 8;
  const distance = (a: Pose, b: Pose) =>
    a.d !== b.d
      ? (cfg.worker.turnRadiusTiles * Math.PI) / 2
      : Math.hypot(b.x - a.x, b.y - a.y);
  const fast = findPath(start, goal, free, true)!,
    short = findPath(start, goal, free, true, distance)!;
  const sum = (path: Pose[], cost: (a: Pose, b: Pose) => number) =>
    path.slice(1).reduce((s, b, i) => s + cost(path[i], b), 0);
  assert.ok(sum(fast, distance) > sum(short, distance));
  assert.ok(
    sum(fast, (a, b) => edgeCost(a, b, true)) <
      sum(short, (a, b) => edgeCost(a, b, true)),
  );
});
test("the articulated drawbar steers while its hinge and length remain mechanically connected", () => {
  const a = straight,
    b = neighbors(a).find((p) => p.d === 2)!;
  const mid = geometry(a, b, 0.5),
    bar = { x: mid.head.x - mid.hitch.x, y: mid.head.y - mid.hitch.y };
  close(Math.hypot(bar.x, bar.y), DRAWBAR_LENGTH);
  assert.ok(Math.abs(bar.x * mid.heading.y - bar.y * mid.heading.x) > 0.01);
  for (const f of [0, 1]) {
    const g = geometry(a, b, f);
    close(Math.hypot(g.head.x - g.back.x, g.head.y - g.back.y), 1);
  }
});

test("33: all four axial drop directions are plannable and end after one-tile withdrawal", () => {
  const floorFree = (p: Point) => p.x >= 0 && p.x < 10 && p.y >= 0 && p.y < 8;
  const source = { x: 1, y: 2 };
  const dest = { x: 5, y: 4 };
  const start = { x: 3, y: 1, d: 0 };
  for (const direction of [0, 2, 4, 6]) {
    const plan = planTransport(
      start,
      source,
      dest,
      (p) => floorFree(p) && !same(p, source),
      floorFree,
      undefined,
      direction,
    );
    assert.ok(plan, `Expected a valid drop from direction ${direction}`);
    const drop = plan.steps.find((s) => s.phase === "LOWER")!;
    const withdrawal = plan.steps.at(-1)!;
    assert.equal(drop.a.d, direction);
    assert.equal(withdrawal.phase, "WITHDRAW_FORKS");
    assert.equal(withdrawal.b.d, direction);
    assert.equal(withdrawal.b.mode, "pull");
    const v = dirs[direction];
    close(withdrawal.b.x - drop.a.x, v.x);
    close(withdrawal.b.y - drop.a.y, v.y);
    assert.ok(!plan.steps.some((s) => s.phase === "EXIT"));
  }
});

test("34: a warehouse drop stops exactly one tile after withdrawal and stays idle", () => {
  const g = ordered();
  const lower = g.task!.steps.find((s) => s.phase === "LOWER")!;
  const last = g.task!.steps.at(-1)!;
  assert.equal(last.phase, "WITHDRAW_FORKS");
  finish(g);
  close(g.pose.x - lower.a.x, dirs[lower.a.d].x);
  close(g.pose.y - lower.a.y, dirs[lower.a.d].y);
  assert.equal(g.task, null);
  const pose = structuredClone(g.pose);
  const cash = g.cash;
  g.advance(300);
  assert.deepEqual(g.pose, pose);
  assert.equal(g.cash, cash);
  assert.equal(g.status, "playing");
});

test("35: a deep vehicle drop clears the truck before stopping and allowing departure", () => {
  const g = ready();
  g.round = 2;
  g.outbound = "docked";
  g.crates.forEach((c) => (c.active = true));
  g.selectWorker();
  assert.ok(g.choose("1-0-0"));
  assert.ok(g.order({ kind: "outbound", lane: 0, depth: 1 }), g.message);
  assert.equal(g.task!.steps.at(-2)?.phase, "WITHDRAW_FORKS");
  assert.equal(g.task!.steps.at(-1)?.phase, "CLEAR_VEHICLE");
  finish(g);
  assert.equal(g.vehicleOccupied("outbound"), false);
  assert.equal(g.task, null);
  assert.ok(g.dispatch());
});
