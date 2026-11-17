import type { PalletSpec, RoundConfig } from "./campaign.ts";

export function freeRound(
  round: number,
  plannedLoads: number,
  service = false,
): RoundConfig {
  const seed = Math.imul(round, 1597334677) >>> 0;
  const colors = [
    "red",
    "blue",
    "green",
    "yellow",
    "purple",
    "orange",
  ] as const;
  const loads = Math.min(6, Math.max(2, plannedLoads) + (seed % 2));
  const pallets: PalletSpec[] = Array.from(
    { length: 4 * loads },
    (_, index) => {
      const color =
        colors[
          (seed + Math.floor(index / 4) + (index % 4 === 3 ? 1 : 0)) %
            colors.length
        ];
      return {
        id: `FREE-${round}-P${index + 1}`,
        color,
        destinationColor: color,
        dispatchRound: round,
        dueRound: round,
        temperature: "standard",
        condition:
          service && index === 0
            ? seed % 2
              ? "damaged"
              : "return"
            : "standard",
        ...(index === 1 && seed % 3 === 0 ? { prioritySeconds: 1200 } : {}),
      };
    },
  );
  return {
    number: round,
    name: "Prowadzenie magazynu",
    description: "Zaplanuj przyjazdy i kursy własnej floty.",
    arrivals: Array.from({ length: loads }, (_, index) => ({
      id: `CMR-${round}-FREE-${index + 1}`,
      capacity: 4,
      vehicle: `PH-${round}-${index + 1}`,
      palletIds: pallets.slice(index * 4, index * 4 + 4).map((p) => p.id),
    })),
    pallets,
    recipes: [],
    unlocks: [],
    expectedStock: 0,
    hints: [],
  };
}
