import { campaign } from "./campaign.ts";
import type { RoundConfig } from "./campaign.ts";

const previous = campaign[0];
const pallets = Array.from({ length: 8 }, (_, index) => {
  const color = index < 4 ? ("red" as const) : ("blue" as const);
  return {
    ...previous.pallets[0],
    id: `TUTORIAL-${index + 1}`,
    color,
    destinationColor: color,
    dueRound: 1,
    dispatchRound: 1,
  };
});
const opening: RoundConfig = {
  ...previous,
  name: "Pierwsze zlecenie",
  description: "Witaj w Ostatnim magazynie. Jedna dostawa, dwa kursy.",
  arrivals: [
    {
      ...previous.arrivals[0],
      capacity: 8,
      palletIds: pallets.map((p) => p.id),
    },
  ],
  pallets,
  expectedStock: 0,
  hints: ["Grupuj palety według kolorów, aby ograniczyć koszt kursów."],
};
const second: RoundConfig = {
  ...campaign[1],
  description: "Obsłuż kolejne dostawy i odłóż towary przeznaczone na później.",
  arrivals: [
    ...campaign[1].arrivals,
    {
      ...previous.arrivals[0],
      id: "CMR-02-LOCAL",
      palletIds: previous.pallets.map((p) => p.id),
    },
  ],
  pallets: [...campaign[1].pallets, ...previous.pallets],
};
export const storyCampaign = [opening, second, ...campaign.slice(2)];
export const openingServiceFee = 520;
export const cleaningCost = 5;
