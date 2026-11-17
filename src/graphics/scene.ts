import { rampAt } from "../warehouse.ts";
import { COLORS } from "../campaign.ts";
import {
  displayColor,
  destinationColor,
  remainingRounds,
} from "../shipments.ts";
import { priorityMultiplier } from "../campaign.ts";
import { CampaignGame, station, sorterPorts } from "../campaign-game.ts";
import cfg, { dock } from "../config.ts";
import { same } from "../config.ts";
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
  row?: number;
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
    y = vehicle.row ?? (vehicle.bay ? -4 : 2),
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
  const mirrorX = inbound ? rear - n - 0.5 : rear + n + 0.5;
  for (const [side, wy] of [y - 0.08, y + 2.08].entries())
    q.asset(
      r,
      "vehicle/" + vehicle.id + "/wheel/0/" + side,
      "vehicle/default/wheel",
      { x: mirrorX, y: wy },
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
  selectedCmr = "";
  coldPreview: (Point & { valid: boolean }) | null = null;
  sorterPreview: import("../campaign-game.ts").SorterSite | null = null;
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
      return g.vehicles
        .filter((m) => ["arriving", "docked", "departing"].includes(m.state))
        .map((m) => ({
          id: m.vehicle + "-" + m.id,
          kind: m.kind,
          bay: m.bay,
          row: g.rampRow(m.bay),
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
          ? [
              ...hub.config.arrivals.map((m) => m.capacity),
              ...hub.fleetCapacity,
              10,
            ]
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
      maxY: (hub ? 4 : cfg.map.rows) + 1,
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
      rows = hub ? 4 : cfg.map.rows;
    const bounds = this.bounds(g);
    for (const cell of hub?.clutter ?? []) {
      q.add({
        kind: "clutter",
        id: `clutter/${cell.x}/${cell.y}`,
        point: cell,
        floorY: cell.y + 1,
        layer: LAYERS.objects,
        order: 0,
        color: "#bd9874",
        text: ["cartons", "broken-pallet", "tires", "equipment"][
          (Math.abs(cell.x) + Math.abs(cell.y)) % 4
        ],
      });
      const pending = hub?.cleaning;
      if (pending && same(pending.target, cell)) {
        q.add({
          kind: "badge",
          id: "cleaning-progress",
          point: { x: cell.x + 0.5, y: cell.y },
          floorY: cell.y,
          layer: LAYERS.ui,
          order: 0,
          color: "#e7cb8b",
          text:
            pending.startedAt === undefined
              ? "Sprzątnij - 5 USD · dojście"
              : `Sprzątanie ${Math.min(100, Math.floor((hub!.time - pending.startedAt) * 50))}%`,
        });
      }
    }
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
        if (hub && !hub.contains({ x, y })) continue;
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
        if (hub && (x < 4 || x >= 16))
          q.add({
            kind: "fill",
            id: "zone-tone/" + x + "/" + y,
            point: { x, y },
            width: 1,
            height: 1,
            color: x < 4 ? "#3d92701a" : "#b786421a",
            floorY: y,
            layer: LAYERS.markings,
            order: -10,
          });
        const ramp = hub
          ? (x === 0 || x === cols - 1) &&
            hub.isRampRow(x === 0 ? "inbound" : "outbound", y)
          : dock({ x, y });
        if (ramp) {
          this.asset(`ramp/${x}/${y}`, "floor/ramp", { x, y });
          this.asset(`mark/${x}/${y}`, "floor/marking", { x, y });
        }
        const zone = hub?.zoneAt({ x, y });
        if (zone && zone !== "standard")
          this.asset(
            `zone/${x}/${y}`,
            `cargo/overlay/${zone}`,
            tileCenter({ x, y }),
            { layer: LAYERS.markings, alpha: 0.6, scaleX: 3, scaleY: 3 },
          );
      }
    if (hub) {
      for (let x = 0; x < cols; x++)
        for (let y = minY; y < rows; y++) {
          if (!hub.contains({ x, y })) continue;
          const ramp = rampAt(hub.levels, { x, y });
          if (!hub.contains({ x, y: y - 1 }))
            this.wall("north/" + x + "/" + y, { x: x + 0.5, y });
          if (!hub.contains({ x, y: y + 1 }))
            this.wall("south/" + x + "/" + y, { x: x + 0.5, y: y + 1 });
          if (!ramp && !hub.contains({ x: x - 1, y }))
            this.wall("west/" + x + "/" + y, { x, y: y + 0.5 }, "column");
          if (!ramp && !hub.contains({ x: x + 1, y }))
            this.wall(
              "east/" + x + "/" + y,
              { x: x + 1, y: y + 0.5 },
              "column",
            );
        }
    } else {
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
          const gate = y === 2 || y === 3;
          if (!gate) this.wall(`side/${x}/${y}`, { x, y: y + 0.5 }, "column");
          else
            this.asset(`gate-mark/${x}/${y}`, "floor/marking", {
              x: x === 0 ? 0 : cols - 1,
              y,
            });
        }
      this.rooms();
    }

    if (hub)
      for (const [i, w] of hub.workers.entries()) {
        const orders = [
          ...hub.queue(i),
          ...(w.task && !w.task.deposited
            ? [{ pallet: w.task.crate, dest: w.task.dest }]
            : []),
        ];
        for (const [j, order] of orders.entries()) {
          const cargo = hub.crates.find((c) => c.id === order.pallet);
          const source = cargo && locationPoint(cargo.loc);
          if (source)
            q.add({
              kind: "outline",
              id: "reserved/" + i + "/" + j,
              point: source,
              width: 1,
              height: 1,
              color: "#df3d38",
              floorY: source.y,
              layer: LAYERS.effects,
              order: 12,
            });
          const dest = locationPoint(order.dest);
          if (dest)
            for (const side of [-1, 1])
              q.add({
                kind: "line",
                id: "target/" + i + "/" + j + "/" + side,
                point: { x: dest.x + 0.28, y: dest.y + 0.5 - 0.22 * side },
                end: { x: dest.x + 0.72, y: dest.y + 0.5 + 0.22 * side },
                color: "#239b4e",
                lineWidthSource: 2,
                floorY: dest.y,
                layer: LAYERS.effects,
                order: 13,
              });
        }
      }
    for (const v of this.vehicles(g)) composeVehicle(q, r, v, cols);
    if (g instanceof CampaignGame) {
      const selected = g.cmrs.find(
        (m) => m.id === this.selectedCmr && m.state === "docked",
      );
      if (selected) {
        const width = selected.capacity / 2;
        const y = g.rampRow(selected.bay);
        q.add({
          kind: "outline",
          id: "selected-vehicle",
          point: { x: selected.kind === "inbound" ? -width : cols, y },
          width,
          height: 2,
          color: "#f5c863",
          floorY: y,
          layer: LAYERS.effects,
          order: 0,
        });
      }
    }
    if (hub?.purchased.includes("service")) {
      const p = station.service;
      this.asset(
        "machine/service/shadow",
        "shadow/furniture",
        pointAdd(tileCenter(p), 0, 0.2),
        { alpha: 0.2 },
      );
      this.asset("machine/service", "machine/service", tileCenter(p));
      q.add({
        kind: "text",
        id: "machine/service/label",
        point: pointAdd(p, 0, -0.15),
        text: "SERWIS",
        color: "#4e6777",
        floorY: p.y,
        layer: LAYERS.effects,
        order: 0,
      });
    }
    if (this.coldPreview)
      q.add({
        kind: "outline",
        id: "cold-preview",
        point: this.coldPreview,
        width: 1,
        height: 1,
        color: this.coldPreview.valid ? "#38a269" : "#d84444",
        floorY: this.coldPreview.y,
        layer: LAYERS.effects,
        order: 20,
      });
    const machines = [
      ...(hub?.sorters ?? []),
      ...(this.sorterPreview ? [this.sorterPreview] : []),
    ];
    for (const [index, sorter] of machines.entries()) {
      this.asset(
        "sorter/machine/" + index,
        "machine/sorter",
        tileCenter(sorter),
        {
          alpha: sorter === this.sorterPreview ? 0.6 : 1,
        },
      );
      const ports = sorterPorts(sorter);
      for (const [name, p, color] of [
        ["input", ports.input, "#ba4240"],
        ["input2", ports.input2, "#ba4240"],
        ["output2", ports.output2, "#34784f"],
        ["output", ports.output, "#34784f"],
      ] as const) {
        q.add({
          kind: "outline",
          id: `sorter/${index}/${name}`,
          point: p,
          width: 1,
          height: 1,
          color,
          floorY: p.y,
          layer: LAYERS.markings,
          order: 1,
        });
        const direction = [
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
          { x: 0, y: -1 },
        ][sorter.d / 2];
        const center = tileCenter(p);
        const tip = pointAdd(center, direction.x * 0.25, direction.y * 0.25);
        const shaft = pointAdd(
          center,
          -direction.x * 0.25,
          -direction.y * 0.25,
        );
        const arms = [-1, 1].map((side) =>
          pointAdd(
            tip,
            -direction.x * 0.18 - direction.y * 0.16 * side,
            -direction.y * 0.18 + direction.x * 0.16 * side,
          ),
        );
        for (const [index, start] of [shaft, ...arms].entries())
          q.add({
            kind: "line",
            id: `sorter/${index}/${name}/${index ? `arrowhead-${index}` : "arrow"}`,
            point: start,
            end: tip,
            color,
            lineWidthSource: 2,
            floorY: p.y,
            layer: LAYERS.markings,
            order: 2,
          });
      }
    }
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
      if (c.loc.kind === "outbound" && hub) {
        const truck = hub.shippingAt(c.loc.bay ?? 0);
        if (truck?.state === "departing")
          p = { ...p, x: p.x + GRAPHICS.vehicleTravel * (1 - truck.timer) };
      }
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
    const vertical = kind === "column";
    this.queue.add({
      kind: "line",
      id: `wall/${id}/sill`,
      point: pointAdd(p, vertical ? 0 : -0.5, vertical ? -0.5 : 0),
      end: pointAdd(p, vertical ? 0 : 0.5, vertical ? 0.5 : 0),
      color: "#486578",
      lineWidthSource: 2,
      floorY: p.y,
      layer: LAYERS.constructionBack,
      order: 0,
    });
  }
  rooms() {
    for (const room of cfg.map.rooms) {
      for (let x = room.x; x < room.x + room.width; x++)
        for (let y = room.y; y < room.y + room.height; y++)
          this.asset(`room/${room.id}/floor/${x}/${y}`, "floor/worn", { x, y });
      const floorColors: Record<string, string> = {
        office: "#d9cdb2",
        locker: "#b6c8ce",
        toilet: "#c9ded8",
        canteen: "#d9c6ac",
      };
      this.queue.add({
        kind: "room",
        id: `room/${room.id}/interior`,
        point: { x: room.x, y: room.y },
        width: room.width,
        height: room.height,
        color: floorColors[room.id] ?? "#ccd1c6",
        floorY: room.y,
        layer: LAYERS.markings,
        order: 10,
      });
      this.queue.add({
        kind: "text",
        id: `room/${room.id}/label`,
        point: { x: room.x + 0.16, y: room.y + 0.38 },
        text: room.label,
        color: "#ffffff",
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
        for (let i = 0; i < 2; i++) {
          furniture(`desk/${i}`, "desk", 0.9 + i * 1.8, 1.35);
          furniture(`monitor/${i}`, "monitor", 0.9 + i * 1.8, 1.35, 2);
          furniture(`chair/${i}`, "chair", 0.9 + i * 1.8, 2.12);
        }
      }
      if (room.id === "locker") {
        for (let i = 0; i < room.width; i++)
          furniture(`locker/${i}`, "locker", i + 0.5, 1.45);
        furniture("bench", "bench", 1.5, 2.25);
      }
      if (room.id === "toilet") {
        furniture("toilet", "toilet", 0.65, 1.35);
        furniture("sink", "sink", 1.4, 2.1);
      }
      if (room.id === "canteen") {
        furniture("table", "table", 1.5, 1.5);
        furniture("chair/0", "chair", 0.5, 1.55);
        furniture("chair/1", "chair", 2.5, 1.55);
        furniture("bench", "bench", 1.5, 2.28);
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
    const body = this.asset(
      `${base}/body`,
      this.game instanceof CampaignGame && this.game.usesPiesek
        ? "jack/piesek/body"
        : "jack/default/body",
      back,
      {
        direction: sample.bodyDirection,
        order: 10,
      },
    );
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
    if (w.task?.crate === null && w.task.dest.kind === "floor") {
      this.queue.add({
        kind: "outline",
        id: `${base}/move-target`,
        point: w.task.dest,
        width: 1,
        height: 1,
        color: "#60bbec",
        floorY: w.task.dest.y,
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
      angle: 0,
      liftSource: height * GRAPHICS.liftSource,
      order: 20,
      after,
    });
    // A 2.5D box has a fixed vertical face; rotating the bitmap tilts that face.
    // Orientation and collision of the load still belong to the simulation.
    const boxDependencies = [`${base}/pallet`, ...after];
    const pixel = (
      id: string,
      x: number,
      y: number,
      width: number,
      heightPx: number,
      color: string,
      order: number,
    ) =>
      this.queue.add({
        kind: "fill",
        cargoId: c.id,
        id: `${base}/${id}`,
        point: pointAdd(
          point,
          (x - 12) / 24,
          (y - 12 - height * GRAPHICS.liftSource) / 24,
        ),
        width: width / 24,
        height: heightPx / 24,
        color,
        floorY: point.y,
        layer: LAYERS.objects,
        order,
        after: boxDependencies,
      });
    if (c.mix) {
      const cartons = c.mix.flatMap((part) =>
        Array.from({ length: part.cartons }, () => part.color),
      );
      const cols = Math.ceil(Math.sqrt(cartons.length));
      const size = Math.floor(20 / cols);
      cartons.forEach((color, i) => {
        const x = 2 + (i % cols) * size,
          y = 2 + Math.floor(i / cols) * size;
        pixel(`carton/${i}/edge`, x, y, size, size, "#20384b", 30);
        pixel(
          `carton/${i}/face`,
          x + 1,
          y + 1,
          size - 2,
          size - 2,
          COLORS[color],
          31,
        );
        pixel(
          `carton/${i}/highlight`,
          x + 1,
          y + 1,
          size - 2,
          1,
          "#ffffff66",
          32,
        );
      });
    } else {
      this.asset(
        `${base}/box`,
        `cargo/box/${displayColor(c, g.round)}`,
        point,
        {
          angle: 0,
          liftSource: height * GRAPHICS.liftSource,
          order: 30,
          after: boxDependencies,
        },
      );
      if (remainingRounds(c, g.round)) {
        // Source rectangle of the existing label in the gray crate sprite.
        const label = pixel(
          "recipient-label",
          14,
          18,
          4,
          2,
          COLORS[destinationColor(c)],
          35,
        );
        label.after = [`${base}/box`];
      }
    }
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
        kind: "badge",
        id: `${base}/due`,
        point: pointAdd(
          point,
          -0.19,
          -0.15 - (height * GRAPHICS.liftSource) / GRAPHICS.sourceTile,
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
