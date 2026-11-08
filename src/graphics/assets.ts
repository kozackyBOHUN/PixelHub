import type { Point } from "../config.ts";
import { GRAPHICS, LAYERS, VEHICLE_GRAPHICS } from "./config.ts";
import type { Layer } from "./config.ts";
export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type WorkerState = "idle" | "walk" | "pull" | "push";
export type Rect = { x: number; y: number; width: number; height: number };
export type Sockets = {
  leftHandSocket: Point;
  rightHandSocket: Point;
  gripSocket: Point;
};
export type Frame = { rect: Rect; sockets?: Sockets };
export type Placeholder = {
  kind:
    | "tile"
    | "worker"
    | "jack"
    | "handle"
    | "box"
    | "pallet"
    | "wall"
    | "rack"
    | "furniture"
    | "vehicle"
    | "wheel"
    | "shadow"
    | "icon"
    | "panel"
    | "machine";
  color: string;
  accent?: string;
};
export type AssetDefinition = {
  id: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
  anchorX: number;
  anchorY: number;
  directions: readonly string[];
  framesPerDirection: number;
  animationMode: "loop" | "once" | "static";
  renderLayer: Layer;
  footprint: { width: number; height: number; collision: "metadata-only" };
  placeholder: Placeholder;
  frames: Record<string, Frame[]>;
  attachmentPoints?: Record<string, Point>;
  parts?: { layer: Layer; rect: Rect }[];
  nineSlice?: { left: number; top: number; right: number; bottom: number };
};
export type AssetOverride = Partial<
  Pick<
    AssetDefinition,
    | "path"
    | "frameWidth"
    | "frameHeight"
    | "anchorX"
    | "anchorY"
    | "frames"
    | "parts"
    | "placeholder"
    | "nineSlice"
    | "attachmentPoints"
  >
>;
export const angleDirection = (angle: number, count = 8) =>
  ((Math.round((angle + Math.PI / 2) / ((2 * Math.PI) / count)) % count) +
    count) %
  count;
export class AssetRegistry {
  private definitions = new Map<string, AssetDefinition>();
  register(def: AssetDefinition) {
    validateAsset(def);
    this.definitions.set(def.id, structuredClone(def));
  }
  get(id: string): AssetDefinition {
    const direct = this.definitions.get(id);
    if (direct) return direct;
    const last = id.lastIndexOf("/"),
      base = this.definitions.get(id.slice(0, last));
    if (base && base.directions.includes(id.slice(last + 1))) return base;
    throw Error(`Niezarejestrowany zasób ${id}`);
  }
  has(id: string) {
    try {
      this.get(id);
      return true;
    } catch {
      return false;
    }
  }
  all() {
    return [...this.definitions.values()];
  }
  override(id: string, patch: AssetOverride) {
    const previous = this.get(id);
    this.register({ ...previous, ...structuredClone(patch), id: previous.id });
  }
  frame(id: string, direction = 0, index = 0): Frame {
    const def = this.get(id),
      suffix = id.slice(id.lastIndexOf("/") + 1),
      named = def.directions.indexOf(suffix);
    const d =
      def.directions[
        named >= 0
          ? named
          : ((direction % def.directions.length) + def.directions.length) %
            def.directions.length
      ];
    const frame =
      def.animationMode === "loop"
        ? ((Math.floor(index) % def.framesPerDirection) +
            def.framesPerDirection) %
          def.framesPerDirection
        : Math.max(0, Math.min(def.framesPerDirection - 1, Math.floor(index)));
    return def.frames[d][frame];
  }
}
export function validateAsset(def: AssetDefinition) {
  if (
    !def.id ||
    !def.path ||
    !Number.isInteger(def.frameWidth) ||
    !Number.isInteger(def.frameHeight) ||
    def.frameWidth <= 0 ||
    def.frameHeight <= 0 ||
    !def.directions.length ||
    def.framesPerDirection < 1 ||
    def.anchorX < 0 ||
    def.anchorY < 0 ||
    def.anchorX > def.frameWidth ||
    def.anchorY > def.frameHeight
  )
    throw Error(`Nieprawidłowy zasób ${def.id}`);
  for (const direction of def.directions) {
    const frames = def.frames[direction];
    if (frames?.length !== def.framesPerDirection)
      throw Error(`Liczba klatek ${def.id}/${direction}`);
    for (const f of frames) {
      if (
        f.rect.width !== def.frameWidth ||
        f.rect.height !== def.frameHeight ||
        ![f.rect.x, f.rect.y].every((x) => Number.isInteger(x) && x >= 0)
      )
        throw Error(`Prostokąt klatki ${def.id}`);
      if (f.sockets)
        for (const p of Object.values(f.sockets))
          if (
            p.x < 0 ||
            p.y < 0 ||
            p.x > def.frameWidth ||
            p.y > def.frameHeight
          )
            throw Error(`Punkt dłoni ${def.id}`);
    }
  }
}
function asset(
  id: string,
  w: number,
  h: number,
  anchorX: number,
  anchorY: number,
  kind: Placeholder["kind"],
  color: string,
  layer: Layer = LAYERS.objects,
  directions: readonly string[] = ["default"],
  count = 1,
): AssetDefinition {
  const frames: AssetDefinition["frames"] = {};
  for (const [d, direction] of directions.entries())
    frames[direction] = Array.from({ length: count }, (_, i) => ({
      rect: {
        x: i * (w + GRAPHICS.atlasGutter),
        y: d * (h + GRAPHICS.atlasGutter),
        width: w,
        height: h,
      },
    }));
  const directories: Record<string, string> = {
    worker: "workers",
    jack: "pallet-jacks",
    cargo: "cargo",
    vehicle: "vehicles",
    floor: "floors",
    wall: "walls",
    rack: "racks",
    furniture: "furniture",
    shadow: "effects/shadows",
    machine: "equipment",
    ui: "ui",
  };
  const [category, ...parts] = id.split("/");
  return {
    id,
    path: `assets/${directories[category] ?? category}/${parts.join("/")}.png`,
    frameWidth: w,
    frameHeight: h,
    anchorX,
    anchorY,
    directions,
    framesPerDirection: count,
    animationMode: count > 1 ? "loop" : "static",
    renderLayer: layer,
    footprint: { width: w / 24, height: 1, collision: "metadata-only" },
    placeholder: { kind, color },
    frames,
  };
}
export function createRegistry() {
  const r = new AssetRegistry();
  r.register(
    asset("exterior/base", 24, 24, 0, 0, "tile", "#b9cbd0", LAYERS.exterior),
  );
  for (const state of ["idle", "walk", "pull", "push"] as const) {
    const a = asset(
      `worker/default/${state}`,
      24,
      24,
      12,
      21,
      "worker",
      "#dd9b50",
      LAYERS.objects,
      DIRECTIONS,
      state === "idle" ? 2 : 4,
    );
    a.footprint = { width: 0.68, height: 0.9, collision: "metadata-only" };
    for (const [d, direction] of DIRECTIONS.entries())
      for (const [f, frame] of a.frames[direction].entries()) {
        const angle = -Math.PI / 2 + (d * Math.PI) / 4,
          sign = state === "push" ? 1 : -1,
          sway = state === "idle" ? 0 : [0, 1, 0, -1][f];
        const grip = {
          x: 12 + Math.cos(angle) * 5 * sign + sway * 0.2,
          y: 13 + Math.sin(angle) * 3 * sign,
        };
        frame.sockets = {
          gripSocket: grip,
          leftHandSocket: { x: grip.x - 2, y: grip.y },
          rightHandSocket: { x: grip.x + 2, y: grip.y },
        };
      }
    r.register(a);
  }
  r.register({
    ...asset(
      "jack/default/body",
      24,
      24,
      12,
      12,
      "jack",
      "#d5ae42",
      LAYERS.objects,
      Array.from({ length: 16 }, (_, i) => String(i)),
    ),
    footprint: { width: 0.72, height: 0.56, collision: "metadata-only" },
  });
  r.register({
    ...asset("jack/default/handle", 16, 8, 0, 4, "handle", "#b38a39"),
    attachmentPoints: { start: { x: 0, y: 4 }, end: { x: 14, y: 4 } },
  });
  const colors = {
    gray: "#99aaa9",
    red: "#cc7774",
    blue: "#749fc4",
    yellow: "#ddc66a",
    green: "#89b78d",
    purple: "#aa8cc0",
    orange: "#d6a16e",
    teal: "#73b8b1",
    pink: "#d296b3",
  };
  for (const [color, hex] of Object.entries(colors))
    r.register(asset(`cargo/box/${color}`, 24, 24, 12, 12, "box", hex));
  r.register(asset("cargo/pallet", 24, 24, 12, 12, "pallet", "#a88a60"));
  for (const [kind, color] of Object.entries({
    mix: "#c09b83",
    chilled: "#87baca",
    frozen: "#8e9fc7",
    priority: "#75a06e",
    damaged: "#b96c68",
    return: "#b092b2",
  }))
    r.register(
      asset(
        `cargo/overlay/${kind}`,
        8,
        8,
        4,
        4,
        "icon",
        color,
        LAYERS.effects,
        ["default"],
        kind === "priority" ? 3 : 1,
      ),
    );
  r.register({ ...r.get("cargo/overlay/priority"), animationMode: "static" });
  for (const [id, color] of Object.entries({
    base: "#c5d0d5",
    variant_01: "#c8d2d7",
    variant_02: "#c1cdd3",
    ramp: "#b9b58a",
    loading_zone: "#c1c6b2",
    marking: "#d6b956",
    worn: "#b8c5cc",
  }))
    r.register(
      asset(
        `floor/${id}`,
        24,
        24,
        0,
        0,
        "tile",
        color,
        id === "marking" ? LAYERS.markings : LAYERS.floor,
      ),
    );
  r.register({ ...r.get("floor/base"), id: "floor/warehouse/base" });
  for (const id of ["segment", "corner", "end", "gate", "column"]) {
    const a = asset(
      `wall/${id}`,
      24,
      36,
      12,
      24,
      "wall",
      "#708894",
      LAYERS.constructionBack,
    );
    a.parts = [
      {
        layer: LAYERS.constructionBack,
        rect: { x: 0, y: 0, width: 24, height: 24 },
      },
      {
        layer: LAYERS.constructionFront,
        rect: { x: 0, y: 24, width: 24, height: 12 },
      },
    ];
    r.register(a);
  }
  for (const [id, w, h, ax, ay] of [
    ["desk", 24, 24, 12, 12],
    ["monitor", 12, 12, 6, 6],
    ["chair", 24, 24, 12, 12],
    ["locker", 24, 32, 12, 20],
    ["bench", 24, 24, 12, 12],
    ["toilet", 24, 24, 12, 12],
    ["sink", 24, 24, 12, 12],
    ["table", 24, 24, 12, 12],
  ] as const)
    r.register(asset(`furniture/${id}`, w, h, ax, ay, "furniture", "#a6b8b8"));
  for (const [id, w, h, ax, ay] of [
    ["segment", 24, 40, 12, 28],
    ["post", 8, 40, 4, 28],
    ["beam", 24, 8, 12, 4],
    ["shelf", 24, 8, 12, 4],
  ] as const)
    r.register(
      asset(
        `rack/standard/${id}`,
        w,
        h,
        ax,
        ay,
        "rack",
        id === "post" ? "#385273" : "#cc8e53",
      ),
    );
  for (const [id, w, h, ax, ay] of [
    [
      "cab",
      VEHICLE_GRAPHICS.cabSourceWidth,
      VEHICLE_GRAPHICS.cargoSourceHeight,
      0,
      0,
    ],
    [
      "cargo_segment",
      VEHICLE_GRAPHICS.segmentSourceWidth,
      VEHICLE_GRAPHICS.cargoSourceHeight,
      0,
      0,
    ],
    [
      "end",
      VEHICLE_GRAPHICS.endSourceWidth,
      VEHICLE_GRAPHICS.cargoSourceHeight,
      0,
      0,
    ],
    [
      "wheel",
      VEHICLE_GRAPHICS.wheelSourceSize,
      VEHICLE_GRAPHICS.wheelSourceSize,
      4,
      4,
    ],
    ["slot", 24, 24, 0, 0],
  ] as const)
    r.register(
      asset(
        `vehicle/default/${id}`,
        w,
        h,
        ax,
        ay,
        id === "wheel" ? "wheel" : "vehicle",
        id === "cab" ? "#8caeb1" : "#d1d7cc",
        id === "cab" || id === "wheel"
          ? LAYERS.objects
          : LAYERS.constructionBack,
      ),
    );
  for (const id of ["cab", "cargo_segment", "end", "slot"]) {
    const d = r.get(`vehicle/default/${id}`);
    r.register({
      ...d,
      footprint: {
        width: d.frameWidth / GRAPHICS.sourceTile,
        height: d.frameHeight / GRAPHICS.sourceTile,
        collision: "metadata-only",
      },
    });
  }
  for (const type of ["worker", "jack", "cargo", "vehicle", "furniture"])
    r.register(
      asset(
        `shadow/${type}`,
        24,
        12,
        12,
        6,
        "shadow",
        "#233642",
        LAYERS.shadows,
      ),
    );
  for (const id of ["sorter", "service"])
    r.register(asset(`machine/${id}`, 24, 24, 12, 12, "machine", "#aeb597"));
  for (const [id, size] of [
    ["small", 8],
    ["standard", 16],
    ["cmr", 16],
    ["decoration", 24],
  ] as const)
    r.register(
      asset(
        `ui/icon/${id}`,
        size,
        size,
        size / 2,
        size / 2,
        "icon",
        "#d3bb76",
        LAYERS.ui,
      ),
    );
  const panel = asset("ui/panel", 24, 24, 0, 0, "panel", "#243d4c", LAYERS.ui);
  panel.nineSlice = { left: 8, top: 8, right: 8, bottom: 8 };
  r.register(panel);
  return r;
}
