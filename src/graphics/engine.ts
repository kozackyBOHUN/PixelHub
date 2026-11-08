import { MinHeap } from "../pathfinding.ts";
import type { Point } from "../config.ts";
import { Camera, GRAPHICS, LAYERS } from "./config.ts";
import type { Layer } from "./config.ts";
import type {
  AssetDefinition,
  AssetRegistry,
  AssetOverride,
  Rect,
} from "./assets.ts";
export type AssetImage = {
  image: CanvasImageSource;
  width: number;
  height: number;
};
export type ImageLoader = (path: string) => Promise<AssetImage>;
export const browserImageLoader: ImageLoader = (path) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    image.onerror = () => reject(Error(`Brak PNG: ${path}`));
    image.src = new URL(path, document.baseURI).href;
  });
type Resource = {
  definition: AssetDefinition;
  status: "loading" | "ready" | "placeholder";
  value?: AssetImage;
  reason?: string;
  pending: Promise<void>;
};
export class AssetStore {
  private resources = new Map<string, Resource>();
  loader: ImageLoader;
  constructor(loader: ImageLoader = browserImageLoader) {
    this.loader = loader;
  }
  ensure(def: AssetDefinition) {
    let entry = this.resources.get(def.id);
    if (entry?.definition === def) return entry;
    entry = { definition: def, status: "loading", pending: Promise.resolve() };
    const current = entry;
    this.resources.set(def.id, current);
    current.pending = this.loader(def.path)
      .then((value) => {
        const frames = Object.values(def.frames).flat();
        const width = Math.max(...frames.map((f) => f.rect.x + f.rect.width)),
          height = Math.max(...frames.map((f) => f.rect.y + f.rect.height));
        if (value.width < width || value.height < height)
          throw Error(
            `Nieprawidłowy atlas ${def.id}: wymagane co najmniej ${width}×${height}`,
          );
        current.value = value;
        current.status = "ready";
      })
      .catch((error) => {
        current.status = "placeholder";
        current.reason = String(error);
      });
    return current;
  }
  async ready(def: AssetDefinition) {
    await this.ensure(def).pending;
    return this.ensure(def);
  }
  diagnostics() {
    return [...this.resources.values()].map((r) => ({
      id: r.definition.id,
      status: r.status,
      reason: r.reason,
    }));
  }
  async installManifest(registry: AssetRegistry, url = "assets/manifest.json") {
    try {
      const response = await fetch(new URL(url, document.baseURI));
      if (!response.ok) return;
      const overrides = (await response.json()) as {
        version: number;
        assets: Record<string, AssetOverride>;
      };
      if (overrides.version !== 1)
        throw Error("Nieznana wersja manifestu grafik");
      for (const [id, patch] of Object.entries(overrides.assets))
        registry.override(id, patch);
    } catch (error) {
      this.manifestError = String(error);
    }
  }
  manifestError = "";
}
export type AssetCommand = {
  kind: "asset";
  id: string;
  assetId: string;
  point: Point;
  floorY: number;
  layer: Layer;
  order: number;
  direction?: number;
  frame?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
  liftSource?: number;
  alpha?: number;
  after?: string[];
  clip?: Rect;
  label?: string;
  mirror?: boolean;
  repeat?: { width: number; height: number };
  space?: "world" | "screen";
};
export type ShapeCommand = {
  kind: "line" | "text" | "outline";
  id: string;
  point: Point;
  end?: Point;
  text?: string;
  color: string;
  floorY: number;
  layer: Layer;
  order: number;
  width?: number;
  height?: number;
  after?: string[];
};
export type DrawCommand = AssetCommand | ShapeCommand;
export class RenderQueue {
  commands: DrawCommand[] = [];
  add(command: DrawCommand) {
    this.commands.push(command);
    return command;
  }
  asset(
    registry: AssetRegistry,
    id: string,
    assetId: string,
    point: Point,
    extra: Partial<
      Omit<AssetCommand, "kind" | "id" | "assetId" | "point">
    > = {},
  ) {
    const def = registry.get(assetId);
    const command: AssetCommand = {
      kind: "asset",
      id,
      assetId,
      point: { ...point },
      floorY: point.y,
      layer: def.renderLayer,
      order: 0,
      ...extra,
    };
    this.add(command);
    return command;
  }
  ordered() {
    const sorted = [...this.commands].sort(
      (a, b) =>
        a.layer - b.layer ||
        a.floorY - b.floorY ||
        a.order - b.order ||
        a.id.localeCompare(b.id),
    );
    const byId = new Map(sorted.map((c) => [c.id, c]));
    if (byId.size !== sorted.length)
      throw Error("Powielony identyfikator elementu wizualnego");
    const waiting = new Map<string, number>(),
      dependents = new Map<string, string[]>(),
      heap = new MinHeap<DrawCommand>(),
      rank = new Map(sorted.map((c, i) => [c.id, i]));
    for (const c of sorted) {
      const deps = [...new Set(c.after ?? [])].filter((id) => byId.has(id));
      waiting.set(c.id, deps.length);
      for (const id of deps) {
        const list = dependents.get(id) ?? [];
        list.push(c.id);
        dependents.set(id, list);
      }
      if (!deps.length) heap.push(c, rank.get(c.id)!);
    }
    const result: DrawCommand[] = [];
    for (let item; (item = heap.pop());) {
      const c = item.value;
      result.push(c);
      for (const id of dependents.get(c.id) ?? []) {
        const count = waiting.get(id)! - 1;
        waiting.set(id, count);
        if (!count) heap.push(byId.get(id)!, rank.get(id)!);
      }
    }
    if (result.length !== sorted.length)
      throw Error("Cykl zależności warstw renderowania");
    return result;
  }
  clear() {
    this.commands = [];
  }
}
export function localToScreen(
  command: AssetCommand,
  local: Point,
  registry: AssetRegistry,
  camera: Camera,
): Point {
  const def = registry.get(command.assetId),
    origin =
      command.space === "screen"
        ? command.point
        : camera.worldToScreen(command.point),
    scale = command.space === "screen" ? GRAPHICS.baseScale : camera.scale,
    angle = command.angle ?? 0,
    sx = scale * (command.scaleX ?? 1) * (command.mirror ? -1 : 1),
    sy = scale * (command.scaleY ?? 1),
    x = (local.x - def.anchorX) * sx,
    y = (local.y - def.anchorY) * sy;
  return {
    x: origin.x + Math.cos(angle) * x - Math.sin(angle) * y,
    y:
      origin.y -
      (command.liftSource ?? 0) * scale +
      Math.sin(angle) * x +
      Math.cos(angle) * y,
  };
}
export function commandBounds(
  command: AssetCommand,
  registry: AssetRegistry,
  camera: Camera,
) {
  const d = registry.get(command.assetId),
    width = command.repeat?.width ?? d.frameWidth,
    height = command.repeat?.height ?? d.frameHeight,
    points = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height },
    ].map((p) => localToScreen(command, p, registry, camera));
  return {
    x: Math.min(...points.map((p) => p.x)),
    y: Math.min(...points.map((p) => p.y)),
    width:
      Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    height:
      Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  };
}
export class AssetPainter {
  registry: AssetRegistry;
  store: AssetStore;
  camera: Camera;
  constructor(registry: AssetRegistry, store: AssetStore, camera: Camera) {
    this.registry = registry;
    this.store = store;
    this.camera = camera;
  }
  draw(ctx: CanvasRenderingContext2D, command: DrawCommand) {
    if (command.kind !== "asset") {
      const p = this.camera.worldToScreen(command.point);
      ctx.save();
      ctx.strokeStyle = command.color;
      ctx.fillStyle = command.color;
      ctx.lineWidth = 1;
      if (command.kind === "text") {
        ctx.font = `${Math.max(8, 6 * this.camera.scale)}px monospace`;
        ctx.fillText(command.text ?? "", p.x, p.y);
      } else if (command.kind === "line" && command.end) {
        const end = this.camera.worldToScreen(command.end);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else
        ctx.strokeRect(
          p.x,
          p.y,
          (command.width ?? 1) * this.camera.tile,
          (command.height ?? 1) * this.camera.tile,
        );
      ctx.restore();
      return;
    }
    const def = this.registry.get(command.assetId),
      frame = this.registry.frame(
        command.assetId,
        command.direction,
        command.frame,
      ),
      entry = this.store.ensure(def),
      p =
        command.space === "screen"
          ? command.point
          : this.camera.worldToScreen(command.point),
      scale =
        command.space === "screen" ? GRAPHICS.baseScale : this.camera.scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = command.alpha ?? 1;
    ctx.translate(p.x, p.y - (command.liftSource ?? 0) * scale);
    ctx.rotate(command.angle ?? 0);
    ctx.scale(
      scale * (command.scaleX ?? 1) * (command.mirror ? -1 : 1),
      scale * (command.scaleY ?? 1),
    );
    ctx.translate(-def.anchorX, -def.anchorY);
    if (command.clip) {
      ctx.beginPath();
      ctx.rect(
        command.clip.x,
        command.clip.y,
        command.clip.width,
        command.clip.height,
      );
      ctx.clip();
    }
    if (command.repeat) {
      const { width, height } = command.repeat;
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();
      if (entry.status === "ready" && entry.value) {
        for (let y = 0; y < height; y += def.frameHeight)
          for (let x = 0; x < width; x += def.frameWidth)
            ctx.drawImage(
              entry.value.image,
              frame.rect.x,
              frame.rect.y,
              frame.rect.width,
              frame.rect.height,
              x,
              y,
              def.frameWidth,
              def.frameHeight,
            );
      } else {
        ctx.fillStyle = def.placeholder.color;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
      return;
    }
    if (entry.status === "ready" && entry.value)
      ctx.drawImage(
        entry.value.image,
        frame.rect.x,
        frame.rect.y,
        frame.rect.width,
        frame.rect.height,
        0,
        0,
        def.frameWidth,
        def.frameHeight,
      );
    else this.placeholder(ctx, def, command);
    ctx.restore();
  }
  placeholder(
    c: CanvasRenderingContext2D,
    d: AssetDefinition,
    command: AssetCommand,
  ) {
    const w = d.frameWidth,
      h = d.frameHeight,
      k = d.placeholder.kind,
      color = d.placeholder.color;
    c.fillStyle = color;
    if (k === "shadow") {
      c.fillRect(3, 3, w - 6, h - 6);
      return;
    }
    if (k === "worker") {
      const stride = command.frame ?? 0,
        step = d.id.includes("/idle") ? 0 : [0, 1, 0, -1][stride % 4];
      c.fillStyle = "#3d5968";
      c.fillRect(7, 16 + step, 4, 5);
      c.fillRect(13, 16 - step, 4, 5);
      c.fillStyle = color;
      c.fillRect(6, 7, 12, 10);
      c.fillStyle = "#d4af90";
      c.fillRect(9, 2, 8, 6);
      c.fillStyle = "#608899";
      c.fillRect(7, 1, 11, 3);
      const sockets = this.registry.frame(
        d.id,
        command.direction,
        command.frame,
      ).sockets!;
      c.fillStyle = "#dbb698";
      for (const p of [sockets.leftHandSocket, sockets.rightHandSocket])
        c.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      return;
    }
    if (k === "handle") {
      c.fillRect(0, 3, 14, 2);
      c.fillStyle = "#4a6269";
      c.fillRect(13, 1, 2, 6);
      return;
    }
    if (k === "jack") {
      const angle = -Math.PI / 2 + ((command.direction ?? 0) * Math.PI) / 8;
      c.save();
      c.translate(12, 12);
      c.rotate(angle);
      c.fillRect(-8, -6, 16, 3);
      c.fillRect(-8, 3, 16, 3);
      c.fillRect(5, -6, 3, 12);
      c.fillStyle = "#4a6066";
      c.fillRect(-6, -7, 3, 2);
      c.fillRect(-6, 5, 3, 2);
      c.restore();
      return;
    }
    if (k === "box") {
      c.fillStyle = "#586a70";
      c.fillRect(3, 2, 18, 18);
      c.fillStyle = color;
      c.fillRect(4, 3, 16, 14);
      c.fillStyle = "#e9dfc0";
      c.fillRect(11, 3, 2, 14);
      c.fillStyle = "#647880";
      c.fillRect(4, 17, 16, 3);
      return;
    }
    if (k === "pallet") {
      c.fillRect(2, 17, 20, 4);
      c.fillStyle = "#d3bb8b";
      for (let x = 3; x < 22; x += 6) c.fillRect(x, 18, 3, 2);
      return;
    }
    if (k === "tile") {
      if (d.id === "floor/marking") {
        for (let y = 1; y < 24; y += 6) c.fillRect(1, y, 3, 3);
        return;
      }
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#9daeb8";
      c.lineWidth = 0.5;
      c.strokeRect(0.25, 0.25, w - 0.5, h - 0.5);
      if (d.id === "floor/marking") {
        c.clearRect(1, 1, 22, 22);
        c.fillStyle = color;
        for (let y = 1; y < 24; y += 6) c.fillRect(1, y, 3, 3);
      }
      return;
    }
    if (k === "wall") {
      c.fillRect(0, 8, w, 19);
      c.fillStyle = "#b3c3c6";
      c.fillRect(0, 6, w, 4);
      c.fillStyle = "#536c7d";
      c.fillRect(0, 24, w, 3);
      return;
    }
    if (k === "rack") {
      if (d.id.endsWith("/segment")) {
        c.fillStyle = "#55718c";
        c.fillRect(0, 9, 24, 3);
        c.fillRect(0, 25, 24, 3);
      } else if (d.id.endsWith("/post")) c.fillRect(2, 4, 4, 36);
      else c.fillRect(0, 1, w, h - 2);
      return;
    }
    if (k === "wheel") {
      c.fillRect(1, 1, w - 2, h - 2);
      c.fillStyle = "#435763";
      c.fillRect(2, 2, w - 4, h - 4);
      return;
    }
    if (k === "vehicle") {
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#879b9c";
      c.lineWidth = 1;
      c.strokeRect(0.5, 0.5, w - 1, h - 1);
      if (d.id.endsWith("/cab")) {
        c.fillStyle = "#4d7489";
        c.fillRect(5, 7, 14, 12);
      }
      return;
    }
    if (k === "panel") {
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#b9c8b9";
      c.strokeRect(0.5, 0.5, w - 1, h - 1);
      return;
    }
    if (k === "icon") {
      if (d.id.endsWith("/mix")) {
        for (let i = 0; i < 4; i++) {
          c.fillStyle = ["#ca7774", "#749fc4", "#89b78d", "#ddc66a"][i];
          c.fillRect((i % 2) * 4, Math.floor(i / 2) * 4, 4, 4);
        }
        return;
      }
      if (d.id.endsWith("/priority"))
        c.fillStyle = ["#75a06e", "#d3b75e", "#c27772"][
          (command.frame ?? 0) % 3
        ];
      c.fillRect(1, 1, w - 2, h - 2);
      c.fillStyle = "#eceddd";
      c.fillRect(w / 2 - 1, 2, 2, h - 4);
      return;
    }
    c.fillRect(3, Math.max(2, h - w + 3), w - 6, Math.min(w, h) - 5);
    c.fillStyle = "#d8ddcb";
    c.fillRect(4, Math.max(3, h - w + 4), w - 8, 3);
  }
  nineSlice(ctx: CanvasRenderingContext2D, assetId: string, rect: Rect) {
    const d = this.registry.get(assetId),
      s = d.nineSlice;
    if (!s) throw Error("Zasób bez nine-slice");
    const frame = this.registry.frame(assetId),
      entry = this.store.ensure(d),
      scale = GRAPHICS.baseScale;
    if (
      rect.width < (s.left + s.right) * scale ||
      rect.height < (s.top + s.bottom) * scale
    )
      throw Error("Panel mniejszy od narożników");
    const xs = [0, s.left, d.frameWidth - s.right, d.frameWidth],
      ys = [0, s.top, d.frameHeight - s.bottom, d.frameHeight],
      dx = [
        rect.x,
        rect.x + s.left * scale,
        rect.x + rect.width - s.right * scale,
        rect.x + rect.width,
      ],
      dy = [
        rect.y,
        rect.y + s.top * scale,
        rect.y + rect.height - s.bottom * scale,
        rect.y + rect.height,
      ];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        if (entry.value && entry.status === "ready")
          ctx.drawImage(
            entry.value.image,
            frame.rect.x + xs[x],
            frame.rect.y + ys[y],
            xs[x + 1] - xs[x],
            ys[y + 1] - ys[y],
            dx[x],
            dy[y],
            dx[x + 1] - dx[x],
            dy[y + 1] - dy[y],
          );
        else {
          ctx.fillStyle = x === 1 && y === 1 ? d.placeholder.color : "#76909c";
          ctx.fillRect(dx[x], dy[y], dx[x + 1] - dx[x], dy[y + 1] - dy[y]);
        }
      }
    ctx.restore();
  }
  diagnostics(ctx: CanvasRenderingContext2D, commands: DrawCommand[]) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = "9px monospace";
    for (const command of commands) {
      if (command.kind !== "asset") continue;
      const d = this.registry.get(command.assetId),
        p =
          command.space === "screen"
            ? command.point
            : this.camera.worldToScreen(command.point),
        b = commandBounds(command, this.registry, this.camera);
      ctx.strokeStyle = "#bd5eb4aa";
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.fillStyle = "#c3494a";
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      const f = this.registry.frame(
        command.assetId,
        command.direction,
        command.frame,
      );
      if (f.sockets) {
        ctx.fillStyle = "#4be0d2";
        for (const s of Object.values(f.sockets)) {
          const q = localToScreen(command, s, this.registry, this.camera);
          ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
        }
      }
      ctx.fillStyle = "#374b60";
      if (d.placeholder.kind === "worker")
        ctx.fillText(command.assetId, p.x + 5, p.y + 10);
    }
    ctx.restore();
  }
}
