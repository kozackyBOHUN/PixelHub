import { test } from "node:test";
import assert from "node:assert/strict";
import cfg, { dirs, inside, same, tail } from "../src/config.ts";
import type { Point, Pose } from "../src/config.ts";
import {
  edgeCost,
  neighbors,
  poseKey,
  rig,
  transition,
} from "../src/pathfinding.ts";
import type { RigPose } from "../src/pathfinding.ts";
import { planTransport } from "../src/transport.ts";
import type { TransportPlan } from "../src/transport.ts";

type World = {
  start: Pose;
  source: Point;
  dest: Point;
  free: (p: Point) => boolean;
  sourceDirection?: number;
  destDirection?: number;
  carried?: boolean;
};
type Stage = "empty" | "loaded" | "lowered" | "exit";
type State = { p: RigPose; stage: Stage };
const shift = (p: Point, d: number, n: number): Point => ({
  x: p.x + n * dirs[d].x,
  y: p.y + n * dirs[d].y,
});
const stateKey = ({ p, stage }: State) => `${stage}:${poseKey(p)}`;
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

// A separate uniform-cost solver for the whole job. Unlike production it has no
// precomputed destination suffixes, findPath calls, MinHeap, or predecessor map.
// Pickup, insertion/lowering, withdrawal and escape are explicit graph stages.
// Collision and motion primitives are shared: this is a planner control, not an
// independent implementation of swept-body geometry.
function referenceCost(
  w: World,
  stopAt: "pickup" | "deposit" | "exit" = "exit",
): number | null {
  const initial: State = {
    p: rig(w.start),
    stage: w.carried ? "loaded" : "empty",
  };
  const frontier = new Map<string, { s: State; cost: number }>([
    [stateKey(initial), { s: initial, cost: 0 }],
  ]);
  const settled = new Set<string>();
  const freeEmpty = (p: Point) => w.free(p) && !same(p, w.source);
  const freeAfter = (p: Point) => w.free(p) && !same(p, w.dest);
  while (frontier.size) {
    let current: { s: State; cost: number } | undefined;
    for (const entry of frontier.values())
      if (!current || entry.cost < current.cost) current = entry;
    const { s, cost } = current!;
    const k = stateKey(s);
    frontier.delete(k);
    settled.add(k);
    const { p, stage } = s;
    if (stage === "lowered" && stopAt === "deposit") return cost;
    if (
      stage === "exit" &&
      inside(p) &&
      inside(tail(p)) &&
      p.y <= 1 &&
      tail(p).y <= 1
    )
      return cost;
    const relax = (next: State, delta: number) => {
      const key = stateKey(next);
      if (settled.has(key)) return;
      const candidate = cost + delta;
      if (candidate < (frontier.get(key)?.cost ?? Infinity))
        frontier.set(key, { s: next, cost: candidate });
    };
    if (stage === "lowered") {
      if (p.mode === "push") {
        const b: RigPose = { ...p, mode: "pull" };
        relax({ p: b, stage }, edgeCost(p, b, false));
      } else {
        const b: RigPose = { ...p, ...shift(p, p.d, 1) };
        if (transition(p, b, w.free, false))
          relax({ p: b, stage: "exit" }, edgeCost(p, b, false));
      }
      continue;
    }
    const loaded = stage === "loaded";
    const free = loaded ? w.free : stage === "exit" ? freeAfter : freeEmpty;
    for (const b of neighbors(p))
      if (transition(p, b, free, loaded))
        relax({ p: b, stage }, edgeCost(p, b, loaded));
    if (
      stage === "empty" &&
      p.mode === "push" &&
      (w.sourceDirection === undefined || p.d === w.sourceDirection) &&
      same(tail(p), shift(w.source, p.d, 1))
    ) {
      const b: RigPose = { ...p, ...shift(p, p.d, -1) };
      if (transition(p, b, w.free, false)) {
        if (stopAt === "pickup") return cost;
        relax(
          { p: b, stage: "loaded" },
          edgeCost(p, b, false) + cfg.worker.pickupSeconds,
        );
      }
    }
    if (
      stage === "loaded" &&
      p.mode === "push" &&
      (w.destDirection === undefined || p.d === w.destDirection) &&
      same(tail(p), shift(w.dest, p.d, 1))
    ) {
      const b: RigPose = { ...p, ...shift(p, p.d, -1) };
      if (transition(p, b, w.free, true))
        relax(
          { p: b, stage: "lowered" },
          edgeCost(p, b, true) + cfg.worker.dropSeconds,
        );
    }
  }
  return null;
}

function checkPlan(w: World, plan: TransportPlan) {
  assert.ok(plan.steps.length);
  assert.equal(poseKey(plan.steps[0].a), poseKey(rig(w.start)));
  close(
    plan.cost,
    plan.steps.reduce((sum, step) => sum + step.duration, 0),
  );
  let loaded = !!w.carried;
  let deposited = false;
  let pickups = 0;
  let drops = 0;
  for (const [i, step] of plan.steps.entries()) {
    if (i) assert.equal(poseKey(plan.steps[i - 1].b), poseKey(step.a));
    assert.ok(Number.isFinite(step.duration) && step.duration > 0);
    if (step.phase === "LIFT") {
      assert.equal(loaded, false);
      assert.ok(same(tail(step.a), w.source));
      if (w.sourceDirection !== undefined)
        assert.equal(step.a.d, w.sourceDirection);
      assert.deepEqual(step.a, step.b);
      close(step.duration, cfg.worker.pickupSeconds);
      loaded = true;
      pickups++;
    } else if (step.phase === "LOWER") {
      assert.equal(loaded, true);
      assert.ok(same(tail(step.a), w.dest));
      if (w.destDirection !== undefined)
        assert.equal(step.a.d, w.destDirection);
      assert.deepEqual(step.a, step.b);
      close(step.duration, cfg.worker.dropSeconds);
      loaded = false;
      deposited = true;
      drops++;
    } else {
      assert.equal(step.loaded, loaded);
      const free = (p: Point) =>
        w.free(p) &&
        (step.phase === "INSERT_FORKS" ||
          loaded ||
          deposited ||
          !same(p, w.source)) &&
        (step.phase !== "EXIT" || !same(p, w.dest));
      assert.ok(
        transition(step.a, step.b, free, loaded),
        `${i}: ${step.phase}`,
      );
      close(step.duration, edgeCost(step.a, step.b, loaded));
    }
  }
  assert.equal(pickups, w.carried ? 0 : 1);
  assert.equal(drops, 1);
  const last = plan.steps.at(-1)!.b;
  assert.ok(inside(last) && inside(tail(last)));
  assert.ok(last.y <= 1 && tail(last).y <= 1);
}

const bounded =
  (width: number, height: number, blocked: Point[] = []) =>
  (p: Point) =>
    p.x >= 0 &&
    p.x < width &&
    p.y >= 0 &&
    p.y < height &&
    !blocked.some((q) => same(p, q));

const controls: [string, World][] = [
  [
    "all pickup and deposit sides",
    {
      start: { x: 3, y: 1, d: 0 },
      source: { x: 1, y: 2 },
      dest: { x: 4, y: 3 },
      free: bounded(6, 6),
    },
  ],
  [
    "obstacles and a narrow exit approach",
    {
      start: { x: 3, y: 1, d: 0 },
      source: { x: 1, y: 3 },
      dest: { x: 5, y: 4 },
      free: bounded(7, 6, [
        { x: 3, y: 3 },
        { x: 3, y: 4 },
      ]),
    },
  ],
  [
    "restricted pickup and deposit headings",
    {
      start: { x: 3, y: 1, d: 0 },
      source: { x: 1, y: 2 },
      dest: { x: 4, y: 3 },
      sourceDirection: 0,
      destDirection: 4,
      free: bounded(7, 6),
    },
  ],
  [
    "already carrying cargo in pull mode",
    {
      start: { x: 3, y: 3, d: 0 },
      source: { x: 2, y: 3 },
      dest: { x: 4, y: 4 },
      carried: true,
      free: bounded(7, 6),
    },
  ],
  [
    "already carrying cargo in push mode",
    {
      start: { x: 3, y: 3, d: 4, mode: "push" },
      source: { x: 4, y: 3 },
      dest: { x: 1, y: 4 },
      carried: true,
      destDirection: 0,
      free: bounded(7, 6),
    },
  ],
  [
    "pickup cannot be approached on its required side",
    {
      start: { x: 3, y: 1, d: 0 },
      source: { x: 0, y: 3 },
      dest: { x: 4, y: 4 },
      sourceDirection: 4,
      free: bounded(6, 6),
    },
  ],
  [
    "free target with no legal axial withdrawal",
    {
      start: { x: 3, y: 1, d: 0 },
      source: { x: 1, y: 2 },
      dest: { x: 3, y: 4 },
      free: bounded(6, 6, [
        { x: 2, y: 4 },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
      ]),
    },
  ],
];

for (const [i, [name, world]] of controls.entries())
  test(`audit planner: independent whole-job optimum, ${name}`, () => {
    const expected = referenceCost(world);
    assert.equal(
      expected !== null,
      i < 5,
      "The control must exercise its claimed outcome",
    );
    const actual = planTransport(
      world.start,
      world.source,
      world.dest,
      (p) => world.free(p) && !same(p, world.source),
      world.free,
      world.sourceDirection,
      world.destDirection,
      world.carried,
    );
    assert.equal(actual === null, expected === null);
    if (actual && expected !== null) {
      close(actual.cost, expected);
      checkPlan(world, actual);
    }
  });

test("audit planner: the nearest pickup side can lose on total job time", () => {
  const world: World = {
    start: { x: 3, y: 1, d: 0 },
    source: { x: 2, y: 3 },
    dest: { x: 4, y: 3 },
    free: bounded(6, 6),
  };
  const scores = [0, 2, 4, 6].map((sourceDirection) => ({
    d: sourceDirection,
    approach: referenceCost({ ...world, sourceDirection }, "pickup"),
    total: referenceCost({ ...world, sourceDirection }),
  }));
  const nearest = scores
    .filter((s) => s.approach !== null)
    .sort((a, b) => a.approach! - b.approach!)[0];
  const best = scores
    .filter((s) => s.total !== null)
    .sort((a, b) => a.total! - b.total!)[0];
  assert.equal(nearest.d, 6);
  assert.equal(best.d, 4);
  assert.ok(nearest.total! > best.total!);
  const plan = planTransport(
    world.start,
    world.source,
    world.dest,
    (p) => world.free(p) && !same(p, world.source),
    world.free,
  )!;
  checkPlan(world, plan);
  assert.equal(plan.steps.find((s) => s.phase === "LIFT")!.a.d, best.d);
  close(plan.cost, best.total!);
});

test("audit planner: the fastest deposit side can lose after withdrawal and exit", () => {
  const world: World = {
    start: { x: 3, y: 1, d: 0 },
    source: { x: 1, y: 2 },
    dest: { x: 4, y: 4 },
    free: bounded(7, 6),
  };
  const scores = [0, 2, 4, 6].map((destDirection) => ({
    d: destDirection,
    deposit: referenceCost({ ...world, destDirection }, "deposit"),
    total: referenceCost({ ...world, destDirection }),
  }));
  const fastestDrop = scores
    .filter((s) => s.deposit !== null)
    .sort((a, b) => a.deposit! - b.deposit!)[0];
  const best = scores
    .filter((s) => s.total !== null)
    .sort((a, b) => a.total! - b.total!)[0];
  assert.equal(fastestDrop.d, 4);
  assert.equal(best.d, 6);
  assert.ok(fastestDrop.total! > best.total!);
  const plan = planTransport(
    world.start,
    world.source,
    world.dest,
    (p) => world.free(p) && !same(p, world.source),
    world.free,
  )!;
  checkPlan(world, plan);
  assert.equal(plan.steps.find((s) => s.phase === "LOWER")!.a.d, best.d);
  close(plan.cost, best.total!);
});

test("audit planner: every source and target heading agrees with an independent search", () => {
  const base = controls[0][1];
  for (const sourceDirection of [0, 2, 4, 6])
    for (const destDirection of [0, 2, 4, 6]) {
      const w = { ...base, sourceDirection, destDirection };
      const expected = referenceCost(w);
      const plan = planTransport(
        w.start,
        w.source,
        w.dest,
        (p) => w.free(p) && !same(p, w.source),
        w.free,
        sourceDirection,
        destDirection,
      );
      assert.equal(plan === null, expected === null);
      if (plan && expected !== null) {
        close(plan.cost, expected);
        checkPlan(w, plan);
      }
    }
});
