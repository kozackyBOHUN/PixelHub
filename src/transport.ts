import cfg, { dirs, tail, same, inside } from "./config.ts";
import type { Point, Pose } from "./config.ts";
import {
  MinHeap,
  rig,
  poseKey,
  neighbors,
  transition,
  edgeCost,
  findPath,
} from "./pathfinding.ts";
import type { RigPose } from "./pathfinding.ts";
export type Phase =
  | "GO_TO_SOURCE"
  | "INSERT_FORKS"
  | "LIFT"
  | "PULL"
  | "PUSH"
  | "SWITCH_DIRECTION"
  | "MANEUVER"
  | "PUSH_TO_TARGET"
  | "LOWER"
  | "WITHDRAW_FORKS"
  | "CLEAR_VEHICLE";
export type TransportStep = {
  a: RigPose;
  b: RigPose;
  phase: Phase;
  duration: number;
  loaded: boolean;
  contact?: boolean;
};
export type TransportPlan = { steps: TransportStep[]; cost: number };
export const pointAt = (
  kind: "inbound" | "outbound",
  lane: number,
  depth: number,
): Point => ({ x: kind === "inbound" ? -1 - depth : 20 + depth, y: 2 + lane });
export const offset = (p: Point, d: number, n: number): Point => ({
  x: p.x + dirs[d].x * n,
  y: p.y + dirs[d].y * n,
});
export function travel(
  a: RigPose,
  b: RigPose,
  loaded: boolean,
  phase?: Phase,
): TransportStep {
  return {
    a,
    b,
    loaded,
    duration: edgeCost(a, b, loaded),
    phase:
      phase ??
      (same(a, b)
        ? "SWITCH_DIRECTION"
        : a.d !== b.d
          ? "MANEUVER"
          : loaded
            ? a.mode === "pull"
              ? "PULL"
              : "PUSH"
            : "GO_TO_SOURCE"),
  };
}
const stationary = (
  p: RigPose,
  phase: Phase,
  duration: number,
): TransportStep => ({ a: p, b: p, loaded: true, phase, duration });
// One Dijkstra search spans empty travel, all pickup sides and loaded travel.
// Every goal includes final insertion, lowering and one-tile fork withdrawal.
// Thus the selected goal minimizes the entire job, including pickup choice.
export function planTransport(
  start: Pose,
  source: Point,
  dest: Point,
  freeEmpty: (p: Point) => boolean,
  freeLoaded: (p: Point) => boolean,
  sourceDirection?: number,
  destDirection?: number,
  carried = false,
): TransportPlan | null {
  const suffix = new Map<string, TransportStep[]>();
  for (const d of [0, 2, 4, 6]) {
    if (destDirection !== undefined && d !== destDirection) continue;
    const drop: RigPose = { ...offset(dest, d, 1), d, mode: "push" };
    const pre: RigPose = { ...offset(drop, d, 1), d, mode: "push" };
    if (!transition(pre, drop, freeLoaded, true)) continue;
    const after: RigPose = { ...offset(drop, d, 1), d, mode: "pull" };
    // Pallet overlaps the deposited crate only during this axial withdrawal.
    if (!transition({ ...drop, mode: "pull" }, after, freeLoaded, false))
      continue;
    // The crate becomes a solid obstacle immediately after lowering. Check
    // that a worker who has withdrawn one tile can still leave the local pocket.
    // This is a look-ahead ONLY: no exit movement is appended to the job.
    // Without it, a quicker drop side can strand the jack between a crate and
    // the social rooms, making the next inbound crate unreachable.
    if (inside(dest)) {
      const freeAfter = (p: Point) => freeLoaded(p) && !same(p, dest);
      const escape = findPath(
        after,
        (p) => Math.hypot(p.x - after.x, p.y - after.y) >= 1.5,
        freeAfter,
      );
      if (!escape) continue;
    }
    // A completed delivery ends after exactly one tile of empty fork withdrawal.
    // Never force the worker to drive to a distant corridor after depositing.
    const list = [
      travel(pre, drop, true, "PUSH_TO_TARGET"),
      stationary(drop, "LOWER", cfg.worker.dropSeconds),
      travel(drop, { ...drop, mode: "pull" }, false),
      travel({ ...drop, mode: "pull" }, after, false, "WITHDRAW_FORKS"),
    ];
    // One tile clears the forks. Only a deep outbound vehicle slot additionally
    // needs the pallet to leave the vehicle before dispatch is physically safe.
    // This is the minimum required extra movement, not a trip to a corridor.
    if (dest.x >= 20 && tail(after).x >= 20) {
      const clear = { ...offset(after, after.d, 1), d: after.d, mode: "pull" as const };
      if (!transition(after, clear, freeLoaded, false)) continue;
      list.push(travel(after, clear, false, "CLEAR_VEHICLE"));
    }
    suffix.set(poseKey(pre), list);
  }
  if (!suffix.size) return null;
  type Node = { p: RigPose; loaded: boolean };
  const nk = (n: Node) => `${+n.loaded}:${poseKey(n.p)}`;
  const q = new MinHeap<Node>(),
    cost = new Map<string, number>(),
    prev = new Map<string, { node: Node; steps: TransportStep[] }>();
  const initial = { p: rig(start), loaded: carried };
  q.push(initial, 0);
  cost.set(nk(initial), 0);
  let best = Infinity,
    finish: Node | undefined,
    ending: TransportStep[] = [];
  for (let item; (item = q.pop());) {
    const { value: n, cost: c } = item,
      k = nk(n);
    if (c !== cost.get(k)) continue;
    if (c >= best) break;
    const end = n.loaded ? suffix.get(poseKey(n.p)) : undefined;
    if (end) {
      const total = c + end.reduce((s, e) => s + e.duration, 0);
      if (total < best) {
        best = total;
        finish = n;
        ending = end;
      }
    }
    const relax = (next: Node, steps: TransportStep[]) => {
      const nc = c + steps.reduce((s, e) => s + e.duration, 0),
        key = nk(next);
      if (nc < (cost.get(key) ?? Infinity) && nc < best) {
        cost.set(key, nc);
        prev.set(key, { node: n, steps });
        q.push(next, nc);
      }
    };
    for (const b of neighbors(n.p))
      if (transition(n.p, b, n.loaded ? freeLoaded : freeEmpty, n.loaded))
        relax({ p: b, loaded: n.loaded }, [travel(n.p, b, n.loaded)]);
    if (
      !n.loaded &&
      n.p.mode === "push" &&
      (sourceDirection === undefined || n.p.d === sourceDirection) &&
      same(tail(n.p), offset(source, n.p.d, 1))
    ) {
      const b: RigPose = { ...offset(n.p, n.p.d, -1), d: n.p.d, mode: "push" };
      if (transition(n.p, b, freeLoaded, false))
        relax({ p: b, loaded: true }, [
          travel(n.p, b, false, "INSERT_FORKS"),
          stationary(b, "LIFT", cfg.worker.pickupSeconds),
        ]);
    }
  }
  if (!finish) return null;
  const groups: TransportStep[][] = [ending];
  let cursor = finish;
  while (prev.has(nk(cursor))) {
    const p = prev.get(nk(cursor))!;
    groups.unshift(p.steps);
    cursor = p.node;
  }
  return { steps: groups.flat(), cost: best };
}
