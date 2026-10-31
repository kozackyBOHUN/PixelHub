import { test } from "node:test";
import assert from "node:assert/strict";
import cfg from "../src/config.ts";
import type { Point, Pose } from "../src/config.ts";
import { geometry, neighbors, rig, sweptCells } from "../src/pathfinding.ts";
import { Game } from "../src/simulation.ts";
import { travel } from "../src/transport.ts";

// Independent circle/rotation construction and polygon clipping oracle. This
// deliberately does not call production geometryFree or its SAT cell tests.
const plus = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const times = (p: Point, n: number): Point => ({ x: p.x * n, y: p.y * n });
const rotate = (p: Point, t: number): Point => ({
  x: p.x * Math.cos(t) - p.y * Math.sin(t),
  y: p.x * Math.sin(t) + p.y * Math.cos(t),
});
const direction = (d: number): Point => ({
  x: Math.round(Math.cos((d * Math.PI) / 4)),
  y: Math.round(Math.sin((d * Math.PI) / 4)),
});
function reference(a: Pose, b: Pose, f: number) {
  if (a.d !== b.d && a.mode === "push")
    return reference({ ...b, mode: "pull" }, { ...a, mode: "pull" }, 1 - f);
  const v = direction(a.d),
    w = direction(b.d),
    axleA = plus(a, times(v, -1)),
    axleB = plus(b, times(w, -1)),
    sign = v.x * w.y - v.y * w.x;
  let back: Point, heading: Point;
  if (a.d === b.d) {
    back = plus(times(axleA, 1 - f), times(axleB, f));
    heading = v;
  } else {
    const center = plus(axleA, times(w, cfg.worker.turnRadiusTiles));
    back = plus(
      center,
      rotate(plus(axleA, times(center, -1)), (sign * Math.PI * f) / 2),
    );
    heading = rotate(v, (sign * Math.PI * f) / 2);
  }
  const hitch = plus(back, times(heading, 0.42)),
    bar = rotate(
      heading,
      sign * cfg.worker.drawbarSteeringRadians * Math.sin(Math.PI * f),
    );
  return { back, heading, hitch, head: plus(hitch, times(bar, 0.58)) };
}
function rectangle(
  center: Point,
  axis: Point,
  hx: number,
  hy: number,
): Point[] {
  return [
    [hx, hy],
    [-hx, hy],
    [-hx, -hy],
    [hx, -hy],
  ].map(([x, y]) => ({
    x: center.x + axis.x * x - axis.y * y,
    y: center.y + axis.y * x + axis.x * y,
  }));
}
function bodies(a: Pose, b: Pose, f: number, loaded: boolean): Point[][] {
  const g = reference(a, b, f),
    link = (p: Point, q: Point, length: number) =>
      rectangle(
        times(plus(p, q), 0.5),
        times(plus(q, times(p, -1)), 1 / length),
        length / 2,
        0.055,
      );
  return [
    rectangle(g.head, { x: 1, y: 0 }, 0.34, 0.45),
    rectangle(g.back, g.heading, loaded ? 0.38 : 0.36, loaded ? 0.38 : 0.28),
    link(g.back, g.hitch, 0.42),
    link(g.hitch, g.head, 0.58),
  ];
}
function overlapArea(polygon: Point[], cell: Point): number {
  let clipped = polygon;
  for (const [axis, value, sign] of [
    ["x", cell.x - 0.5, 1],
    ["x", cell.x + 0.5, -1],
    ["y", cell.y - 0.5, 1],
    ["y", cell.y + 0.5, -1],
  ] as const) {
    const next: Point[] = [];
    for (let i = 0; i < clipped.length; i++) {
      const p = clipped[i],
        q = clipped[(i + 1) % clipped.length],
        dp = (p[axis] - value) * sign,
        dq = (q[axis] - value) * sign;
      if (dp >= 0) next.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        next.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
    clipped = next;
    if (!clipped.length) return 0;
  }
  return (
    Math.abs(
      clipped.reduce((sum, p, i) => {
        const q = clipped[(i + 1) % clipped.length];
        return sum + p.x * q.y - p.y * q.x;
      }, 0),
    ) / 2
  );
}

test("audit: independent polygon oracle encloses sampled rolling arcs in swept cells", () => {
  const originalRadius = cfg.worker.turnRadiusTiles,
    originalSteering = cfg.worker.drawbarSteeringRadians;
  let frames = 0;
  try {
    for (const radius of [0.5, 1])
      for (const steering of [0, 0.3, Math.PI / 4]) {
        cfg.worker.turnRadiusTiles = radius;
        cfg.worker.drawbarSteeringRadians = steering;
        for (const x of [4, 4.5])
          for (const y of [4, 4.5])
            for (const d of [0, 2, 4, 6])
              for (const mode of ["pull", "push"] as const)
                for (const loaded of [false, true]) {
                  const a = rig({ x, y, d, mode });
                  for (const b of neighbors(a).filter((p) => p.d !== d)) {
                    const cells = new Set(
                      sweptCells(a, b, loaded).map((p) => `${p.x},${p.y}`),
                    );
                    for (let i = 0; i <= 256; i++) {
                      const f = i / 256,
                        expected = reference(a, b, f),
                        actual = geometry(a, b, f);
                      for (const part of [
                        "head",
                        "back",
                        "heading",
                        "hitch",
                      ] as const)
                        assert.ok(
                          Math.hypot(
                            expected[part].x - actual[part].x,
                            expected[part].y - actual[part].y,
                          ) < 1e-10,
                          `Independent circular construction disagrees at ${part}`,
                        );
                      for (const polygon of bodies(a, b, f, loaded)) {
                        const minX = Math.ceil(
                            Math.min(...polygon.map((p) => p.x)) - 0.5,
                          ),
                          maxX = Math.floor(
                            Math.max(...polygon.map((p) => p.x)) + 0.5,
                          ),
                          minY = Math.ceil(
                            Math.min(...polygon.map((p) => p.y)) - 0.5,
                          ),
                          maxY = Math.floor(
                            Math.max(...polygon.map((p) => p.y)) + 0.5,
                          );
                        for (let cx = minX; cx <= maxX; cx++)
                          for (let cy = minY; cy <= maxY; cy++)
                            if (overlapArea(polygon, { x: cx, y: cy }) > 1e-10)
                              assert.ok(
                                cells.has(`${cx},${cy}`),
                                JSON.stringify({
                                  radius,
                                  steering,
                                  a,
                                  b,
                                  f,
                                  loaded,
                                  cx,
                                  cy,
                                }),
                              );
                      }
                      frames++;
                    }
                  }
                }
      }
  } finally {
    cfg.worker.turnRadiusTiles = originalRadius;
    cfg.worker.drawbarSteeringRadians = originalSteering;
  }
  assert.equal(frames, 197376);
});

test("audit: cancellation blocks a narrow independently verified worker corner collision", () => {
  const originalSteering = cfg.worker.drawbarSteeringRadians;
  cfg.worker.drawbarSteeringRadians = 0.22;
  try {
    const a = rig({ x: 17, y: 4.5, d: 0, mode: "push" }),
      b = rig({ x: 15.5, y: 4, d: 6, mode: "push" }),
      step = travel(a, b, false),
      obstacle = { x: 17, y: 3 },
      g = new Game();
    g.pose = a;
    g.crates = [
      {
        id: "audit",
        color: "red",
        active: true,
        paid: false,
        loc: { kind: "floor", x: 1, y: 2 },
      },
    ];
    g.task = {
      crate: "audit",
      dest: { kind: "floor", x: 16, y: 5 },
      phase: step.phase,
      steps: [step],
      route: [a, b],
      elapsed: 0,
      blocked: false,
      cost: step.duration,
      inserted: false,
      deposited: false,
    };
    g.advance(0.95);
    g.assertInvariant();
    const frozen = structuredClone(g.transportGeometry),
      currentFraction = g.task.elapsed / step.duration,
      nextFraction = (g.task.elapsed - 0.05) / step.duration;
    assert.equal(
      overlapArea(bodies(a, b, currentFraction, false)[0], obstacle),
      0,
    );
    assert.ok(
      overlapArea(bodies(a, b, nextFraction, false)[0], obstacle) > 9e-7,
      "The independent employee polygon must intersect the obstacle on the next rollback tick",
    );
    g.reservations.add("17,3");
    g.cancel();
    g.advance(0.05);
    assert.ok(
      g.task?.blocked,
      "Cancellation must reject the unsafe reverse sweep",
    );
    assert.deepEqual(g.transportGeometry, frozen);
    g.assertInvariant();
  } finally {
    cfg.worker.drawbarSteeringRadians = originalSteering;
  }
});
