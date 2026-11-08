import type { Game, Crate } from "./simulation.ts";
import { locationPoint as logicalLocationPoint } from "./simulation.ts";
import type { Point } from "./config.ts";
import { geometryFree, HITCH_OFFSET, DRAWBAR_LENGTH } from "./pathfinding.ts";
import {
  Camera,
  GRAPHICS,
  LAYERS,
  clientToCanvas,
  tileCenter,
} from "./graphics/config.ts";
import { createRegistry } from "./graphics/assets.ts";
import type { AssetRegistry } from "./graphics/assets.ts";
import {
  AssetPainter,
  AssetStore,
  RenderQueue,
  commandBounds,
  localToScreen,
} from "./graphics/engine.ts";
import type { AssetCommand, DrawCommand } from "./graphics/engine.ts";
import { SceneBuilder, composeRack, composeVehicle } from "./graphics/scene.ts";
// Compatibility helpers use an explicit camera; the live game uses its Renderer camera.
export const TILE = GRAPHICS.baseTile;
export const defaultCamera = new Camera();
export const gridToScreen = (p: Point, camera = defaultCamera) =>
  camera.worldToScreen(p);
export const screenToGrid = (p: Point, camera = defaultCamera) =>
  camera.screenToGrid(p);
export const locationPoint = logicalLocationPoint;
export const slotPoint = (
  kind: "inbound" | "outbound",
  lane: number,
  depth: number,
  bay = 0,
) => logicalLocationPoint({ kind, lane, depth, bay })!;
export const workerVisual = (game: Game) => game.transportGeometry;
export class Renderer {
  debug = false;
  canvas: HTMLCanvasElement;
  surface: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  registry: AssetRegistry;
  assets: AssetStore;
  painter: AssetPainter;
  scene: SceneBuilder;
  lastCommands: DrawCommand[] = [];
  constructor(
    canvas: HTMLCanvasElement,
    options: {
      camera?: Camera;
      registry?: AssetRegistry;
      assets?: AssetStore;
      loadManifest?: boolean;
    } = {},
  ) {
    this.canvas = canvas;
    this.surface = document.createElement("canvas");
    this.ctx = this.surface.getContext("2d")!;
    this.camera = options.camera ?? new Camera();
    this.registry = options.registry ?? createRegistry();
    this.assets = options.assets ?? new AssetStore();
    this.painter = new AssetPainter(this.registry, this.assets, this.camera);
    this.scene = new SceneBuilder(this.registry);
    this.surface.width = this.camera.width;
    this.surface.height = this.camera.height;
    this.ctx.imageSmoothingEnabled = false;
    if (options.loadManifest !== false)
      void this.assets.installManifest(this.registry);
  }
  point(event: { clientX: number; clientY: number }) {
    return clientToCanvas(
      { x: event.clientX, y: event.clientY },
      this.canvas.getBoundingClientRect(),
      this.canvas,
    );
  }
  gridToScreen(p: Point) {
    return this.camera.worldToScreen(p);
  }
  screenToGrid(p: Point) {
    return this.camera.screenToGrid(p);
  }
  hitWorker(point: Point, index: number) {
    const c = this.lastCommands.find((c) => c.id === `rig/${index}/worker`);
    if (!c || c.kind !== "asset") return false;
    const b = commandBounds(c, this.registry, this.camera);
    return (
      point.x >= b.x &&
      point.x <= b.x + b.width &&
      point.y >= b.y &&
      point.y <= b.y + b.height
    );
  }
  hitCargo(point: Point) {
    for (let i = this.lastCommands.length - 1; i >= 0; i--) {
      const c = this.lastCommands[i];
      if (c.kind !== "asset" || !c.assetId.startsWith("cargo/box/")) continue;
      const b = commandBounds(c, this.registry, this.camera);
      if (
        point.x >= b.x &&
        point.x <= b.x + b.width &&
        point.y >= b.y &&
        point.y <= b.y + b.height
      )
        return c.id.slice("cargo/".length, -"/box".length);
    }
    return null;
  }
  crate(c: Crate, p: Point, angle = 0, height = 0) {
    this.scene.cargo(c, p, angle, height);
  }
  draw(game: Game) {
    this.camera.frame(this.scene.bounds(game));
    if (
      this.surface.width !== this.camera.width ||
      this.surface.height !== this.camera.height
    ) {
      this.surface.width = this.camera.width;
      this.surface.height = this.camera.height;
      this.ctx.imageSmoothingEnabled = false;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.surface.width, this.surface.height);
    ctx.fillStyle = this.registry.get("exterior/base").placeholder.color;
    ctx.fillRect(0, 0, this.surface.width, this.surface.height);
    const queue = this.scene.build(game, (c, p, a, h) =>
      this.crate(c, p, a, h),
    );
    this.lastCommands = queue.ordered();
    for (const command of this.lastCommands) this.painter.draw(ctx, command);
    if (this.debug) {
      this.painter.diagnostics(ctx, this.lastCommands);
      this.logicalDiagnostics(game);
    }
  }
  logicalDiagnostics(game: Game) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";
    const workers =
      "workers" in game ? (game as Game & { workers: Game[] }).workers : [game];
    for (const worker of workers) {
      const cells = new Map<string, Point>();
      geometryFree(
        worker.transportGeometry,
        (p) => {
          cells.set(`${p.x},${p.y}`, p);
          return true;
        },
        !!worker.carried,
      );
      ctx.strokeStyle = "#d76c53";
      for (const p of cells.values()) {
        const s = this.camera.worldToScreen(p);
        ctx.strokeRect(s.x, s.y, this.camera.tile, this.camera.tile);
      }
    }
    for (const connection of this.scene.connections) {
      const p = this.camera.worldToScreen(connection.hitch),
        q = this.camera.worldToScreen(connection.grip);
      ctx.strokeStyle = "#1688aa";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.fillStyle = "#1688aa";
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    const b = this.camera.bounds;
    for (let x = Math.ceil(b.minX); x < b.maxX; x++)
      for (let y = Math.ceil(b.minY); y < b.maxY; y++) {
        const p = this.camera.worldToScreen(tileCenter({ x, y }));
        ctx.fillStyle = "#4c697a";
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    ctx.restore();
    this.painter.nineSlice(ctx, "ui/panel", {
      x: 8,
      y: 8,
      width: Math.min(640, this.surface.width - 16),
      height: 56,
    });
    ctx.fillStyle = "#f2efde";
    ctx.font = "12px monospace";
    ctx.fillText(
      "Kotwice: czerwone · dłonie: turkus · sprite: różowy · obrys logiczny: pomarańczowy",
      20,
      30,
    );
    ctx.fillText(
      `Siatka ${GRAPHICS.sourceTile} px źródła / ${GRAPHICS.baseTile} px × kamera · HITCH ${HITCH_OFFSET} · dyszel ${DRAWBAR_LENGTH} pola`,
      20,
      48,
    );
  }
  diagnostics() {
    return {
      scale: GRAPHICS,
      zoom: this.camera.zoom,
      pan: { ...this.camera.pan },
      bounds: { ...this.camera.bounds },
      resources: this.assets.diagnostics(),
      manifestError: this.assets.manifestError,
      commands: this.lastCommands.map((c) =>
        c.kind === "asset"
          ? {
              id: c.id,
              assetId: c.assetId,
              layer: c.layer,
              floorY: c.floorY,
              frame: c.frame ?? 0,
              direction: c.direction ?? 0,
              anchor: this.camera.worldToScreen(c.point),
              rectangle: commandBounds(c, this.registry, this.camera),
            }
          : { id: c.id, layer: c.layer },
      ),
      connections: this.scene.connections.map((c) => {
        const frame = this.registry.frame(
            c.actor.assetId,
            c.actor.direction,
            c.actor.frame,
          ),
          grip = localToScreen(
            c.actor,
            frame.sockets!.gripSocket,
            this.registry,
            this.camera,
          ),
          end = localToScreen(
            c.handle,
            this.registry.get(c.handle.assetId).attachmentPoints!.end,
            this.registry,
            this.camera,
          );
        return {
          worker: c.worker,
          state: c.animation.state,
          frame: c.animation.frame,
          direction: c.animation.direction,
          distance: c.animation.distance,
          gapSource:
            Math.hypot(grip.x - end.x, grip.y - end.y) / this.camera.scale,
        };
      }),
    };
  }
  preview(canvas: HTMLCanvasElement, id: string, direction = 0, frame = 0) {
    const camera = new Camera();
    camera.frame({ minX: -1, minY: -1, maxX: 6, maxY: 4 });
    const q = new RenderQueue();
    if (id === "demo/rack")
      composeRack(q, this.registry, "preview-rack", { x: 0, y: 1 }, 4);
    else if (id.startsWith("demo/vehicle")) {
      const capacity = Number(id.slice("demo/vehicle".length));
      composeVehicle(
        q,
        this.registry,
        {
          id: "PREVIEW",
          kind: "outbound",
          bay: 0,
          capacity,
          state: "docked",
          timer: 0,
        },
        0,
      );
      camera.frame({ minX: -1, minY: 0, maxX: 8, maxY: 5 });
    } else {
      const d = this.registry.get(id);
      q.asset(
        this.registry,
        "preview",
        id,
        { x: 2, y: 2 },
        {
          direction: direction % d.directions.length,
          frame: frame % d.framesPerDirection,
        },
      );
    }
    canvas.width = camera.width;
    canvas.height = camera.height;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#d3dce0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const painter = new AssetPainter(this.registry, this.assets, camera);
    const ordered = q.ordered();
    for (const c of ordered) painter.draw(ctx, c);
    painter.diagnostics(ctx, ordered);
  }
}
