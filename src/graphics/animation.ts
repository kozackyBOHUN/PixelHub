import type { Game, Task } from "../simulation.ts";
import type { TransportStep } from "../transport.ts";
import { geometry } from "../pathfinding.ts";
import type { Point } from "../config.ts";
import { angleDirection } from "./assets.ts";
import type { WorkerState } from "./assets.ts";
import { GRAPHICS } from "./config.ts";
const tables = new WeakMap<TransportStep, number[]>();
function lengthTable(step: TransportStep) {
  let table = tables.get(step);
  if (table) return table;
  table = [0];
  let previous = geometry(step.a, step.b, 0).head;
  for (let i = 1; i <= 64; i++) {
    const p = geometry(step.a, step.b, i / 64).head;
    table.push(table[i - 1] + Math.hypot(p.x - previous.x, p.y - previous.y));
    previous = p;
  }
  tables.set(step, table);
  return table;
}
export function stepDistance(step: TransportStep, fraction = 1) {
  const table = lengthTable(step),
    f = Math.max(0, Math.min(1, fraction)) * 64,
    i = Math.floor(f);
  return i === 64 ? table[64] : table[i] + (table[i + 1] - table[i]) * (f - i);
}
export function remainingDistance(task: Task) {
  return task.steps.reduce(
    (sum, s, i) =>
      sum +
      stepDistance(s) -
      (i === 0 ? stepDistance(s, task.elapsed / s.duration) : 0),
    0,
  );
}
export type AnimationSample = {
  state: WorkerState;
  frame: number;
  direction: number;
  bodyDirection: number;
  angle: number;
  distance: number;
  moving: boolean;
  gripFacing: number;
};
type Track = {
  task: Task | null;
  remaining: number;
  distance: number;
  known: Set<TransportStep>;
  lastPoint: Point;
  sample: AnimationSample;
};
export class AnimationController {
  private tracks = new WeakMap<Game, Track>();
  sample(worker: Game): AnimationSample {
    const g = worker.transportGeometry,
      angle = Math.atan2(g.heading.y, g.heading.x),
      task = worker.task;
    let track = this.tracks.get(worker);
    if (!track) {
      track = {
        task: null,
        remaining: 0,
        distance: 0,
        known: new Set(),
        lastPoint: { ...g.head },
        sample: {
          state: "idle",
          frame: 0,
          direction: 0,
          bodyDirection: 0,
          angle,
          distance: 0,
          moving: false,
          gripFacing: angle,
        },
      };
      this.tracks.set(worker, track);
    }
    let delta = 0;
    if (track.task && track.task !== task)
      delta += Math.abs(track.remaining - remainingDistance(track.task)); // A task completed entirely between renders.
    if (task) {
      const remaining = remainingDistance(task);
      if (track.task === task) {
        if (task.steps.every((s) => track!.known.has(s)))
          delta += Math.abs(track.remaining - remaining);
        else
          delta += Math.hypot(
            g.head.x - track.lastPoint.x,
            g.head.y - track.lastPoint.y,
          );
      } else
        delta += Math.max(
          0,
          task.steps.reduce((sum, s) => sum + stepDistance(s), 0) - remaining,
        );
      track.remaining = remaining;
      track.known = new Set(task.steps);
    } else track.remaining = 0;
    track.distance += delta;
    track.task = task;
    track.lastPoint = { ...g.head };
    const phase = worker.transportState,
      step = task?.steps[0],
      stationary = [
        "IDLE",
        "BLOCKED",
        "LIFT",
        "LOWER",
        "SWITCH_DIRECTION",
      ].includes(phase);
    let state: WorkerState = "idle";
    if (!stationary) {
      if (
        phase === "PUSH" ||
        phase === "PUSH_TO_TARGET" ||
        phase === "INSERT_FORKS"
      )
        state = "push";
      else if (phase === "PULL") state = "pull";
      else if (phase === "MANEUVER" && worker.carried)
        state = step?.a.mode === "push" ? "push" : "pull";
      else state = "walk";
    }
    if (phase === "SWITCH_DIRECTION")
      state = step?.b.mode === "push" ? "push" : "pull";
    const workerAngle = Math.atan2(g.head.y - g.hitch.y, g.head.x - g.hitch.x);
    const facing = state === "push" ? workerAngle + Math.PI : workerAngle;
    const sample = {
      state,
      frame:
        state === "idle"
          ? Math.floor(worker.time / GRAPHICS.idleFrameSeconds) % 2
          : stationary
            ? 0
            : Math.floor(
                (track.distance / GRAPHICS.animationTilesPerCycle) * 4 + 1e-8,
              ) % 4,
      direction: angleDirection(facing),
      bodyDirection: angleDirection(angle, 16),
      angle,
      distance: track.distance,
      moving: !stationary,
      gripFacing: facing,
    };
    track.sample = sample;
    return sample;
  }
}
