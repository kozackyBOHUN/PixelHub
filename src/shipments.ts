import type { Crate } from "./simulation.ts";
export type DestinationColor = Exclude<Crate["color"], "gray">;
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
export function ready(c: Crate, round: number) {
  return (
    displayColor(c, round) !== "gray" &&
    !remainingRounds(c, round) &&
    !c.mix &&
    (!c.condition || c.condition === "standard") &&
    (!c.temperature || c.temperature === "standard" || c.climateStored === true)
  );
}
