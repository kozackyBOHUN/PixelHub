import cfg, { dirs, tail, key, same } from "./config.ts";
import type { Point, Pose } from "./config.ts";
export type Mode = "pull" | "push";
export type RigPose = Pose & { mode: Mode };
export const HITCH_OFFSET = 0.42,
  DRAWBAR_LENGTH = 0.58;
export type Geometry = {
  head: Point;
  back: Point;
  heading: Point;
  hitch: Point;
};
export const poseKey = (p: Pose) => `${key(p)},${p.d},${p.mode ?? "pull"}`;
export const rig = (p: Pose): RigPose => ({ ...p, mode: p.mode ?? "pull" });
const add = (a: Point, b: Point, n = 1): Point => ({
  x: a.x + b.x * n,
  y: a.y + b.y * n,
});
export function neighbors(p: RigPose): RigPose[] {
  const v = dirs[p.d],
    sign = p.mode === "pull" ? 1 : -1,
    radius = cfg.worker.turnRadiusTiles;
  return [
    { ...p, mode: p.mode === "pull" ? "push" : "pull" },
    { ...p, ...add(p, v, sign * 0.5) },
    ...[-2, 2].map((turn) => {
      const d = (p.d + turn + 8) % 8;
      const w = dirs[d];
      const delta =
        p.mode === "pull"
          ? {
              x: (radius - 1) * v.x + (radius + 1) * w.x,
              y: (radius - 1) * v.y + (radius + 1) * w.y,
            }
          : {
              x: -(radius + 1) * v.x + (1 - radius) * w.x,
              y: -(radius + 1) * v.y + (1 - radius) * w.y,
            };
      return { ...p, ...add(p, delta), d };
    }),
  ];
}
export function motionKind(
  a: Pose,
  b: Pose,
): "switch" | "straight" | "turn" | null {
  if (a.d % 2 || b.d % 2) return null;
  const aa = rig(a),
    bb = rig(b);
  if (same(a, b) && a.d === b.d && aa.mode !== bb.mode) return "switch";
  if (aa.mode !== bb.mode) return null;
  const v = dirs[a.d],
    length = (b.x - a.x) * v.x + (b.y - a.y) * v.y;
  if (
    a.d === b.d &&
    Math.abs((b.x - a.x) * v.y - (b.y - a.y) * v.x) < 1e-9 &&
    (length === (aa.mode === "pull" ? 0.5 : -0.5) ||
      length === (aa.mode === "pull" ? 1 : -1))
  )
    return "straight";
  return neighbors(aa).some((q) => poseKey(q) === poseKey(bb))
    ? a.d === b.d
      ? "straight"
      : "turn"
    : null;
}
// The pallet wheels follow a configurable-radius circular arc without lateral slip.
// The employee steers the rigid unit drawbar at the front of that trajectory.
// Pushing traverses exactly the reverse of a pulling arc.
export function geometry(a: Pose, b: Pose = a, f = 0): Geometry {
  const kind = a.d !== b.d ? "turn" : "straight";
  let back: Point, heading: Point;
  if (kind === "turn") {
    if (rig(a).mode === "push")
      return geometry({ ...b, mode: "pull" }, { ...a, mode: "pull" }, 1 - f);
    const v = dirs[a.d],
      w = dirs[b.d],
      angle = (f * Math.PI) / 2;
    const start = tail(a);
    const r = cfg.worker.turnRadiusTiles;
    back = {
      x: start.x + r * (v.x * Math.sin(angle) + w.x * (1 - Math.cos(angle))),
      y: start.y + r * (v.y * Math.sin(angle) + w.y * (1 - Math.cos(angle))),
    };
    heading = {
      x: v.x * Math.cos(angle) + w.x * Math.sin(angle),
      y: v.y * Math.cos(angle) + w.y * Math.sin(angle),
    };
  } else {
    heading = dirs[a.d];
    back = {
      x: tail(a).x + (tail(b).x - tail(a).x) * f,
      y: tail(a).y + (tail(b).y - tail(a).y) * f,
    };
  }
  const hitch = add(back, heading, HITCH_OFFSET);
  const cross = dirs[a.d].x * dirs[b.d].y - dirs[a.d].y * dirs[b.d].x;
  const steering =
    kind === "turn"
      ? cross * cfg.worker.drawbarSteeringRadians * Math.sin(Math.PI * f)
      : 0;
  const bar = {
    x: heading.x * Math.cos(steering) - heading.y * Math.sin(steering),
    y: heading.x * Math.sin(steering) + heading.y * Math.cos(steering),
  };
  const head = add(hitch, bar, DRAWBAR_LENGTH);
  return { head, back, heading, hitch };
}
// SAT against closed unit cells. Coordinates denote cell centres minus (0.5,0.5).
// A conservative margin bounds displacement between samples, so a thin obstacle
// cannot fall between samples. This checks the swept bodies, not a 3x3 rule.
function boxFree(
  center: Point,
  v: Point,
  halfX: number,
  halfY: number,
  free: (p: Point) => boolean,
) {
  const extentX = Math.abs(v.x) * halfX + Math.abs(v.y) * halfY;
  const extentY = Math.abs(v.y) * halfX + Math.abs(v.x) * halfY;
  for (
    let x = Math.ceil(center.x - extentX - 0.5 + 1e-9);
    x <= Math.floor(center.x + extentX + 0.5 - 1e-9);
    x++
  )
    for (
      let y = Math.ceil(center.y - extentY - 0.5 + 1e-9);
      y <= Math.floor(center.y + extentY + 0.5 - 1e-9);
      y++
    ) {
      const dx = x - center.x,
        dy = y - center.y;
      if (
        Math.abs(dx * v.x + dy * v.y) >=
        halfX + 0.5 * (Math.abs(v.x) + Math.abs(v.y)) - 1e-9
      )
        continue;
      if (
        Math.abs(-dx * v.y + dy * v.x) >=
        halfY + 0.5 * (Math.abs(v.x) + Math.abs(v.y)) - 1e-9
      )
        continue;
      if (!free({ x, y })) return false;
    }
  return true;
}
export function geometryFree(
  g: Geometry,
  free: (p: Point) => boolean,
  loaded = true,
  margin = 0,
) {
  const { head, back, heading: v } = g;
  return (
    boxFree(head, { x: 1, y: 0 }, 0.34 + margin, 0.45 + margin, free) &&
    boxFree(
      back,
      v,
      (loaded ? 0.38 : 0.36) + margin,
      (loaded ? 0.38 : 0.28) + margin,
      free,
    ) &&
    boxFree(
      add(back, v, HITCH_OFFSET / 2),
      v,
      HITCH_OFFSET / 2 + margin,
      0.055 + margin,
      free,
    ) &&
    boxFree(
      { x: (g.hitch.x + head.x) / 2, y: (g.hitch.y + head.y) / 2 },
      {
        x: (head.x - g.hitch.x) / DRAWBAR_LENGTH,
        y: (head.y - g.hitch.y) / DRAWBAR_LENGTH,
      },
      DRAWBAR_LENGTH / 2 + margin,
      0.055 + margin,
      free,
    )
  );
}
export function legal(p: Pose, free: (p: Point) => boolean) {
  return p.d % 2 === 0 && geometryFree(geometry(p), free);
}
// Bounds displacement of every body point per unit of normalized progress.
// Includes worker/hinge translation, drawbar articulation and rotating corners.
function sweepMargin(
  kind: "switch" | "straight" | "turn",
  span: number,
  samples: number,
) {
  const rate =
    kind === "turn"
      ? (Math.PI / 2) * (cfg.worker.turnRadiusTiles + 1.6) +
        DRAWBAR_LENGTH * cfg.worker.drawbarSteeringRadians * Math.PI
      : kind === "straight"
        ? 1
        : 0;
  return (rate * span) / (2 * samples) + (rate ? 1e-6 : 0);
}
export function transitionRange(
  a: Pose,
  b: Pose,
  free: (p: Point) => boolean,
  loaded = true,
  from = 0,
  to = 1,
) {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to > 1 ||
    from > to
  )
    return false;
  const kind = motionKind(a, b);
  if (!kind)
    return (
      same(a, b) &&
      a.d === b.d &&
      a.mode === b.mode &&
      geometryFree(geometry(a), free, loaded)
    );
  const span = to - from,
    samples = Math.max(1, Math.ceil((kind === "turn" ? 64 : 32) * span));
  const margin = sweepMargin(kind, span, samples);
  for (let i = 0; i <= samples; i++)
    if (
      !geometryFree(
        geometry(a, b, from + (span * i) / samples),
        free,
        loaded,
        margin,
      )
    )
      return false;
  return true;
}
const sweptCache = new Map<string, Point[]>();
export function sweptCells(a: Pose, b: Pose, loaded = true): Point[] {
  const kind = motionKind(a, b);
  if (!kind) return [];
  const origin = { x: Math.floor(a.x), y: Math.floor(a.y) };
  const k = `${a.x - origin.x},${a.y - origin.y},${a.d},${rig(a).mode}:${b.x - a.x},${b.y - a.y},${b.d},${rig(b).mode}:${loaded}:${cfg.worker.turnRadiusTiles}:${cfg.worker.drawbarSteeringRadians}`;
  let cells = sweptCache.get(k);
  if (!cells) {
    const aa = { ...a, x: a.x - origin.x, y: a.y - origin.y },
      bb = { ...b, x: b.x - origin.x, y: b.y - origin.y };
    const samples = kind === "turn" ? 64 : 32;
    const margin = sweepMargin(kind, 1, samples);
    const visited = new Map<string, Point>();
    for (let i = 0; i <= samples; i++)
      geometryFree(
        geometry(aa, bb, i / samples),
        (p) => {
          visited.set(key(p), p);
          return true;
        },
        loaded,
        margin,
      );
    cells = [...visited.values()];
    sweptCache.set(k, cells);
  }
  return cells.map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
}
export function transition(
  a: Pose,
  b: Pose,
  free: (p: Point) => boolean,
  loaded = true,
) {
  return !!motionKind(a, b) && sweptCells(a, b, loaded).every(free);
}
export function edgeCost(a: Pose, b: Pose, loaded = false) {
  const kind = motionKind(a, b);
  if (!kind) return Infinity;
  if (kind === "switch") return cfg.worker.switchSeconds;
  const speed = loaded
    ? rig(a).mode === "pull"
      ? cfg.worker.loadedSecondsPerCardinalTile
      : cfg.worker.pushSecondsPerCardinalTile
    : cfg.worker.emptySecondsPerCardinalTile;
  return (
    speed *
    (kind === "turn" ? turnDistance() : Math.hypot(b.x - a.x, b.y - a.y))
  );
}
const distanceCache = new Map<string, number>();
function turnDistance() {
  const k = `${cfg.worker.turnRadiusTiles}:${cfg.worker.drawbarSteeringRadians}`;
  if (distanceCache.has(k)) return distanceCache.get(k)!;
  const a = rig({ x: 0, y: 0, d: 0 }),
    b = neighbors(a).find((p) => p.d === 2)!;
  let length = 0,
    previous = geometry(a, b, 0).head;
  for (let i = 1; i <= 256; i++) {
    const current = geometry(a, b, i / 256).head;
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }
  distanceCache.set(k, length);
  return length;
}
export class MinHeap<T> {
  items: { value: T; cost: number }[] = [];
  push(value: T, cost: number) {
    const a = this.items;
    let i = a.length;
    a.push({ value, cost });
    while (i) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= cost) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = { value, cost };
  }
  pop() {
    const a = this.items;
    if (!a.length) return undefined;
    const out = a[0],
      last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let j = i * 2 + 1;
        if (j + 1 < a.length && a[j + 1].cost < a[j].cost) j++;
        if (a[j].cost >= last.cost) break;
        a[i] = a[j];
        i = j;
      }
      a[i] = last;
    }
    return out;
  }
}
export function findPath(
  start: Pose,
  goal: (p: RigPose) => boolean,
  free: (p: Point) => boolean,
  loaded = false,
  costOf = (a: Pose, b: Pose) => edgeCost(a, b, loaded),
): RigPose[] | null {
  const q = new MinHeap<RigPose>(),
    cost = new Map<string, number>(),
    prev = new Map<string, RigPose>();
  const s = rig(start);
  q.push(s, 0);
  cost.set(poseKey(s), 0);
  for (let item; (item = q.pop());) {
    const { value: p, cost: c } = item,
      k = poseKey(p);
    if (c !== cost.get(k)) continue;
    if (goal(p)) {
      const path = [p];
      while (prev.has(poseKey(path[0])))
        path.unshift(prev.get(poseKey(path[0]))!);
      return path;
    }
    for (const b of neighbors(p)) {
      if (!transition(p, b, free, loaded)) continue;
      const n = c + costOf(p, b),
        bk = poseKey(b);
      if (n < (cost.get(bk) ?? Infinity)) {
        cost.set(bk, n);
        prev.set(bk, p);
        q.push(b, n);
      }
    }
  }
  return null;
}
