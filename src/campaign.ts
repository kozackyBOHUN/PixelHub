import data from "./campaign-data.json" with { type: "json" };
import type { Crate } from "./simulation.ts";
export type PalletSpec = Pick<Crate, "id" | "color"> & {
  dueRound: number;
  temperature: "standard" | "chilled" | "frozen";
  condition: "standard" | "damaged" | "return";
  mix?: { color: Crate["color"]; cartons: number }[];
  prioritySeconds?: number;
};
export type Manifest = {
  id: string;
  vehicle: string;
  capacity: number;
  palletIds: string[];
};
export type Recipe = {
  id: string;
  inputs: string[];
  outputs: PalletSpec[];
  cartonsIn: number;
  cartonsOut: number;
};
export type RoundConfig = {
  number: number;
  name: string;
  description: string;
  arrivals: Manifest[];
  departures: Manifest[];
  pallets: PalletSpec[];
  recipes: Recipe[];
  unlocks: string[];
  expectedStock: number;
  hints: string[];
  testArrivalOrder?: string[];
};
export const campaign = data as RoundConfig[];
export const COLORS: Record<Crate["color"], string> = {
  gray: "#9dada8",
  red: "#cf7773",
  blue: "#729fc7",
  yellow: "#e5ca6b",
  green: "#88b98a",
  purple: "#ac8bc2",
  orange: "#dba270",
  teal: "#6abeb5",
  pink: "#d594b4",
};
export const PRIORITY = {
  greenFraction: 0.5,
  yellowFraction: 0.25,
  multipliers: [2, 1, 0.5],
  seconds: 1200,
};
export function priorityMultiplier(crate: Crate, time: number) {
  if (!crate.priority) return 1;
  const fraction =
    Math.max(0, time - crate.priority.started) / crate.priority.duration;
  return PRIORITY.multipliers[
    fraction < PRIORITY.greenFraction
      ? 0
      : fraction < PRIORITY.greenFraction + PRIORITY.yellowFraction
        ? 1
        : 2
  ];
}
export const upgrades = {
  expansion: { name: "Rozbudowa hali +120 pól", round: 5, cost: 200 },
  worker: { name: "Pracownik + paleciak", round: 6, cost: 120 },
  sorter: { name: "Sorter MIX", round: 8, cost: 160 },
  chiller: { name: "Chłodnia · 8 miejsc", round: 11, cost: 120 },
  service: { name: "Serwis i kontrola zwrotów", round: 13, cost: 100 },
  freezer: { name: "Mroźnia · 8 miejsc", round: 16, cost: 160 },
  expansion2: { name: "Druga rozbudowa +120 pól", round: 18, cost: 240 },
  ramps: { name: "Druga para ramp", round: 19, cost: 180 },
  climate: { name: "Powiększenie stref temperatur", round: 22, cost: 140 },
  equipment: { name: "Sprawniejsze paleciaki · +25%", round: 24, cost: 180 },
} as const;
export type Upgrade = keyof typeof upgrades;
export function validateCampaign() {
  if (campaign.length !== 30) throw Error("Kampania musi mieć 30 rund");
  const all = new Map<string, PalletSpec>();
  const stock = new Set<string>();
  let incoming = 0,
    outgoing = 0;
  for (const [i, r] of campaign.entries()) {
    if (r.number !== i + 1) throw Error("Numer rundy");
    const received = r.arrivals.flatMap((m) => m.palletIds);
    if (
      new Set(received).size !== r.pallets.length ||
      received.length !== r.pallets.length
    )
      throw Error("Manifest przyjazdu");
    for (const m of [...r.arrivals, ...r.departures])
      if (m.palletIds.length > m.capacity || !m.palletIds.length)
        throw Error("Pojemność CMR");
    for (const p of r.pallets) {
      if (
        all.has(p.id) ||
        !received.includes(p.id) ||
        p.dueRound < r.number ||
        p.dueRound > 30
      )
        throw Error("Identyfikator/termin palety");
      all.set(p.id, p);
      stock.add(p.id);
      incoming++;
    }
    const processed = new Set<string>();
    for (const recipe of r.recipes) {
      const cartons = recipe.inputs
        .flatMap((id) => all.get(id)?.mix ?? [])
        .reduce((s, c) => s + c.cartons, 0);
      const colors = new Map<string, number>();
      for (const id of recipe.inputs)
        for (const c of all.get(id)?.mix ?? [])
          colors.set(c.color, (colors.get(c.color) ?? 0) + c.cartons);
      for (const p of recipe.outputs)
        colors.set(p.color, (colors.get(p.color) ?? 0) - 4);
      if (
        cartons !== recipe.cartonsIn ||
        recipe.cartonsIn !== recipe.cartonsOut ||
        recipe.outputs.length * 4 !== cartons ||
        [...colors.values()].some((n) => n !== 0)
      )
        throw Error("Bilans kartonów");
      for (const id of recipe.inputs) {
        if (processed.has(id) || !stock.delete(id))
          throw Error("Wejście sortera");
        processed.add(id);
      }
      for (const p of recipe.outputs) {
        if (all.has(p.id)) throw Error("Duplikat wyniku");
        all.set(p.id, p);
        stock.add(p.id);
      }
    }
    for (const id of r.departures.flatMap((m) => m.palletIds)) {
      if (!stock.delete(id) || all.get(id)?.dueRound !== r.number)
        throw Error(`Niedostępna wysyłka ${id}`);
      outgoing++;
    }
    if (stock.size !== r.expectedStock) throw Error("Bilans rundy");
  }
  if (stock.size || incoming !== 696 || outgoing !== 696)
    throw Error("Bilans finału");
  return { rounds: 30, incoming, outgoing, stock: stock.size };
}
validateCampaign();
