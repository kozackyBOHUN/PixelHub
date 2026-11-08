import type { Point } from "../config.ts";
export const GRAPHICS = Object.freeze({
  sourceTile: 24,
  baseScale: 2,
  baseTile: 48,
  liftSource: 3,
  atlasGutter: 1,
  margin: 32,
  vehicleTravel: 2,
  animationTilesPerCycle: 1,
  idleFrameSeconds: 0.8,
});
export const VEHICLE_GRAPHICS = Object.freeze({
  cabSourceWidth: 24,
  segmentSourceWidth: 24,
  cargoSourceHeight: 48,
  endSourceWidth: 8,
  wheelSourceSize: 8,
});
export const LAYERS = Object.freeze({
  exterior: 0,
  floor: 10,
  markings: 20,
  shadows: 30,
  constructionBack: 40,
  objects: 100,
  constructionFront: 200,
  effects: 300,
  ui: 400,
});
export type Layer = (typeof LAYERS)[keyof typeof LAYERS];
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export const tileCenter = (p: Point): Point => ({ x: p.x + 0.5, y: p.y + 0.5 });
export class Camera {
  zoom = 1;
  pan: Point = { x: 0, y: 0 };
  bounds: Bounds = { minX: -4, minY: -1, maxX: 24, maxY: 7 };
  get scale() {
    return GRAPHICS.baseScale * this.zoom;
  }
  get tile() {
    return GRAPHICS.sourceTile * this.scale;
  }
  get width() {
    return Math.ceil(
      (this.bounds.maxX - this.bounds.minX) * this.tile + 2 * GRAPHICS.margin,
    );
  }
  get height() {
    return Math.ceil(
      (this.bounds.maxY - this.bounds.minY) * this.tile + 2 * GRAPHICS.margin,
    );
  }
  frame(bounds: Bounds) {
    if (
      ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(
        Number.isFinite,
      ) ||
      bounds.maxX <= bounds.minX ||
      bounds.maxY <= bounds.minY
    )
      throw Error("Nieprawidłowe granice kamery");
    this.bounds = { ...bounds };
  }
  worldToScreen(p: Point): Point {
    return {
      x: GRAPHICS.margin + (p.x - this.bounds.minX) * this.tile + this.pan.x,
      y: GRAPHICS.margin + (p.y - this.bounds.minY) * this.tile + this.pan.y,
    };
  }
  screenToWorld(p: Point): Point {
    return {
      x: (p.x - GRAPHICS.margin - this.pan.x) / this.tile + this.bounds.minX,
      y: (p.y - GRAPHICS.margin - this.pan.y) / this.tile + this.bounds.minY,
    };
  }
  screenToGrid(p: Point): Point {
    const q = this.screenToWorld(p);
    return { x: Math.floor(q.x), y: Math.floor(q.y) };
  }
  sourceToScreen(p: Point): Point {
    return { x: p.x * this.scale, y: p.y * this.scale };
  }
  move(dx: number, dy: number) {
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      this.pan.x += dx;
      this.pan.y += dy;
    }
  }
  setZoom(zoom: number, pivot?: Point) {
    if (!Number.isFinite(zoom) || zoom < 0.25 || zoom > 4)
      throw Error("Powiększenie musi mieścić się w zakresie 0,25–4");
    if (!pivot) {
      const ratio = zoom / this.zoom;
      this.pan = { x: this.pan.x * ratio, y: this.pan.y * ratio };
      this.zoom = zoom;
      return;
    }
    const point = this.screenToWorld(pivot);
    this.zoom = zoom;
    this.pan = {
      x: pivot.x - GRAPHICS.margin - (point.x - this.bounds.minX) * this.tile,
      y: pivot.y - GRAPHICS.margin - (point.y - this.bounds.minY) * this.tile,
    };
  }
  reset() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
  }
}
export function clientToCanvas(
  point: Point,
  rect: { left: number; top: number; width: number; height: number },
  canvas: { width: number; height: number },
): Point {
  return {
    x: ((point.x - rect.left) * canvas.width) / rect.width,
    y: ((point.y - rect.top) * canvas.height) / rect.height,
  };
}
