import { dirs, tail, key, same } from "./config.ts";
import type { Point, Pose } from "./config.ts";
export const poseKey = (p: Pose) => `${key(p)},${p.d}`;
export function legal(p: Pose, free: (p: Point) => boolean) {
  return free(p) && free(tail(p));
}
// Conservative swept rectangle includes both modules, corner clearance and turning arc.
export function transition(a: Pose, b: Pose, free: (p: Point) => boolean) {
  const pts = [a, b, tail(a), tail(b)];
  for (
    let x = Math.min(...pts.map((p) => p.x));
    x <= Math.max(...pts.map((p) => p.x));
    x++
  )
    for (
      let y = Math.min(...pts.map((p) => p.y));
      y <= Math.max(...pts.map((p) => p.y));
      y++
    )
      if (!free({ x, y })) return false;
  return true;
}
export function edgeCost(a: Pose, b: Pose) {
  return same(a, b) ? 0.5 : Math.hypot(b.x - a.x, b.y - a.y);
}
export function findPath(
  start: Pose,
  goal: (p: Pose) => boolean,
  free: (p: Point) => boolean,
): Pose[] | null {
  const queue = [{ p: start, c: 0 }],
    cost = new Map([[poseKey(start), 0]]),
    prev = new Map<string, Pose>();
  while (queue.length) {
    queue.sort((a, b) => a.c - b.c);
    const { p, c } = queue.shift()!;
    if (c !== cost.get(poseKey(p))) continue;
    if (goal(p)) {
      const path = [p];
      while (prev.has(poseKey(path[0])))
        path.unshift(prev.get(poseKey(path[0]))!);
      return path;
    }
    const next: Pose[] = [
      { ...p, d: (p.d + 1) % 8 },
      { ...p, d: (p.d + 7) % 8 },
      ...dirs.map((v) => ({ x: p.x + v.x, y: p.y + v.y, d: p.d })),
    ];
    for (const q of next) {
      if (!transition(p, q, free)) continue;
      const n = c + edgeCost(p, q),
        k = poseKey(q);
      if (n < (cost.get(k) ?? Infinity)) {
        cost.set(k, n);
        prev.set(k, p);
        queue.push({ p: q, c: n });
      }
    }
  }
  return null;
}
