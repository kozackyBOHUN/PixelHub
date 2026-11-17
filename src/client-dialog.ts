import {
  clientImage,
  portraitClients,
  portraitExpressions,
  publicAsset,
} from "./portraits.ts";
import type { PortraitExpression } from "./portraits.ts";

const art = (id: string) => publicAsset(`assets/ui/dialogues/${id}.png`);
function skin<T extends HTMLElement>(element: T, id: string) {
  element.style.setProperty("--dialog-art", `url("${art(id)}")`);
  element.classList.add("client-skin");
  return element;
}

export function clientDialog(options: {
  client: string;
  name: string;
  company: string;
  line: string;
  expression: PortraitExpression;
  round: number;
  count: number;
  bonus: number;
  penalty: number;
  decision?: string;
  decide: (accept: boolean) => void;
}) {
  const details = document.createElement("details");
  details.className = "client-dialog";
  const summary = document.createElement("summary");
  summary.append(
    clientImage(options.client, options.name, "avatar", "neutral"),
    "Zlecenie fabularne · " + options.name,
  );
  const surface = skin(document.createElement("div"), "dialog_panel_9slice");
  surface.classList.add("client-dialog-body");
  const frame = skin(document.createElement("div"), "portrait_frame_9slice");
  frame.classList.add("client-frame");
  frame.append(
    clientImage(options.client, options.name, "portrait", options.expression),
  );
  const content = document.createElement("div");
  const name = skin(document.createElement("h3"), "nameplate_9slice");
  name.textContent = `${options.name} · ${options.company}`;
  const line = skin(document.createElement("p"), "dialog_bubble_9slice");
  line.textContent = options.line;
  const stats = skin(document.createElement("ul"), "stats_bar_9slice");
  for (const [icon, text] of [
    ["pallet", `${options.count} palet · do ${options.count} pól`],
    ["calendar", `Wysyłka do końca rundy ${options.round}`],
    [
      "coins",
      `Obsługa podstawowa ${options.count * 19} USD · premia ${options.bonus} USD · kara ${options.penalty} USD`,
    ],
  ]) {
    const stat = document.createElement("li");
    const image = document.createElement("img");
    image.src = art("icon_" + icon);
    image.alt = "";
    stat.append(image, text);
    stats.append(stat);
  }
  const actions = document.createElement("div");
  actions.className = "client-actions";
  if (options.decision)
    actions.textContent =
      options.decision === "accepted" ? "Przyjęto" : "Odrzucono";
  else
    for (const accept of [true, false]) {
      const button = skin(
        document.createElement("button"),
        accept ? "button_accept_9slice" : "button_decline_9slice",
      );
      button.type = "button";
      button.textContent = accept ? "Przyjmij" : "Odmów";
      button.onclick = () => options.decide(accept);
      actions.append(button);
    }
  content.append(name, line, stats, actions);
  surface.append(frame, content);
  details.append(summary, surface);
  details.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !details.open) return;
    event.preventDefault();
    event.stopPropagation();
    details.open = false;
    summary.focus();
  });
  return details;
}

export function clientArtPreview() {
  const preview = document.createElement("details");
  preview.className = "client-art-preview";
  const toggle = document.createElement("summary");
  toggle.textContent = "Podgląd grafik klientów · roboczy art v0.1";
  preview.append(toggle);
  preview.addEventListener("toggle", () => {
    if (!preview.open || preview.childElementCount > 1) return;
    for (const scale of [1, 2]) {
      const heading = document.createElement("h3");
      heading.textContent = `Grafiki ×${scale}`;
      const grid = document.createElement("div");
      grid.className = "client-art-grid";
      grid.dataset.scale = String(scale);
      for (const [id, name] of Object.entries(portraitClients)) {
        const card = document.createElement("section");
        const title = document.createElement("h4");
        title.textContent = name;
        card.append(title);
        for (const expression of portraitExpressions) {
          const image = clientImage(id, name, "portrait", expression);
          image.title = expression;
          card.append(image);
        }
        card.append(clientImage(id, name, "avatar", "neutral"));
        grid.append(card);
      }
      preview.append(heading, grid);
    }
  });
  return preview;
}
