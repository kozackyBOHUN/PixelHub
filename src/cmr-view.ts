import type { CampaignGame } from "./campaign-game.ts";
import { COLORS } from "./campaign.ts";
import {
  displayColor,
  destinationColor,
  remainingRounds,
} from "./shipments.ts";
const states = {
  waiting: "oczekuje",
  arriving: "podjeżdża",
  docked: "podstawiony",
  departing: "odjeżdża",
  done: "zakończony",
};
export function renderCMRs(
  host: HTMLElement,
  game: CampaignGame,
  selected: string,
  select: (id: string) => void,
) {
  const scroll = [...host.querySelectorAll<HTMLElement>(".cmr-list")].map(
    (list) => list.scrollTop,
  );
  host.replaceChildren();
  for (const kind of ["inbound", "outbound"] as const) {
    const section = document.createElement("section"),
      title = document.createElement("h3"),
      list = document.createElement("div");
    title.textContent = kind === "inbound" ? "↓ Przyjazdy" : "↑ Wyjazdy";
    list.className = "cmr-list";
    list.setAttribute("aria-label", title.textContent);
    section.append(title, list);
    host.append(section);
    for (const m of game.cmrs.filter((m) => m.kind === kind)) {
      const card = document.createElement("button"),
        header = document.createElement("span"),
        tiles = document.createElement("span");
      card.className = `cmr-card ${kind}${m.id === selected ? " active" : ""}`;
      card.dataset.cmr = m.id;
      card.setAttribute("aria-pressed", String(m.id === selected));
      card.onclick = () => select(m.id);
      const progress = game.progress(m);
      header.className = "cmr-heading";
      header.textContent = `${m.id} · ${kind === "outbound" && progress.complete && m.state === "docked" ? "pełny załadunek" : states[m.state]} · ${kind === "outbound" ? `${progress.loaded}/${progress.total}` : `${m.palletIds.length} palet`}`;
      tiles.className = "cmr-tiles";
      const items =
        kind === "inbound"
          ? m.palletIds.map((id) => {
              const c =
                game.crates.find((c) => c.id === id) ??
                game.config.pallets.find((c) => c.id === id)!;
              return {
                color: displayColor(c, game.round),
                destination: destinationColor(c),
                remaining: remainingRounds(c, game.round),
                loaded: false,
                detail: `${c.id} · ${c.temperature}`,
              };
            })
          : (m.requirements ?? []).flatMap((r, i) =>
              Array.from({ length: r.quantity }, (_, n) => ({
                color: r.color,
                destination: r.color,
                remaining: 0,
                loaded: n < progress.counts[i],
                detail: r.temperature ?? "dowolna gotowa paleta tego koloru",
              })),
            );
      for (const item of items) {
        const tile = document.createElement("span");
        tile.className = `cmr-tile${item.loaded ? " loaded" : ""}`;
        tile.style.backgroundColor = COLORS[item.color];
        tile.style.setProperty("--destination", COLORS[item.destination]);
        tile.textContent = item.loaded
          ? "✓"
          : item.remaining
            ? String(item.remaining)
            : "";
        tile.title = `${item.destination} · ${item.remaining ? `za ${item.remaining} rund` : "gotowa"} · ${item.detail}${item.loaded ? " · załadowano" : ""}`;
        tile.setAttribute("aria-label", tile.title);
        if (item.remaining) tile.classList.add("retained");
        tiles.append(tile);
      }
      card.append(header, tiles);
      const special = (m.requirements ?? []).filter((r) => r.temperature);
      if (special.length) {
        const label = document.createElement("span");
        label.className = "cmr-special";
        label.textContent = special
          .map((r) => `${r.quantity} × ${r.color}: ${r.temperature}`)
          .join(" · ");
        card.append(label);
      }
      list.append(card);
    }
    list.scrollTop = scroll[kind === "inbound" ? 0 : 1] ?? 0;
    if (!list.childElementCount)
      list.textContent = "Brak dokumentów w tej rundzie";
  }
}
