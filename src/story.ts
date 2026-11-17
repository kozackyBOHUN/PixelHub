import type { PalletSpec } from "./campaign.ts";

export const clients = {
  henryk: {
    name: "Henryk",
    company: "Piekarnia pod Młynem",
    business: "Piekarnia",
    personality: "Rzeczowy, pamięta, kto pomógł w potrzebie.",
  },
  maja: {
    name: "Maja",
    company: "Fundacja Dobre Jutro",
    business: "Pomoc lokalna",
    personality: "Praktyczna i uważna na wydatki.",
  },
  lena: {
    name: "Lena",
    company: "Most Pomocy",
    business: "Logistyka humanitarna",
    personality: "Spokojna nawet przy napiętych terminach.",
  },
} as const;

export type ClientId = keyof typeof clients;
export const storyQuests = [
  {
    id: "pieczywo",
    client: "henryk",
    round: 4,
    count: 4,
    bonus: 25,
    color: "red",
    line: "Nasz przewoźnik odwołał odbiór. Pomożesz dostarczyć pieczywo przed końcem rundy?",
  },
  {
    id: "piekarnia-stale",
    client: "henryk",
    round: 9,
    count: 8,
    bonus: 55,
    color: "red",
    after: "pieczywo",
    line: "Ostatnio nam pomogłeś. Teraz mogę zaproponować regularne dostawy.",
  },
  {
    id: "prezenty",
    client: "maja",
    round: 12,
    count: 4,
    bonus: 8,
    color: "blue",
    line: "Zebraliśmy prezenty dla dzieci. Potrzebujemy miejsca na przyjęcie i wysyłkę.",
  },
  {
    id: "pomoc",
    client: "lena",
    round: 17,
    count: 8,
    bonus: 35,
    color: "green",
    line: "Dwie partie pomocy czekają na dystrybucję. Przyjmij je, jeśli masz miejsce.",
  },
  {
    id: "prezenty-powrot",
    client: "maja",
    round: 23,
    count: 4,
    bonus: 20,
    color: "blue",
    after: "prezenty",
    line: "Poprzednia akcja się udała. Wracamy z kolejną dostawą.",
  },
  {
    id: "pomoc-powrot",
    client: "lena",
    round: 27,
    count: 8,
    bonus: 45,
    color: "green",
    after: "pomoc",
    line: "Na poprzedniej dostawie mogliśmy polegać. Pomożesz ponownie?",
  },
] as const satisfies readonly {
  id: string;
  client: ClientId;
  round: number;
  count: number;
  bonus: number;
  color: PalletSpec["destinationColor"];
  after?: string;
  line: string;
}[];
export const storyEvents: Record<number, string> = {
  1: "Pracownik: Paleciak działa. Zacznijmy od pierwszej ciężarówki.",
  3: "Pierwsze dostawy rozeszły się po okolicy. Dzwoni Henryk z piekarni.",
  6: "Pracownik: Mamy stały ruch. Przy większych dostawach przyda się miejsce na manewry.",
  8: "Pierwsze zlecenie MIX. Od dziś przyjmujemy też ładunki do sortowania.",
  13: "Konkurencja skraca terminy. Pilnuj kosztów kursów, zanim przyjmiesz dodatkowe zlecenie.",
  19: "Klienci pytają o większe dostawy. Oceń, czy kolejna rampa zapracuje na siebie.",
  25: "Magazyn obsługuje zamówienia, których kiedyś nie mógłby przyjąć.",
  30: "Pierwszy sezon dobiega końca. Jutro magazyn może znowu otworzyć rampy.",
};

export function storyOffers(round: number, fulfilled: (id: string) => boolean) {
  return storyQuests
    .filter(
      (q) =>
        (q.round === round ||
          (round > 30 && (round - 31) % 5 === q.round % 5)) &&
        (!("after" in q) || fulfilled("STORY-" + q.after)) &&
        (round <= 30 || fulfilled("STORY-" + q.id)),
    )
    .map((q) => {
      const id = "STORY-" + q.id + (round > 30 ? "-R" + round : "");
      const pallets: PalletSpec[] = Array.from({ length: q.count }, (_, i) => ({
        id: id + "-P" + (i + 1),
        color: q.color,
        destinationColor: q.color,
        dispatchRound: round,
        dueRound: round,
        temperature: "standard",
        condition: "standard",
      }));
      return {
        id,
        type: "story",
        client: q.client,
        line: q.line,
        bonus: q.bonus,
        penalty: 60,
        recipes: [],
        pallets,
        vehicle: clients[q.client].company,
        capacity: q.count,
        palletIds: pallets.map((p) => p.id),
      };
    });
}
