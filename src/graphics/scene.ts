import { displayColor, remainingRounds } from "../shipments.ts";
import { priorityMultiplier } from "../campaign.ts";
import { CampaignGame, station, sorterOutputs } from "../campaign-game.ts";
import cfg, { dock } from "../config.ts";
import type { Point } from "../config.ts";
import { locationPoint } from "../simulation.ts";
import type { Game, Crate } from "../simulation.ts";
import { geometry } from "../pathfinding.ts";
import {
  Camera,
  GRAPHICS,
  LAYERS,
  tileCenter,
  VEHICLE_GRAPHICS,
} from "./config.ts";
import type { Bounds } from "./config.ts";
import type { AssetRegistry } from "./assets.ts";
import { DIRECTIONS } from "./assets.ts";
import { AnimationController } from "./animation.ts";
import type { AnimationSample } from "./animation.ts";
import { RenderQueue } from "./engine.ts";
import type { AssetCommand, DrawCommand } from "./engine.ts";
export type VehicleView = {
  id: string;
  kind: "inbound" | "outbound";
  bay: number;
  capacity: number;
  state: string;
  timer: number;
};
export type RigConnection = {
  worker: string;
  hitch: Point;
  grip: Point;
  body: AssetCommand;
  actor: AssetCommand;
  handle: AssetCommand;
  animation: AnimationSample;
};
const pointAdd = (p: Point, x: number, y: number): Point => ({
  x: p.x + x,
  y: p.y + y,
});
export function vehicleLengthSource(capacity: number) {
  if (!Number.isInteger(capacity) || capacity < 2 || capacity % 2)
    throw Error("Pojazd wymaga parzystej dodatniej pojemności");
  return (
    (capacity / 2) * VEHICLE_GRAPHICS.segmentSourceWidth +
    VEHICLE_GRAPHICS.cabSourceWidth +
    VEHICLE_GRAPHICS.endSourceWidth
  );
}
export function composeVehicle(
  q: RenderQueue,
  r: AssetRegistry,
  vehicle: VehicleView,
  columns: number,
) {
  const n = vehicle.capacity / 2,
    length = vehicleLengthSource(vehicle.capacity) / GRAPHICS.sourceTile,
    y = vehicle.bay ? -4 : 2,
    inbound = vehicle.kind === "inbound",
    sign = inbound ? -1 : 1;
  const shift = ["arriving", "departing"].includes(vehicle.state)
    ? GRAPHICS.vehicleTravel *
      (vehicle.state === "arriving" ? vehicle.timer : 1 - vehicle.timer) *
      sign
    : 0;
  const rear = (inbound ? 0 : columns) + shift,
    left = inbound
      ? rear - n - VEHICLE_GRAPHICS.cabSourceWidth / GRAPHICS.sourceTile
      : rear - VEHICLE_GRAPHICS.endSourceWidth / GRAPHICS.sourceTile,
    base = `vehicle/${vehicle.id}`;
  q.asset(
    r,
    `${base}/shadow`,
    "shadow/vehicle",
    { x: left + length / 2, y: y + 1.2 },
    { alpha: 0.2, scaleX: length, scaleY: 4 },
  );
  const component = (
    id: string,
    asset: string,
    x: number,
    mirror = false,
    order = 0,
  ) =>
    q.asset(
      r,
      `${base}/${id}`,
      asset,
      { x, y },
      { mirror, order, floorY: y + 1.8 },
    );
  // One column of cargo modules always contains exactly two physical slots.
  for (let d = 0; d < n; d++) {
    const x = inbound ? rear - 1 - d : rear + d;
    component(`segment/${d}`, "vehicle/default/cargo_segment", x, false, -10);
    for (let lane = 0; lane < 2; lane++)
      q.asset(
        r,
        `${base}/slot/${lane}/${d}`,
        "vehicle/default/slot",
        { x, y: y + lane },
        { floorY: y + 1.8, order: -8 },
      );
  }
  const cabinX = inbound ? rear - n : rear + n;
  component("cab", "vehicle/default/cab", cabinX, inbound, -9);
  component("end", "vehicle/default/end", inbound ? rear : rear, !inbound, -7);
  // Axles depend on vehicle length, not on the number of cargo segments.
  const axleXs = inbound
    ? [rear - n - 0.5, rear - 0.55]
    : [rear + n + 0.5, rear + 0.55];
  for (const [a, x] of axleXs.entries())
    for (const [side, wy] of [y - 0.08, y + 2.08].entries())
      q.asset(
        r,
        `${base}/wheel/${a}/${side}`,
        "vehicle/default/wheel",
        { x, y: wy },
        { floorY: y + 1.8, order: -6 },
      );
  q.add({
    kind: "text",
    id: `${base}/label`,
    point: { x: left, y: y - 0.25 },
    text: vehicle.id,
    color: "#405b69",
    floorY: y,
    layer: LAYERS.effects,
    order: 0,
  });
  return { left, right: left + length, top: y, bottom: y + 2 };
}
export function composeRack(
  q: RenderQueue,
  r: AssetRegistry,
  id: string,
  origin: Point,
  length: number,
) {
  if (!Number.isInteger(length) || length < 1) throw Error("Długość regału");
  for (let i = 0; i < length; i++) {
    const p = { x: origin.x + i + 0.5, y: origin.y + 0.5 };
    q.asset(r, `${id}/segment/${i}`, "rack/standard/segment", p);
    q.asset(r, `${id}/beam/${i}`, "rack/standard/beam", pointAdd(p, 0, -0.7), {
      floorY: p.y,
      order: 2,
    });
    q.asset(r, `${id}/shelf/${i}`, "rack/standard/shelf", p, { order: 3 });
  }
  for (let i = 0; i <= length; i++)
    q.asset(
      r,
      `${id}/post/${i}`,
      "rack/standard/post",
      { x: origin.x + i, y: origin.y + 0.5 },
      { order: 4 },
    );
}
export class SceneBuilder {
  registry: AssetRegistry;
  animations: AnimationController;
  queue = new RenderQueue();
  connections: RigConnection[] = [];
  game: Game | null = null;
  constructor(registry: AssetRegistry, animations = new AnimationController()) {
    this.registry = registry;
    this.animations = animations;
  }
  asset(
    id: string,
    assetId: string,
    p: Point,
    extra: Parameters<RenderQueue["asset"]>[4] = {},
  ) {
    return this.queue.asset(this.registry, id, assetId, p, extra);
  }
  vehicles(g: Game): VehicleView[] {
    if (g instanceof CampaignGame)
      return g.cmrs
        .filter((m) => ["arriving", "docked", "departing"].includes(m.state))
        .map((m) => ({
          id: m.vehicle + "-" + m.id,
          kind: m.kind,
          bay: m.bay,
          capacity: m.capacity,
          state: m.state,
          timer: m.timer,
        }));
    return [
      {
        id: "IN-01",
        kind: "inbound" as const,
        bay: 0,
        capacity: 4,
        state: g.inbound,
        timer: g.inboundTimer,
      },
      ...(g.round >= 2
        ? [
            {
              id: "BUS-01",
              kind: "outbound" as const,
              bay: 0,
              capacity: 4,
              state: g.outbound,
              timer: 0,
            },
          ]
        : []),
    ].filter((v) => ["arriving", "docked", "departing"].includes(v.state));
  }
  bounds(g: Game): Bounds {
    const hub = g instanceof CampaignGame ? g : null,
      maxCapacity = Math.max(
        4,
        ...(hub
          ? [...hub.config.arrivals, ...hub.config.departures].map(
              (m) => m.capacity,
            )
          : []),
      ),
      extent =
        maxCapacity / 2 +
        (VEHICLE_GRAPHICS.cabSourceWidth + VEHICLE_GRAPHICS.endSourceWidth) /
          GRAPHICS.sourceTile +
        GRAPHICS.vehicleTravel;
    return {
      minX: -extent - 0.5,
      minY: (hub?.minY ?? 0) - 1.5,
      maxX: cfg.map.columns + extent + 0.5,
      maxY: cfg.map.rows + 1,
    };
  }
  build(
    g: Game,
    onCrate?: (c: Crate, p: Point, angle: number, lift: number) => void,
  ) {
    this.game = g;
    this.queue.clear();
    this.connections = [];
    const q = this.queue,
      r = this.registry,
      hub = g instanceof CampaignGame ? g : null,
      minY = hub?.minY ?? 0,
      cols = cfg.map.columns,
      rows = cfg.map.rows;
    const bounds = this.bounds(g);
    this.asset(
      "exterior",
      "exterior/base",
      { x: bounds.minX, y: bounds.minY },
      {
        repeat: {
          width: (bounds.maxX - bounds.minX) * GRAPHICS.sourceTile,
          height: (bounds.maxY - bounds.minY) * GRAPHICS.sourceTile,
        },
      },
    );
    for (let x = 0; x < cols; x++)
      for (let y = minY; y < rows; y++) {
        const variant = ((Math.imul(x, 73) ^ Math.imul(y, 193)) >>> 0) % 11;
        this.asset(
          `floor/${x}/${y}`,
          variant === 0
            ? "floor/variant_01"
            : variant === 1
              ? "floor/variant_02"
              : "floor/base",
          { x, y },
        );
        if (dock({ x, y }))
          this.asset(`ramp/${x}/${y}`, "floor/ramp", { x, y });
        if (dock({ x, y }))
          this.asset(`mark/${x}/${y}`, "floor/marking", { x, y });
        const zone = hub?.zoneAt({ x, y });
        if (zone && zone !== "standard")
          this.asset(
            `zone/${x}/${y}`,
            `cargo/overlay/${zone}`,
            tileCenter({ x, y }),
            { layer: LAYERS.markings, alpha: 0.6, scaleX: 3, scaleY: 3 },
          );
      }
    for (let x = 0; x < cols; x++)
      this.wall(
        `north/${x}`,
        { x: x + 0.5, y: minY },
        x === 0 || x === cols - 1 ? "corner" : "segment",
      );
    for (let x = 0; x < cols; x++)
      this.wall(
        `south/${x}`,
        { x: x + 0.5, y: rows },
        x === 0 || x === cols - 1 ? "corner" : "segment",
      );
    for (let y = minY; y < rows; y++)
      for (const x of [0, cols]) {
        const gate =
          y === 2 ||
          y === 3 ||
          (hub?.purchased.includes("ramps") && (y === -4 || y === -3));
        if (!gate) this.wall(`side/${x}/${y}`, { x, y: y + 0.5 }, "column");
        else
          this.asset(`gate-mark/${x}/${y}`, "floor/marking", {
            x: x === 0 ? 0 : cols - 1,
            y,
          });
      }
    this.rooms();
    for (const v of this.vehicles(g)) composeVehicle(q, r, v, cols);
    if (hub)
      for (const [name, p] of Object.entries(station))
        if (hub.purchased.includes(name as "sorter" | "service")) {
          this.asset(
            `machine/${name}/shadow`,
            "shadow/furniture",
            pointAdd(tileCenter(p), 0, 0.2),
            { alpha: 0.2 },
          );
          this.asset(`machine/${name}`, `machine/${name}`, tileCenter(p));
          q.add({
            kind: "text",
            id: `machine/${name}/label`,
            point: pointAdd(p, 0, -0.15),
            text: name === "sorter" ? "MIX" : "SERWIS",
            color: "#4e6777",
            floorY: p.y,
            layer: LAYERS.effects,
            order: 0,
          });
        }
    if (hub?.purchased.includes("sorter"))
      for (const [i, p] of sorterOutputs.entries())
        q.add({
          kind: "text",
          id: `sorter/output/${i}`,
          point: pointAdd(p, 0.15, 0.5),
          text: "WY",
          color: "#928958",
          floorY: p.y,
          layer: LAYERS.markings,
          order: 0,
        });
    const workers = hub?.workers ?? [g];
    for (const [i, w] of workers.entries()) this.rig(w, i);
    const addCargo =
      onCrate ?? ((c, p, angle, lift) => this.cargo(c, p, angle, lift));
    for (const c of g.crates) {
      let p = locationPoint(c.loc),
        w = workers[c.owner ?? 0] ?? g;
      if (c.loc.kind === "worker") p = w.transportGeometry.back;
      if (!p) continue;
      if (
        c.loc.kind === "inbound" &&
        (hub
          ? hub.cmrAt("inbound", c.loc.bay ?? 0)?.state !== "docked"
          : g.inbound !== "docked")
      )
        continue;
      let height = 0;
      if (
        c.loc.kind === "worker" ||
        (w.task?.crate === c.id && w.task.phase === "LIFT")
      )
        height = w.forkHeight;
      addCargo(c, p, w.crateAngle(c), height);
    }
    return this.queue;
  }
  wall(id: string, p: Point, kind = "segment") {
    const d = this.registry.get(`wall/${kind}`);
    for (const [i, part] of (
      d.parts ?? [
        {
          layer: d.renderLayer,
          rect: { x: 0, y: 0, width: d.frameWidth, height: d.frameHeight },
        },
      ]
    ).entries())
      this.asset(`wall/${id}/${i}`, d.id, p, {
        layer: part.layer,
        clip: part.rect,
      });
  }
  rooms() {
    for (const room of cfg.map.rooms) {
      for (let x = room.x; x < room.x + room.width; x++)
        for (let y = room.y; y < room.y + room.height; y++)
          this.asset(`room/${room.id}/floor/${x}/${y}`, "floor/worn", { x, y });
      for (let x = room.x; x < room.x + room.width; x++)
        this.wall(`room/${room.id}/north/${x}`, { x: x + 0.5, y: room.y });
      this.queue.add({
        kind: "text",
        id: `room/${room.id}/label`,
        point: { x: room.x + 0.15, y: room.y + 0.7 },
        text: room.label,
        color: "#4d6477",
        floorY: room.y,
        layer: LAYERS.effects,
        order: 0,
      });
      const furniture = (
        id: string,
        asset: string,
        x: number,
        y: number,
        order = 0,
      ) => {
        const p = { x: room.x + x, y: room.y + y };
        this.asset(
          `room/${room.id}/${id}/shadow`,
          "shadow/furniture",
          pointAdd(p, 0, 0.1),
          { alpha: 0.18 },
        );
        this.asset(`room/${room.id}/${id}`, `furniture/${asset}`, p, { order });
      };
      if (room.id === "office") {
        furniture("desk", "desk", 1, 1.5);
        furniture("monitor", "monitor", 1, 1.5, 2);
        furniture("chair", "chair", 1, 2.4);
      }
      if (room.id === "locker") {
        for (let i = 0; i < room.width; i++)
          furniture(`locker/${i}`, "locker", i + 0.5, 1.6);
        furniture("bench", "bench", 1.5, 2.5);
      }
      if (room.id === "toilet") {
        furniture("toilet", "toilet", 0.65, 1.6);
        furniture("sink", "sink", 1.5, 2.5);
      }
      if (room.id === "canteen") {
        furniture("table", "table", 1.5, 1.8);
        furniture("chair/0", "chair", 0.5, 1.8);
        furniture("chair/1", "chair", 2.5, 1.8);
      }
    }
  }
  rig(w: Game, index: number) {
    const g = w.transportGeometry,
      sample = this.animations.sample(w),
      base = `rig/${index}`,
      head = tileCenter(g.head),
      back = tileCenter(g.back),
      hitch = tileCenter(g.hitch),
      r = this.registry;
    this.asset(
      `${base}/worker-shadow`,
      "shadow/worker",
      pointAdd(head, 0, 0.08),
      { alpha: 0.18 },
    );
    this.asset(`${base}/jack-shadow`, "shadow/jack", pointAdd(back, 0, 0.12), {
      alpha: 0.18,
    });
    const body = this.asset(`${base}/body`, "jack/default/body", back, {
      direction: sample.bodyDirection,
      order: 10,
    });
    const assetId = `worker/default/${sample.state}`,
      d = r.get(assetId),
      f = r.frame(assetId, sample.direction, sample.frame),
      socket = f.sockets!.gripSocket;
    const grip = {
      x: head.x + (socket.x - d.anchorX) / GRAPHICS.sourceTile,
      y: head.y + (socket.y - d.anchorY) / GRAPHICS.sourceTile,
    };
    const dx = grip.x - hitch.x,
      dy = grip.y - hitch.y,
      lengthSource = Math.hypot(dx, dy) * GRAPHICS.sourceTile;
    const handle = this.asset(`${base}/handle`, "jack/default/handle", hitch, {
      floorY: head.y,
      order: 35,
      angle: Math.atan2(dy, dx),
      scaleX:
        lengthSource / r.get("jack/default/handle").attachmentPoints!.end.x,
    });
    const actor = this.asset(`${base}/worker`, assetId, head, {
      direction: sample.direction,
      frame: sample.frame,
      order: 40,
      after: [handle.id],
    });
    this.connections.push({
      worker: base,
      hitch,
      grip,
      body,
      actor,
      handle,
      animation: sample,
    });
    if (w.selected) {
      this.queue.add({
        kind: "outline",
        id: `${base}/selected`,
        point: g.head,
        width: 1,
        height: 1,
        color: "#f5c863",
        floorY: head.y,
        layer: LAYERS.effects,
        order: 0,
      });
    }
    if (w.selected && w.task)
      for (const [si, step] of w.task.steps.entries()) {
        const start =
          si === 0 ? Math.min(1, w.task.elapsed / step.duration) : 0;
        for (let j = 0; j < 8; j++) {
          const a = tileCenter(
              geometry(step.a, step.b, start + ((1 - start) * j) / 8).head,
            ),
            b = tileCenter(
              geometry(step.a, step.b, start + ((1 - start) * (j + 1)) / 8)
                .head,
            );
          this.queue.add({
            kind: "line",
            id: `${base}/route/${si}/${j}`,
            point: a,
            end: b,
            color:
              w.task.blocked && si === 0
                ? "#d16e6a"
                : step.loaded
                  ? "#4c9b70"
                  : "#558fc2",
            floorY: a.y,
            layer: LAYERS.effects,
            order: -1,
          });
        }
      }
  }
  cargo(c: Crate, p: Point, angle = 0, height = 0) {
    const point = tileCenter(p),
      base = `cargo/${c.id}`,
      g = this.game!,
      workers = g instanceof CampaignGame ? g.workers : [g],
      after = workers.flatMap((w, i) =>
        w.task?.crate === c.id ? [`rig/${i}/body`] : [],
      );
    this.asset(`${base}/shadow`, "shadow/cargo", pointAdd(point, 0, 0.18), {
      alpha: 0.22,
    });
    this.asset(`${base}/pallet`, "cargo/pallet", point, {
      angle,
      liftSource: height * GRAPHICS.liftSource,
      order: 20,
      after,
    });
    this.asset(`${base}/box`, `cargo/box/${displayColor(c, g.round)}`, point, {
      angle,
      liftSource: height * GRAPHICS.liftSource,
      order: 30,
      after: [`${base}/pallet`, ...after],
    });
    if (c.mix)
      this.asset(`${base}/mix`, "cargo/overlay/mix", point, {
        liftSource: height * GRAPHICS.liftSource,
      });
    const marker = (name: string, asset: string, dx: number, dy: number) =>
      this.asset(
        `${base}/${name}`,
        `cargo/overlay/${asset}`,
        pointAdd(point, dx, dy),
        { liftSource: height * GRAPHICS.liftSource },
      );
    if (c.priority) {
      const m = priorityMultiplier(c, g.time);
      this.asset(
        `${base}/priority`,
        "cargo/overlay/priority",
        pointAdd(point, 0.32, -0.33),
        {
          liftSource: height * GRAPHICS.liftSource,
          frame: m === 2 ? 0 : m === 1 ? 1 : 2,
        },
      );
    }
    if (c.temperature && c.temperature !== "standard")
      marker("temperature", c.temperature, -0.32, 0.3);
    if (c.condition && c.condition !== "standard")
      marker("condition", c.condition, 0.32, 0.3);
    if (remainingRounds(c, g.round))
      this.queue.add({
        kind: "text",
        id: `${base}/due`,
        point: pointAdd(
          point,
          -0.4,
          -0.25 - (height * GRAPHICS.liftSource) / GRAPHICS.sourceTile,
        ),
        text: String(remainingRounds(c, g.round)),
        color: "#294b6b",
        floorY: p.y,
        layer: LAYERS.effects,
        order: 2,
      });
    if (workers.some((w) => w.source === c.id || w.highlight === c.id))
      this.queue.add({
        kind: "outline",
        id: `${base}/selected`,
        point: p,
        width: 1,
        height: 1,
        color: "#e5bc55",
        floorY: p.y,
        layer: LAYERS.effects,
        order: 2,
      });
  }
}
