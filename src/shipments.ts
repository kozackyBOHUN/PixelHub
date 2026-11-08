import type { Crate } from "./simulation.ts";
export type DestinationColor = Exclude<Crate["color"], "gray">;
export type Requirement = {
  color: DestinationColor;
  quantity: number;
  temperature?: Crate["temperature"];
};
export const destinationColor = (
  c: Pick<Crate, "color" | "destinationColor">,
) => c.destinationColor ?? c.color;
export const dispatchRound = (c: Pick<Crate, "dueRound" | "dispatchRound">) =>
  c.dispatchRound ?? c.dueRound ?? 0;
export const remainingRounds = (
  c: Pick<Crate, "dueRound" | "dispatchRound">,
  round: number,
) => Math.max(0, dispatchRound(c) - round);
export const displayColor = (
  c: Pick<Crate, "color" | "destinationColor" | "dueRound" | "dispatchRound">,
  round: number,
) => (remainingRounds(c, round) ? "gray" : destinationColor(c));
export const requirementCount = (requirements: Requirement[] = []) =>
  requirements.reduce((n, r) => n + r.quantity, 0);
export function ready(c: Crate, round: number) {
  return (
    displayColor(c, round) !== "gray" &&
    !remainingRounds(c, round) &&
    !c.mix &&
    (!c.condition || c.condition === "standard") &&
    (!c.temperature || c.temperature === "standard" || c.climateStored)
  );
}
/** Assign each physical pallet once; explicit thermal requirements take precedence. */
export function matchCargo(
  requirements: Requirement[],
  cargo: Crate[],
  round: number,
) {
  const counts = requirements.map(() => 0),
    matchedIds: string[] = [],
    unmatchedIds: string[] = [];
  const order = requirements
    .map((_, i) => i)
    .sort(
      (a, b) =>
        Number(!!requirements[b].temperature) -
        Number(!!requirements[a].temperature),
    );
  for (const c of cargo) {
    const i = order.find(
      (i) =>
        counts[i] < requirements[i].quantity &&
        requirements[i].color === destinationColor(c) &&
        (!requirements[i].temperature ||
          requirements[i].temperature === c.temperature) &&
        ready(c, round),
    );
    if (i === undefined || matchedIds.includes(c.id)) unmatchedIds.push(c.id);
    else {
      counts[i]++;
      matchedIds.push(c.id);
    }
  }
  return {
    counts,
    matchedIds,
    unmatchedIds,
    loaded: matchedIds.length,
    total: requirementCount(requirements),
    complete:
      unmatchedIds.length === 0 &&
      matchedIds.length === requirementCount(requirements),
  };
}
