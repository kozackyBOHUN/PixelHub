import config from "./game-config.json" with { type: "json" };
export default config;
export type Point = { x: number; y: number };
export type Pose = { x: number; y: number; d: number };
export const dirs: Point[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];
export const key = (p: Point) => `${p.x},${p.y}`;
export const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const tail = (p: Pose): Point => ({
  x: p.x - dirs[p.d].x,
  y: p.y - dirs[p.d].y,
});
export const room = (p: Point) =>
  config.map.rooms.some(
    (r) =>
      p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height,
  );
export const inside = (p: Point) =>
  p.x >= 0 && p.x < config.map.columns && p.y >= 0 && p.y < config.map.rows;
export const dock = (p: Point) =>
  config.map.docks.some(
    (d) =>
      p.x >= d.x && p.x < d.x + d.width && p.y >= d.y && p.y < d.y + d.height,
  );
export function validateMap() {
  const cells = new Set<string>();
  for (const r of [...config.map.rooms, ...config.map.docks])
    for (let x = r.x; x < r.x + r.width; x++)
      for (let y = r.y; y < r.y + r.height; y++) {
        if (!inside({ x, y }) || cells.has(key({ x, y })))
          throw Error("Nieprawidłowa mapa: granice lub nakładające się pola.");
        cells.add(key({ x, y }));
      }
  if (config.map.columns !== 20 || config.map.rows !== 6 || cells.size !== 44)
    throw Error("Nieprawidłowa geometria MVP.");
  return true;
}
validateMap();
