import cfg, { room, dock, tail } from "./config.ts";
import type { Point, Pose } from "./config.ts";
import type { Game, Crate, Location } from "./simulation.ts";
import { edgeCost } from "./pathfinding.ts";
export const TILE = 49,
  OX = 210,
  OY = 205;
export const gridToScreen = (p: Point) => ({
  x: OX + p.x * TILE,
  y: OY + p.y * TILE,
});
export const screenToGrid = (p: Point) => ({
  x: Math.floor((p.x - OX) / TILE),
  y: Math.floor((p.y - OY) / TILE),
});
export function slotPoint(
  kind: "inbound" | "outbound",
  lane: number,
  depth: number,
) {
  return { x: kind === "inbound" ? -1 - depth : 20 + depth, y: 2 + lane };
}
export function locationPoint(loc: Location) {
  if (loc.kind === "floor") return loc;
  if ("lane" in loc) return slotPoint(loc.kind, loc.lane, loc.depth);
  return null;
}
export function workerVisual(g: Game) {
  let head: Point = g.pose,
    back: Point = tail(g.pose);
  const t = g.task;
  if (t && t.route.length > 1) {
    const a = t.route[0],
      b = t.route[1],
      f = Math.min(
        1,
        t.elapsed /
          (edgeCost(a, b) *
            (g.carried
              ? cfg.worker.loadedSecondsPerCardinalTile
              : cfg.worker.emptySecondsPerCardinalTile)),
      );
    head = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    const at = tail(a),
      bt = tail(b);
    if (a.d !== b.d) {
      const aa = Math.atan2(at.y - a.y, at.x - a.x),
        bb = Math.atan2(bt.y - b.y, bt.x - b.x);
      const delta = Math.atan2(Math.sin(bb - aa), Math.cos(bb - aa));
      const radius =
        Math.hypot(at.x - a.x, at.y - a.y) +
        (Math.hypot(bt.x - b.x, bt.y - b.y) -
          Math.hypot(at.x - a.x, at.y - a.y)) *
          f;
      back = {
        x: head.x + Math.cos(aa + delta * f) * radius,
        y: head.y + Math.sin(aa + delta * f) * radius,
      };
    } else back = { x: at.x + (bt.x - at.x) * f, y: at.y + (bt.y - at.y) * f };
  }
  return { head, back };
}
export class Renderer {
  debug = false;
  ctx: CanvasRenderingContext2D;
  surface: HTMLCanvasElement;
  canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.surface = document.createElement("canvas");
    this.surface.width = 1400;
    this.surface.height = 650;
    this.ctx = this.surface.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
  }
  point(event: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) * this.canvas.width) / r.width,
      y: ((event.clientY - r.top) * this.canvas.height) / r.height,
    };
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x, y, w, h);
  }
  text(s: string, x: number, y: number, color = "#435b59", size = 12) {
    this.ctx.fillStyle = color;
    this.ctx.font = `bold ${size}px monospace`;
    this.ctx.fillText(s, x, y);
  }
  crate(c: Crate, p: Point) {
    const q = gridToScreen(p),
      x = q.x + 8,
      y = q.y + 8;
    const col =
      c.color === "red"
        ? c.active
          ? "#ca7068"
          : "#cda19a"
        : c.active
          ? "#5f91bb"
          : "#a0b8ca";
    this.rect(x + 3, y + 8, 34, 32, "#203b4333");
    this.rect(x, y, 33, 32, "#5b6260");
    this.rect(x + 2, y + 2, 29, 27, col);
    this.rect(x + 3, y + 3, 27, 4, "#ffffff55");
    this.rect(x + 14, y + 3, 4, 26, "#f2dfb788");
    this.rect(x + 3, y + 22, 27, 3, "#273b4c33");
    this.rect(x - 1, y + 31, 36, 4, "#a88d65");
    if (!c.active) this.text("1", x + 7, y + 20, "#fff8e9", 13);
  }
  draw(g: Game) {
    const c = this.ctx;
    c.clearRect(0, 0, 1400, 650);
    this.rect(0, 0, 1400, 650, "#bdcec4");
    // Exterior loading yard and planting outside warehouse footprint.
    this.rect(0, 145, 1400, 415, "#879c96");
    for (let x = 45; x < 1400; x += 95) this.rect(x, 550, 50, 3, "#c1c9b8");
    for (const x of [25, 1350])
      for (let y = 95; y < 550; y += 100) {
        this.rect(x - 10, y + 18, 37, 37, "#637f69");
        this.rect(x - 6, y + 10, 28, 32, "#8aa777");
        this.rect(x + 2, y + 4, 15, 20, "#a5ba85");
      }
    this.rect(OX - 8, OY - 38, 996, 40, "#4e6868");
    this.rect(OX - 8, OY - 44, 996, 12, "#e5e8d7");
    this.rect(OX - 8, OY - 30, 996, 7, "#c0ccbf");
    for (let x = 0; x < 20; x++)
      for (let y = 0; y < 6; y++) {
        const p = gridToScreen({ x, y });
        this.rect(
          p.x,
          p.y,
          TILE - 1,
          TILE - 1,
          (x + y) % 2 ? "#d5ded6" : "#dce2d9",
        );
        if (dock({ x, y })) {
          this.rect(
            p.x,
            p.y,
            TILE - 1,
            TILE - 1,
            x === 19 && g.round === 1 ? "#a8b6af" : "#c5bd88",
          );
          for (let j = 0; j < 4; j++)
            this.rect(p.x + 3, p.y + j * 12, 7, 6, "#666c56");
        }
        if (this.debug) {
          this.text(`${x},${y}`, p.x + 3, p.y + 12, "#798d83", 9);
        }
      }
    this.rect(OX - 8, OY + 294, 996, 13, "#e2e5d5");
    this.rect(OX - 8, OY + 306, 996, 5, "#5d7772");
    for (let x = 1; x < 20; x += 4) {
      const p = gridToScreen({ x, y: 0 });
      this.rect(p.x, OY - 23, 29, 8, "#e4bd6c");
      this.rect(p.x + 3, OY - 22, 23, 4, "#fff1b2");
    }
    for (const r of cfg.map.rooms) {
      const p = gridToScreen(r);
      const w = r.width * TILE,
        h = r.height * TILE;
      this.rect(p.x, p.y, w, h, "#899e98");
      this.rect(
        p.x + 4,
        p.y + 4,
        w - 8,
        h - 8,
        r.id === "office"
          ? "#d6c3a5"
          : r.id === "locker"
            ? "#aec4c2"
            : r.id === "canteen"
              ? "#d6c8ac"
              : "#b8cfd0",
      );
      this.rect(p.x, p.y - 10, w, 14, "#e8e4d2");
      this.rect(p.x, p.y, w, 5, "#6a837d");
      this.rect(p.x, p.y, 5, h, "#6a837d");
      this.rect(p.x + w - 5, p.y, 5, h, "#6a837d");
      this.text(r.label, p.x + 12, p.y + 24, "#52665f", 12);
      if (r.id === "office") {
        this.rect(p.x + 25, p.y + 55, 85, 35, "#ab8762");
        this.rect(p.x + 49, p.y + 49, 30, 21, "#405965");
        this.rect(p.x + 52, p.y + 51, 24, 15, "#9fc4c7");
        this.rect(p.x + 53, p.y + 101, 30, 25, "#6f8d88");
        this.rect(p.x + 18, p.y + 143, 25, 25, "#b39e7e");
      }
      if (r.id === "locker")
        for (let i = 0; i < 4; i++) {
          this.rect(p.x + 13 + i * 30, p.y + 45, 25, 61, "#6f94a9");
          this.rect(p.x + 16 + i * 30, p.y + 48, 19, 4, "#b9d0d2");
          this.rect(p.x + 30 + i * 30, p.y + 75, 3, 5, "#e0d7a1");
        }
      if (r.id === "canteen") {
        this.rect(p.x + 40, p.y + 65, 70, 40, "#b58e61");
        for (const dy of [49, 113])
          for (const dx of [47, 88])
            this.rect(p.x + dx, p.y + dy, 17, 12, "#8a9c7b");
      }
      if (r.id === "toilet") {
        this.rect(p.x + 30, p.y + 48, 35, 40, "#f1f1dc");
        this.rect(p.x + 37, p.y + 55, 21, 20, "#a2b8b7");
        this.rect(p.x + 18, p.y + 108, 25, 17, "#eef1e6");
      }
    }
    this.vehicle(g, "inbound");
    if (g.round === 2) this.vehicle(g, "outbound");
    if (g.selected && g.task) {
      const t = g.task;
      c.strokeStyle = t.blocked ? "#df5454" : g.carried ? "#43c16f" : "#4299e1";
      c.lineWidth = 4;
      c.setLineDash([7, 5]);
      c.beginPath();
      t.route.forEach((p, i) => {
        const s = gridToScreen(p);
        if (!i) c.moveTo(s.x + 24, s.y + 24);
        else c.lineTo(s.x + 24, s.y + 24);
      });
      c.stroke();
      c.setLineDash([]);
    }
    for (const cr of g.crates) {
      const p = locationPoint(cr.loc);
      if (
        p &&
        !(cr.loc.kind === "inbound" && g.inbound !== "docked") &&
        !(g.task?.crate === cr.id && g.task.phase === "picking")
      ) {
        this.crate(cr, p);
        if (g.source === cr.id || g.highlight === cr.id) {
          const s = gridToScreen(p);
          c.strokeStyle = g.highlight === cr.id ? "#e23e39" : "#f8edaf";
          c.lineWidth = 3;
          c.strokeRect(s.x + 4, s.y + 3, 41, 43);
        }
      }
    }
    const { head, back } = workerVisual(g),
      a = gridToScreen(head),
      b = gridToScreen(back);
    c.strokeStyle = "#be943b";
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(a.x + 24, a.y + 25);
    c.lineTo(b.x + 24, b.y + 26);
    c.stroke();
    this.rect(b.x + 12, b.y + 13, 26, 29, "#dcb557");
    this.rect(b.x + 9, b.y + 41, 7, 5, "#455452");
    this.rect(b.x + 33, b.y + 41, 7, 5, "#455452");
    if (g.carried) {
      const cr = g.crates.find((cr) => cr.id === g.carried)!;
      const dest =
        g.task?.phase === "dropping" ? locationPoint(g.task.dest) : null;
      const f = dest
        ? Math.min(1, g.task!.elapsed / cfg.worker.dropSeconds)
        : 0;
      this.crate(
        cr,
        dest
          ? {
              x: back.x + (dest.x - back.x) * f,
              y: back.y + (dest.y - back.y) * f,
            }
          : back,
      );
    }
    if (g.task?.phase === "picking") {
      const cr = g.crates.find((cr) => cr.id === g.task!.crate)!;
      const p = locationPoint(cr.loc);
      if (p) {
        const f = Math.min(1, g.task.elapsed / cfg.worker.pickupSeconds);
        this.crate(cr, {
          x: p.x + (back.x - p.x) * f,
          y: p.y + (back.y - p.y) * f,
        });
      }
    }
    if (g.selected) {
      c.strokeStyle = "#f8e8a6";
      c.lineWidth = 3;
      c.strokeRect(a.x + 3, a.y + 2, 43, 44);
      if (this.debug) {
        c.strokeStyle = "#f8e8a6";
        c.strokeRect(b.x + 2, b.y + 2, 45, 45);
      }
    }
    this.rect(a.x + 16, a.y + 30, 7, 13, "#39566b");
    this.rect(a.x + 28, a.y + 30, 7, 13, "#39566b");
    this.rect(a.x + 12, a.y + 13, 26, 20, "#de9e4f");
    this.rect(a.x + 23, a.y + 14, 4, 18, "#f8dfa0");
    this.rect(a.x + 19, a.y + 3, 16, 13, "#d9b18b");
    this.rect(a.x + 15, a.y, 24, 6, "#5088a8");
    this.rect(a.x + 11, a.y + 5, 31, 4, "#426a84");
    const last = g.ledger.at(-1)!;
    if (g.time - last.time < 3 && last.time > 0) {
      const elapsed = g.time - last.time;
      c.globalAlpha = Math.max(0, 1 - elapsed / 3);
      this.text(
        `${last.amount > 0 ? "+" : ""}${last.amount} $`,
        a.x - 5,
        a.y - 15 - elapsed * 10,
        last.amount > 0 ? "#3a7654" : "#aa4c45",
        18,
      );
      c.globalAlpha = 1;
    }
    if (this.debug) {
      for (let x = 0; x < 20; x++)
        for (let y = 0; y < 6; y++) {
          const p = gridToScreen({ x, y });
          c.strokeStyle = room({ x, y }) ? "#a85c6677" : "#4f6b5e88";
          c.lineWidth = 1;
          c.strokeRect(p.x, p.y, TILE, TILE);
          this.text(
            `${x},${y}`,
            p.x + 3,
            p.y + 12,
            room({ x, y }) ? "#7a3d4b" : "#385c51",
            9,
          );
        }
      c.strokeStyle = "#f8e8a6";
      c.lineWidth = 3;
      for (const q of [a, b]) c.strokeRect(q.x + 2, q.y + 2, 45, 45);
      this.text(
        "20 kolumn × 6 rzędów · 36 pól pomieszczeń · 8 ramp · 76 pozostałych",
        OX,
        OY + 342,
        "#355e55",
        13,
      );
    }
  }
  vehicle(g: Game, kind: "inbound" | "outbound") {
    const state = kind === "inbound" ? g.inbound : g.outbound;
    if (!["docked", "arriving", "departing"].includes(state)) return;
    let shift = 0;
    if (state === "arriving") shift = -g.inboundTimer * 190;
    if (state === "departing") shift = -(1 - g.inboundTimer) * 190;
    const x = (kind === "inbound" ? OX - 180 : OX + 980) + shift,
      y = OY + 82;
    this.rect(x + 3, y + 8, 175, 115, "#29464a44");
    this.rect(x, y, 175, 110, kind === "inbound" ? "#a5675c" : "#e3e5d2");
    this.rect(x + 6, y + 5, 163, 100, "#e6e0cb");
    const cabin = kind === "inbound" ? x + 5 : x + 119;
    this.rect(cabin, y + 8, 49, 94, kind === "inbound" ? "#b87668" : "#90acaa");
    this.rect(cabin + 6, y + 20, 34, 27, "#4a6e79");
    for (const yy of [y - 5, y + 101]) {
      this.rect(cabin + 5, yy, 26, 13, "#3b4c4c");
    }
    for (let lane = 0; lane < 2; lane++)
      for (let depth = 0; depth < 2; depth++) {
        const p = gridToScreen(slotPoint(kind, lane, depth));
        this.rect(p.x + 4 + shift, p.y + 4, 41, 41, "#b2b6a6");
        this.rect(p.x + 6 + shift, p.y + 6, 37, 37, "#cbd0bc");
        this.text(
          depth === 1 ? "P" : "T",
          p.x + 20 + shift,
          p.y + 28,
          "#7e9182",
          10,
        );
      }
    this.text(
      kind === "inbound" ? "ROZŁADUNEK" : "TWÓJ BUS",
      x + 13,
      y - 17,
      "#eaf1e3",
      12,
    );
  }
}
