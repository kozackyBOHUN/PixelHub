import type { CampaignGame } from "./campaign-game.ts";
import { COLORS } from "./campaign.ts";
import {
  displayColor,
  destinationColor,
  remainingRounds,
} from "./shipments.ts";

const states = {
  waiting: "oczekuje",
  arriving: "zlecono podstawienie",
  docked: "przy rampie",
  departing: "odjeżdża",
  done: "zakończony",
};

export function renderCMRs(
  host: HTMLElement,
  game: CampaignGame,
  selected: string,
  select: (id: string) => void,
) {
  let list = host.querySelector<HTMLElement>(".cmr-list");
  if (!list) {
    list = document.createElement("div");
    list.className = "cmr-list";
    list.tabIndex = 0;
    list.setAttribute("aria-label", "CMR przyjazdowe");
    host.append(list);
  }
  for (const card of list.querySelectorAll<HTMLButtonElement>("button"))
    if (!game.cmrs.some((m) => m.id === card.dataset.cmr)) card.remove();
  for (const m of game.cmrs) {
    const existing = list.querySelector<HTMLButtonElement>(
      `[data-cmr="${m.id}"]`,
    );
    const card = existing ?? document.createElement("button");
    card.className = `cmr-card inbound${m.id === selected ? " active" : ""}`;
    card.dataset.cmr = m.id;
    card.setAttribute("aria-pressed", String(m.id === selected));
    card.onclick = () => select(m.id);
    const tiles = document.createElement("span");
    tiles.className = "cmr-tiles";
    let unloaded = 0;
    for (const id of m.palletIds) {
      const actual = game.crates.find((c) => c.id === id);
      const c =
        actual ??
        (game.contractOffer(m.id)?.pallets ?? game.config.pallets).find(
          (p) => p.id === id,
        )!;
      const complete = !!actual && actual.loc.kind !== "inbound";
      if (complete) unloaded++;
      const remaining = remainingRounds(c, game.round);
      const tile = document.createElement("span");
      tile.className = `cmr-tile${complete ? " loaded" : ""}${remaining ? " retained" : ""}`;
      tile.style.backgroundColor = COLORS[displayColor(c, game.round)];
      tile.style.setProperty("--destination", COLORS[destinationColor(c)]);
      tile.textContent = complete ? "✓" : remaining ? String(remaining) : "";
      tile.setAttribute(
        "aria-label",
        `${id} · ${destinationColor(c)}${complete ? " · rozładowano" : ""}`,
      );
      if (c.mix) {
        const colors = c.mix.flatMap((part) =>
          Array.from({ length: part.cartons }, () => part.color),
        );
        tile.classList.remove("retained");
        tile.classList.add("mix-tile");
        tile.textContent = "";
        tile.setAttribute("aria-label", `${id} · MIX · ${colors.join(", ")}`);
        for (const color of colors) {
          const carton = document.createElement("i");
          carton.style.backgroundColor = COLORS[color];
          tile.append(carton);
        }
      }
      tiles.append(tile);
    }
    const header = document.createElement("span");
    header.className = "cmr-heading";
    header.textContent = `${m.id} · ${m.vehicle} · ${unloaded}/${m.palletIds.length} · ${states[m.state]}`;
    card.replaceChildren(header, tiles);
    if (!existing) list.append(card);
  }
}
