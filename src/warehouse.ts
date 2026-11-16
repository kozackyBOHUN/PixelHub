import type { Point } from "./config.ts";

export const zones = {
  receiving: { x: 0, width: 4, label: "PRZYJĘCIE" },
  storage: { x: 4, width: 12, label: "MAGAZYN" },
  shipping: { x: 16, width: 4, label: "WYSYŁKA" },
} as const;
export type Zone = keyof typeof zones;
export type Levels = Record<Zone, number>;
export const zoneKeys = Object.keys(zones) as Zone[];
export const initialLevels = (): Levels => ({
  receiving: 1,
  storage: 1,
  shipping: 1,
});
export const moduleHeight = 4;
export const bayAtRow = (y: number) =>
  Math.floor((moduleHeight - 1 - y) / moduleHeight);
export const rampRow = (bay: number) => 1 - moduleHeight * bay;
export const moduleCost = (level: number) => 200 * 2 ** (level - 1);
export const hasFloor = (levels: Levels, p: Point) =>
  zoneKeys.some((id) => {
    const { x, width } = zones[id];
    return (
      p.x >= x &&
      p.x < x + width &&
      p.y >= -moduleHeight * (levels[id] - 1) &&
      p.y < moduleHeight
    );
  });
export const bayCount = (levels: Levels, kind: "inbound" | "outbound") =>
  kind === "inbound" ? levels.receiving : levels.shipping;
export function rampAt(levels: Levels, p: Point) {
  if (p.x !== 0 && p.x !== 19) return undefined;
  const kind = p.x === 0 ? "inbound" : "outbound";
  const bay = bayAtRow(p.y);
  if (
    bay < 0 ||
    bay >= bayCount(levels, kind) ||
    p.y < rampRow(bay) ||
    p.y > rampRow(bay) + 1
  )
    return undefined;
  return { id: kind + "-" + (bay + 1), kind, bay, x: p.x, y: rampRow(bay) };
}
