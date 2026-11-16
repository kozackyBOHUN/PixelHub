import { GRAPHICS } from "./graphics/config.ts";
import { moduleCost, zoneKeys, zones } from "./warehouse.ts";
import { renderCMRs } from "./cmr-view.ts";
import { destinationColor, dispatchRound, ready } from "./shipments.ts";
import { Application, Sprite, Texture } from "pixi.js";
import cfg from "./config.ts";
import { CampaignGame, quoteDelivery } from "./campaign-game.ts";
import type { SorterSite } from "./campaign-game.ts";
import { Renderer, locationPoint } from "./renderer.ts";
import {
  campaign,
  upgrades,
  priorityMultiplier,
  COLORS,
  recipientNames,
  requiredUpgrades,
} from "./campaign.ts";
import type { Upgrade } from "./campaign.ts";
import { SAVE_KEY, serialize, restore } from "./save.ts";
const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search),
  dev = params.has("dev") || params.has("test");
const saveKey = dev ? `${SAVE_KEY}-developer` : SAVE_KEY;
let game = new CampaignGame(),
  saveError = "",
  autosaveEnabled = true;
try {
  const raw = localStorage.getItem(saveKey);
  if (raw) game = restore(raw);
} catch (error) {
  saveError = String(error);
  autosaveEnabled = false;
}
game.dev = dev;
const renderer = new Renderer($("world") as HTMLCanvasElement);
function resizeWorld() {
  const box = renderer.canvas.parentElement!.getBoundingClientRect();
  renderer.camera.viewport = {
    x: Math.max(1, Math.floor(box.width) - 2),
    y: Math.max(1, Math.floor(box.height) - 2),
  };
  const strip = $("cmrs").querySelector(".cmr-list");
  $("cmr-scroll").hidden = !strip || strip.scrollWidth <= strip.clientWidth + 2;
}
new ResizeObserver(resizeWorld).observe(renderer.canvas.parentElement!);
resizeWorld();
const app = new Application();
await app.init({
  canvas: renderer.canvas,
  width: renderer.surface.width,
  height: renderer.surface.height,
  backgroundAlpha: 0,
  antialias: false,
  resolution: 1,
});
const texture = new Texture({
  source: Texture.from(renderer.surface).source,
  dynamic: true,
});
texture.source.scaleMode = "nearest";
const sceneSprite = new Sprite(texture);
app.stage.addChild(sceneSprite);
let chosenCmr = "",
  inspection = "",
  lastHUD = "",
  last = performance.now(),
  lastSave = 0,
  busy = false;
let queuedSource: string | null = null;
let placingCold = false;
let placingSorter: SorterSite | null = null;
function save() {
  try {
    localStorage.setItem(saveKey, serialize(game));
    saveError = "Zapisano grę.";
    setTimeout(() => (saveError = ""), 2500);
  } catch (error) {
    saveError = String(error);
  }
}
function persistProgress() {
  if (autosaveEnabled) save();
}
function load() {
  try {
    const raw = localStorage.getItem(saveKey);
    if (!raw) {
      feedback("Brak zapisu do wczytania.");
      return;
    }
    if (raw) {
      game = restore(raw);
      placingSorter = null;
      placingCold = false;
      lastHUD = "";
      game.dev = dev;
      saveError = "Wczytano grę.";
      setTimeout(() => (saveError = ""), 2500);
      autosaveEnabled = true;
    }
  } catch (error) {
    saveError = String(error);
    autosaveEnabled = false;
  }
}
function focusWorker(index: number) {
  queuedSource = null;
  game.workerIndex = index;
  for (const [i, worker] of game.workers.entries())
    if (i !== index) worker.selected = false;
  game.activeWorker.selectWorker();
}
function clickAt(p: { x: number; y: number }) {
  if (placingCold) {
    const cell = renderer.screenToGrid(p);
    if (game.placeColdCell(cell)) {
      persistProgress();
      if (!game.coldStock) placingCold = false;
      feedback("Pozostałe pola chłodni: " + game.coldStock);
    } else
      feedback(game.coldPlacementError(cell) ?? "Brak pól do rozmieszczenia.");
    hud();
    return;
  }
  if (placingSorter) {
    placingSorter = { ...renderer.screenToGrid(p), d: placingSorter.d };
    if (game.installSorter(placingSorter)) {
      placingSorter = null;
      placingCold = false;
      persistProgress();
      feedback("Sorter ustawiony.");
    } else feedback(game.message);
    lastHUD = "";
    hud();
    return;
  }
  if (game.status !== "playing" || busy) return;
  hudFeedbackUntil = 0;
  const cell = renderer.screenToGrid(p),
    w = game.activeWorker;
  if (
    (queuedSource && w.selected) ||
    (w.selected && (w.source || w.carried) && !w.task)
  ) {
    const depth = cell.x - cfg.map.columns;
    const truck = game.trucks.find((truck) => {
      const row = game.rampRow(truck.bay);
      return (
        depth >= 0 &&
        depth < truck.capacity / 2 &&
        cell.y >= row &&
        cell.y < row + 2
      );
    });
    const dest = truck
      ? ({
          kind: "outbound",
          lane: cell.y - game.rampRow(truck.bay),
          depth,
          bay: truck.bay,
        } as const)
      : ({ kind: "floor", ...cell } as const);
    if (queuedSource) {
      if (game.enqueue(game.workerIndex, queuedSource, dest)) {
        queuedSource = null;
        persistProgress();
        feedback("Zadanie dodane do kolejki.");
      } else
        feedback(
          game.queue(game.workerIndex).length >= 3
            ? "Kolejka jest pełna."
            : "Paleta lub cel są niedostępne albo zarezerwowane.",
        );
    } else w.order(dest);
    hud();
    return;
  }
  for (const [i, worker] of game.workers.entries()) {
    const h = renderer.gridToScreen({
      x: worker.transportGeometry.head.x + 0.5,
      y: worker.transportGeometry.head.y + 0.5,
    });
    if (
      renderer.hitWorker(p, i) ||
      (Math.abs(p.x - h.x) < renderer.camera.tile * 0.3 &&
        Math.abs(p.y - h.y) < renderer.camera.tile * 0.3)
    ) {
      focusWorker(i);
      hud();
      return;
    }
  }
  const hitCargo = renderer.hitCargo(p);
  const c = game.crates.find((c) => {
    const q = locationPoint(c.loc);
    return hitCargo
      ? c.id === hitCargo
      : !!q && q.x === cell.x && q.y === cell.y;
  });
  if (c) {
    inspection = c.id;
    if (w.selected && w.task) {
      queuedSource = c.id;
      feedback("Wybierz cel zadania w kolejce.");
    } else w.choose(c.id);
  } else if (w.selected) {
    hudFeedbackUntil = 0;
    w.moveTo(cell);
  }
  hud();
}
let drag: { x: number; y: number; distance: number } | null = null,
  space = false,
  skipClick = false;
$("world").addEventListener("pointerdown", (event) => {
  const e = event as PointerEvent;
  if (e.button === 1 || (e.button === 0 && space)) {
    const p = renderer.point(e);
    drag = { ...p, distance: 0 };
    ($("world") as HTMLCanvasElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});
$("world").addEventListener("pointermove", (event) => {
  if (!drag && placingCold) {
    const cell = renderer.screenToGrid(renderer.point(event as PointerEvent));
    renderer.scene.coldPreview = {
      ...cell,
      valid: !game.coldPlacementError(cell),
    };
  }
  if (!drag && placingSorter) {
    placingSorter = {
      ...renderer.screenToGrid(renderer.point(event as PointerEvent)),
      d: placingSorter.d,
    };
  }
  if (!drag) return;
  const p = renderer.point(event as PointerEvent),
    dx = p.x - drag.x,
    dy = p.y - drag.y;
  drag.distance += Math.hypot(dx, dy);
  renderer.camera.move(dx, dy);
  drag.x = p.x;
  drag.y = p.y;
});
$("world").addEventListener("pointerup", () => {
  skipClick = !!drag && drag.distance > 2;
  drag = null;
});
$("world").addEventListener("click", (e) => {
  if (skipClick) {
    skipClick = false;
    return;
  }
  clickAt(renderer.point(e));
});
window.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    !["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(
      (e.target as HTMLElement).tagName,
    )
  ) {
    space = true;
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") space = false;
});
window.addEventListener("blur", () => {
  space = false;
  drag = null;
});
$("zoom-out").onclick = () =>
  renderer.camera.setZoom(Math.max(0.5, renderer.camera.zoom - 0.5));
$("zoom-in").onclick = () =>
  renderer.camera.setZoom(Math.min(3, renderer.camera.zoom + 0.5));
$("camera-reset").onclick = () => renderer.camera.reset();
const assetSelect = $("asset-select") as HTMLSelectElement;
for (const id of [
  ...renderer.registry.all().map((a) => a.id),
  "demo/rack",
  "demo/vehicle4",
  "demo/vehicle6",
  "demo/vehicle8",
  "demo/vehicle10",
]) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = id;
  assetSelect.append(o);
}
function updatePreview() {
  const id = assetSelect.value;
  const directionInput = $("asset-direction") as HTMLInputElement,
    frameInput = $("asset-frame") as HTMLInputElement;
  const demo = id.startsWith("demo/");
  directionInput.disabled = demo;
  frameInput.disabled = demo;
  if (!demo) {
    const def = renderer.registry.get(id);
    directionInput.max = String(def.directions.length - 1);
    frameInput.max = String(def.framesPerDirection - 1);
    directionInput.value = String(
      Math.max(
        0,
        Math.min(def.directions.length - 1, Number(directionInput.value)),
      ),
    );
    frameInput.value = String(
      Math.max(
        0,
        Math.min(def.framesPerDirection - 1, Number(frameInput.value)),
      ),
    );
  }
  renderer.preview(
    $("asset-preview") as HTMLCanvasElement,
    id,
    Number(($("asset-direction") as HTMLInputElement).value),
    Number(($("asset-frame") as HTMLInputElement).value),
  );
  $("asset-info").textContent = id.startsWith("demo/")
    ? "Podgląd modułów — bez obiektów fizycznych w grze."
    : JSON.stringify(renderer.registry.get(id), null, 2);
}
$("graphics-report").onclick = () => {
  $("graphics-status").textContent = JSON.stringify(
    renderer.diagnostics(),
    null,
    2,
  );
};
if (params.has("graphics")) {
  renderer.debug = true;
  ($("lab") as HTMLDetailsElement).open = true;
  ($("graphics-panel") as HTMLDetailsElement).open = true;
}
$("cancel").onclick = () => game.activeWorker.cancel();
$("debug").onclick = () => (renderer.debug = !renderer.debug);
$("save").onclick = save;
$("load").onclick = load;
$("new-game").onclick = () => ($("restart") as HTMLButtonElement).click();
$("restart").onclick = () => {
  if (confirm("Rozpocząć nową kampanię? Bieżący zapis zostanie zastąpiony.")) {
    game = new CampaignGame();
    game.dev = dev;
    autosaveEnabled = true;
    save();
    ($("end") as HTMLDialogElement).close();
  }
};
function beginSorterPlacement() {
  placingSorter = { x: 5, y: -5, d: 0 };
  lastHUD = "";
  feedback(
    "Wskaż pole sortera. Czerwona strzałka to wejście, zielona to wyjście.",
  );
}
$("sorter-rotate").onclick = () => {};
function cancelSorterPlacement() {
  placingSorter = null;
  placingCold = false;
  renderer.scene.coldPreview = null;
  hudFeedbackUntil = 0;
  lastHUD = "";
  hud();
}
$("sorter-cancel").onclick = cancelSorterPlacement;
$("development").onclick = () => {
  if (game.beginDevelopment()) {
    persistProgress();
    hud();
  }
};
$("continue").onclick = () => {
  game.nextRound();
  chosenCmr = "";
  inspection = "";
  renderer.camera.reset();
  persistProgress();
  hud();
};
$("phase-save").onclick = () => {
  save();
  $("shop-message").textContent = saveError;
};
$("phase-load").onclick = () => {
  load();
  $("shop-message").textContent = saveError;
  hud();
};
$("end").addEventListener("cancel", (event) => event.preventDefault());
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (placingSorter || placingCold) cancelSorterPlacement();
    else game.activeWorker.cancel();
  }

  if (e.key.toLowerCase() === "g") renderer.debug = !renderer.debug;
});
document
  .querySelectorAll<HTMLButtonElement>("[data-speed]")
  .forEach((b) => (b.onclick = () => (game.speed = Number(b.dataset.speed))));
type HudAction = {
  color?: string;
  key: string;
  label: string;
  run: () => void;
  reason?: string;
};
function syncActions(id: string, actions: HudAction[]) {
  const host = $(id);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
  for (const b of buttons)
    if (!actions.some((a) => a.key === b.dataset.action)) b.remove();
  for (const action of actions) {
    const existing = buttons.find((b) => b.dataset.action === action.key);
    const b = existing ?? document.createElement("button");
    b.dataset.action = action.key;
    b.style.borderLeft = action.color ? `5px solid ${action.color}` : "";
    b.textContent = action.label + (action.reason ? ` · ${action.reason}` : "");
    b.setAttribute("aria-disabled", String(!!action.reason));
    b.onclick = (event) => {
      if (event.detail > 1) return;
      if (action.reason) feedback(action.reason);
      else action.run();
      hud();
    };
    if (!existing) host.append(b);
  }
}
let hudFeedback = "";
let hudFeedbackUntil = 0;
function feedback(message: string) {
  hudFeedback = message;
  hudFeedbackUntil = performance.now() + 3500;
  $("message").textContent = message;
  if (game.status === "development") $("shop-message").textContent = message;
}
const workerStatus = (w: typeof game.activeWorker) => {
  if (w.task?.blocked)
    return w.message.startsWith("Przejazd zablokowany")
      ? "Brak przejazdu"
      : "Czeka na przejazd";
  if (w.task?.phase === "YIELD") return "Ustępuje";
  if (w.task?.crate === null) return "Przemieszcza się";
  if (w.carried) return "Transportuje";
  if (w.task?.phase === "GO_TO_SOURCE") return "Idzie do palety";
  if (w.task) return "Wykonuje zadanie";
  return /dotarł|Odłożono/.test(w.message) ? "Zadanie zakończone" : "Wolny";
};
function investmentTrack(
  host: HTMLElement,
  sprite: string,
  count: number,
  slots: number,
) {
  const track = document.createElement("span");
  track.className = "investment-track " + sprite;
  track.setAttribute("aria-hidden", "true");
  for (let i = 0; i < slots; i++) {
    const icon = document.createElement("span");
    if (i < count) icon.className = "owned";
    track.append(icon);
  }
  host.append(track);
}
function renderInvestmentCards() {
  const cards = $("investment-cards");
  $("investment-balance").textContent =
    "Saldo · " + game.cash.toFixed(0) + " USD";
  function card(
    key: string,
    title: string,
    state: string,
    sprite: string,
    count: number,
    slots: number,
    price: number,
    action: string,
    run: () => void,
    reason?: string,
  ) {
    const group = cards.querySelector<HTMLElement>(
      key === "workers"
        ? ".invest-staff"
        : ["receiving", "storage", "shipping"].includes(key)
          ? ".invest-build"
          : ".invest-equip",
    )!;
    let panel = group.querySelector<HTMLElement>(
      '[data-investment="' + key + '"]',
    );
    if (!panel) {
      panel = document.createElement("section");
      panel.dataset.investment = key;
      panel.className = "investment-card";
      panel.append(
        document.createElement("h2"),
        document.createElement("p"),
        document.createElement("div"),
        document.createElement("button"),
      );
      group.append(panel);
    }
    const [heading, description, track, control] = [...panel.children] as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLButtonElement,
    ];
    heading.textContent = title;
    description.textContent = state;
    track.replaceChildren();
    investmentTrack(track, sprite, count, slots);
    control.textContent = action + " · " + price + " USD";
    control.setAttribute("aria-disabled", String(!!reason));
    control.title = reason ?? "";
    control.onclick = (event) => {
      if (event.detail > 1) return;
      if (reason) feedback(reason);
      else run();
      hud();
    };
  }
  for (const zone of zoneKeys) {
    const level = game.levels[zone];
    const cost = moduleCost(level);
    const detail =
      zone === "storage"
        ? level * 48 + " pól składowania · +48 po zakupie"
        : level + (level === 1 ? " rampa" : level < 5 ? " rampy" : " ramp");
    card(
      zone,
      zones[zone].label + " · LV" + level,
      detail,
      "crates",
      level,
      Math.max(6, level + 1),
      cost,
      "Rozbuduj do LV" + (level + 1),
      () => {
        if (game.buyModule(zone)) persistProgress();
      },
      game.cash < cost ? "Brak pieniędzy" : undefined,
    );
  }
  const mixers = game.sorters.length + game.availableSorters;
  card(
    "mix",
    "MIX · LV" + mixers,
    mixers
      ? game.sorters.length +
          " na mapie · " +
          game.availableSorters +
          " do ustawienia"
      : "Dwie palety MIX → dwie palety wynikowe",
    "mixers",
    mixers,
    Math.max(4, mixers + 1),
    upgrades.sorter.cost,
    "Kup mikser",
    () => {
      if (!game.buySorter()) return;
      persistProgress();
      beginSorterPlacement();
    },
    game.upgradeUnavailable("sorter"),
  );
  const mixPanel = cards.querySelector('[data-investment="mix"]')!;
  let placeMix = mixPanel.querySelector<HTMLButtonElement>(".equipment-resume");
  if (!placeMix) {
    placeMix = document.createElement("button");
    placeMix.className = "equipment-resume";
    placeMix.textContent = "Rozmieść zakupiony mikser";
    placeMix.onclick = () => {
      beginSorterPlacement();
      hud();
    };
    mixPanel.append(placeMix);
  }
  placeMix.hidden = !game.availableSorters;
  card(
    "cold",
    "CHŁODNIA",
    "Pakiet 4 pól · do rozmieszczenia: " + game.coldStock,
    "cold",
    1,
    1,
    upgrades.chiller.cost,
    "Kup chłodnię",
    () => {
      if (!game.buyColdPack()) return;
      placingCold = true;
      persistProgress();
    },
    game.cash < upgrades.chiller.cost ? "Brak pieniędzy" : undefined,
  );
  const coldPanel = cards.querySelector('[data-investment="cold"]')!;
  let resume = coldPanel.querySelector<HTMLButtonElement>(".cold-resume");
  if (!resume) {
    resume = document.createElement("button");
    resume.className = "cold-resume";
    resume.textContent = "Rozmieść zakupione pola";
    resume.onclick = () => {
      placingCold = true;
      hud();
    };
    coldPanel.append(resume);
  }
  resume.hidden = !game.coldStock;
  card(
    "piesek",
    "PIESEK",
    game.usesPiesek
      ? "Wyposażenie aktywne"
      : "Elektryczny wózek · przewóz ×1,5",
    "piesek",
    Number(game.usesPiesek),
    1,
    upgrades.equipment.cost,
    "Kup Pieska",
    () => {
      if (game.buy("equipment")) persistProgress();
    },
    game.upgradeUnavailable("equipment"),
  );
  const crew = game.workers.length + game.pendingWorkers.length;
  card(
    "workers",
    "PRACOWNICY",
    crew +
      (crew === 1 ? " osoba · " : " osoby · ") +
      cfg.economy.workerWagePerRound +
      " USD/os. na rundę",
    "workers",
    crew,
    4,
    upgrades.worker.cost,
    "Zatrudnij",
    () => {
      if (game.buy("worker")) persistProgress();
      else feedback(game.message);
    },
    game.upgradeUnavailable("worker"),
  );
}
function hud() {
  $("cash").textContent = `${game.cash.toFixed(0)} $`;
  $("round").textContent = `Runda ${game.round}/30`;
  $("round-name").textContent = game.config.name;
  $("clock").textContent =
    `${Math.floor(game.time / 60)}:${String(Math.floor(game.time % 60)).padStart(2, "0")}`;
  const w = game.activeWorker;
  $("message").textContent =
    saveError ||
    (performance.now() < hudFeedbackUntil
      ? hudFeedback
      : w.message || game.message);
  $("cancel").hidden = !w.selected;
  $("crew").textContent = `${game.workers.length} os.`;
  const received = game.config.pallets.filter((p) =>
    game.crates.some((c) => c.id === p.id && c.loc.kind !== "inbound"),
  ).length;
  const sent = game.shipped.length;
  $("progress").textContent =
    `Przyjęto ${received}/${game.config.pallets.length} · Do wysłania ${Math.max(0, game.requiredCount - sent)} · Wysłano ${sent} · Stan ${game.stock.length}`;
  $("progress").title = game.config.description;
  const travel = game.trucks
    .filter((t) => t.trip)
    .map(
      (t) =>
        `${t.vehicle} · powrót za ${Math.max(0, Math.ceil(t.trip!.returnAt - game.time))} s`,
    );
  $("trip-clock").textContent = travel.join(" | ");
  $("sorter-status").textContent = game.sorterStatus
    ? `MIX · ${game.sorterStatus}`
    : "";
  $("sorter-placement").hidden = !placingSorter && !placingCold;
  $("sorter-rotate").hidden = true;
  $("cold-count").textContent = placingCold
    ? "Do rozmieszczenia: " + game.coldStock
    : "";
  if (placingSorter && performance.now() >= hudFeedbackUntil)
    $("message").textContent =
      "Kliknij pole maszyny. Zostaw dwa wolne pola po każdej stronie maszyny.";

  const signature = JSON.stringify([
    game.round,
    game.vehicles.map(({ timer, ...m }) => m),
    game.shipped.length,
    game.tripHistory.length,
    game.purchased,
    game.pendingWorkers.length,
    game.sorter,
    !!placingSorter,
    placingCold,
    game.coldStock,
    game.levels,
    game.sorters.length,
    game.crates.map((c) => [c.id, c.loc]),
    game.cash,
    game.workers.map((w) => [workerStatus(w), w.source, w.carried, w.selected]),
    game.workerIndex,
    game.queues,
    game.contracts,
    chosenCmr,
    inspection,
    game.crates
      .filter((c) => c.priority)
      .map((c) => [c.id, priorityMultiplier(c, game.time), c.loc.kind]),
    game.status,
    busy,
  ]);
  if (signature !== lastHUD) {
    lastHUD = signature;
    syncActions(
      "workers",
      game.workers.map((worker, i) => ({
        key: String(i),
        label: `${i === game.workerIndex ? "● " : ""}Pracownik ${i + 1} · ${workerStatus(worker)}`,
        run: () => {
          focusWorker(i);
          hudFeedbackUntil = 0;
        },
      })),
    );
    renderQueues();
    if (!game.cmrs.some((m) => m.id === chosenCmr)) chosenCmr = "";
    renderCMRs($("cmrs"), game, chosenCmr, (id) => {
      const manifest = game.cmrs.find((m) => m.id === id)!;
      chosenCmr = id;
      if (busy || placingSorter || game.status !== "playing")
        feedback("Operacja chwilowo niedostępna.");
      else if (manifest.state === "waiting") {
        const bays = Array.from({ length: game.inboundBayCount }, (_, i) => i);
        const bay = bays.find(
          (b) =>
            !game.cmrAt(manifest.kind, b) &&
            !game.vehicleBusy(manifest.kind, b),
        );
        if (bay === undefined)
          feedback("Brak wolnej rampy. Zwolnij rampę i spróbuj ponownie.");
        else if (game.dockCMR(id, bay))
          feedback(`Zlecono podstawienie CMR ${id} do rampy ${bay + 1}.`);
        else feedback(game.message);
      } else
        feedback(
          `${id} · ${manifest.state === "done" ? "Zakończono" : manifest.state === "docked" ? `Przy rampie ${manifest.bay + 1}` : "Samochód w ruchu"}`,
        );
      hud();
    });
    const shippingActions: HudAction[] = [];
    for (const manifest of game.cmrs.filter(
      (m) => game.contracts[m.id] === "accepted",
    ))
      shippingActions.push({
        key: "fail-" + manifest.id,
        label: "Uznaj " + manifest.id + " za niewykonany · 60 USD",
        run: () => {
          if (game.failContract(manifest.id)) persistProgress();
          else feedback("Najpierw zakończ transport i zwolnij rampę.");
        },
      });
    if (
      game.missingEquipment.length &&
      game.cmrs.every((m) => m.state === "waiting") &&
      game.trucks.every((t) => !t.trip && !game.cargoFor(t.bay).length)
    )
      shippingActions.push({
        key: "prepare",
        label: `Przygotuj sprzęt: ${game.missingEquipment.map((id) => upgrades[id].name).join(", ")}`,
        run: () => {
          if (game.beginDevelopment()) persistProgress();
          else feedback("Zakończ bieżący manewr.");
        },
      });
    if (game.sorterNeedsPlacement)
      shippingActions.push({
        key: "relocate-sorter",
        label: "Ustaw przeniesiony sorter",
        run: beginSorterPlacement,
      });
    syncActions("cmr-actions", placingSorter ? [] : shippingActions);
    renderPhase();
    resizeWorld();
    const cr = game.crates.find((c) => c.id === inspection);
    $("inspect").textContent = cr
      ? `${cr.id} · ${destinationColor(cr)} · wyjazd R${dispatchRound(cr)} · ${cr.temperature} · ${cr.condition}${cr.mix ? " · MIX" : ""}${cr.priority ? ` · premia ×${priorityMultiplier(cr, game.time)} · pozostało ${Math.max(0, Math.ceil(cr.priority.duration - game.time + cr.priority.started))} s` : ""}`
      : "Kliknij paletę, aby sprawdzić jej ID i oznaczenia.";
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-speed]")
    .forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.speed) === game.speed),
    );
}

function renderQueues() {
  const host = $("worker-queues");
  host.replaceChildren();
  for (const [i, worker] of game.workers.entries()) {
    const panel = document.createElement("section");
    panel.classList.toggle("selected", i === game.workerIndex);
    const heading = document.createElement("button");
    const avatar = document.createElement("span");
    avatar.className = "queue-avatar";
    const queue = game.queue(i);
    heading.append(
      avatar,
      "Pracownik " + (i + 1) + " · " + queue.length + "/3",
    );
    heading.onclick = () => {
      focusWorker(i);
      hud();
    };
    panel.append(heading);
    const current = document.createElement("small");
    current.textContent = worker.task
      ? workerStatus(worker) +
        (worker.task.crate ? " · " + worker.task.crate : "")
      : "Wolny";
    panel.append(current);
    for (let j = 0; j < 3; j++) {
      const row = document.createElement("div");
      const job = queue[j];
      row.textContent = j + 1 + " · ";
      if (job) {
        const badge = document.createElement("span");
        badge.className = "queue-pallet";
        row.append(
          badge,
          job.pallet +
            " → " +
            (job.dest.kind === "outbound"
              ? "auto"
              : job.dest.kind === "floor"
                ? job.dest.x + "," + job.dest.y
                : "cel") +
            (job.blocked ? " · czeka" : ""),
        );
        for (const [label, action] of [
          [
            "↑",
            () => {
              if (j) [queue[j - 1], queue[j]] = [queue[j], queue[j - 1]];
            },
          ],
          [
            "×",
            () => {
              queue.splice(j, 1);
            },
          ],
        ] as const) {
          const button = document.createElement("button");
          button.textContent = label;
          button.setAttribute(
            "aria-label",
            label === "↑" ? "Przesuń zadanie wyżej" : "Usuń zadanie",
          );
          button.onclick = () => {
            action();
            persistProgress();
            hud();
          };
          row.append(button);
        }
      } else row.append("—");
      panel.append(row);
    }
    host.append(panel);
  }
}
function statGroup(title: string, rows: [string, number, string?][]) {
  const section = document.createElement("section");
  const h = document.createElement("h2");
  h.textContent = title;
  const list = document.createElement("dl");
  for (const [label, value, unit] of rows) {
    const term = document.createElement("dt");
    const amount = document.createElement("dd");
    term.textContent = label;
    amount.textContent = `${Number(value.toFixed(2))}${unit ?? ""}`;
    if (label === "Wynik netto" || label === "Saldo po rundzie") {
      term.classList.add("receipt-total");
      amount.classList.add("receipt-total");
    }
    list.append(term, amount);
  }
  section.append(h, list);
  return section;
}
function renderBriefing(round: number) {
  const plan = campaign[round - 1];
  const demand = campaign
    .slice(0, round)
    .flatMap((r) => [
      ...r.pallets.filter((p) => !p.mix),
      ...r.recipes.flatMap((r) => r.outputs),
    ])
    .filter((p) => dispatchRound(p) === round);
  function section(
    title: string,
    detail: string,
    colors: readonly string[] = [],
  ) {
    const panel = document.createElement("section");
    const header = document.createElement("h2");
    const count = document.createElement("p");
    header.textContent = title;
    count.textContent = detail;
    panel.append(header, count);
    for (const color of colors) {
      const icon = document.createElement("img");
      icon.src = "./assets/cargo/box/" + color + ".png";
      icon.alt = color;
      panel.append(icon);
    }
    return panel;
  }
  const fleet = game.fleetCapacity;
  const capacity = Math.max(4, ...fleet);
  const special = [
    ["MIX", plan.pallets.filter((p) => p.mix).length],
    [
      "Chłodnia",
      plan.pallets.filter((p) => p.temperature === "chilled").length,
    ],
    ["Mroźnia", plan.pallets.filter((p) => p.temperature === "frozen").length],
    ["Priorytet", plan.pallets.filter((p) => p.prioritySeconds).length],
    [
      "Uszkodzenia",
      plan.pallets.filter((p) => p.condition === "damaged").length,
    ],
    ["Zwroty", plan.pallets.filter((p) => p.condition === "return").length],
  ] as const;
  const requirements = section(
    "Specjalne wymagania",
    special.some(([, n]) => n) ? "" : "Brak",
  );
  const icons = ["mix", "chilled", "frozen", "priority", "damaged", "return"];
  special.forEach(([name, n], i) => {
    if (!n) return;
    const badge = document.createElement("span");
    const icon = document.createElement("img");
    icon.src = "./assets/cargo/overlay/" + icons[i] + ".png";
    icon.alt = "";
    badge.append(icon, name + " ×" + n);
    requirements.append(badge);
  });
  $("totals").replaceChildren(
    section(
      "Przyjazdy",
      plan.arrivals.length + " transportów · " + plan.pallets.length + " palet",
      plan.pallets.map((p) => p.destinationColor),
    ),
    section(
      "Wysyłki",
      demand.length +
        " palet · minimum " +
        Math.ceil(demand.length / capacity) +
        " kursów przy " +
        capacity +
        " paletach na kurs",
      demand.map((p) => p.destinationColor),
    ),
    requirements,
  );
  const load = section(
    "Obciążenie magazynu",
    "Obecnie " +
      game.stock.length +
      " · na koniec następnej rundy " +
      plan.expectedStock +
      " palet",
  );
  $("totals").append(load);
  const names: Record<string, string> = {
    stock: "Dodatkowe zatowarowanie",
    express: "Ekspres",
    cold: "Chłodnia",
    frozen: "Mroźnia",
    service: "Serwis",
  };
  for (const offer of game.offers(round)) {
    const count = offer.pallets.length;
    const panel = section(
      names[offer.type],
      count +
        " palet · wysyłka R" +
        round +
        " · do " +
        count +
        " pól · obsługa podstawowa " +
        count * 19 +
        " USD · premia " +
        (count * 3 + 25) +
        " USD · kara 60 USD",
      offer.pallets.map((p) => p.destinationColor),
    );
    const decision = game.contracts[offer.id];
    if (decision)
      panel.append(decision === "accepted" ? "Przyjęto" : "Odrzucono");
    else
      for (const accept of [true, false]) {
        const button = document.createElement("button");
        button.textContent = accept ? "Przyjmij" : "Odrzuć";
        button.onclick = () => {
          if (game.decideContract(offer.id, accept)) persistProgress();
          hud();
        };
        panel.append(button);
      }
    $("totals").append(panel);
  }
}
function renderTruckControls() {
  const canvas = renderer.canvas;
  const host = $("truck-controls");
  const active = game.status === "playing" && !placingSorter && !placingCold;
  const actions: HudAction[] = [];
  if (active)
    for (const truck of game.trucks) {
      if (
        !["docked", "in-transit", "departing", "arriving"].includes(truck.state)
      )
        continue;
      const quote = quoteDelivery(game.cargoFor(truck.bay));
      const ready = truck.state === "docked";
      actions.push({
        key: truck.id,
        label: ready
          ? quote
            ? "Wyślij · " + quote.seconds + " s · " + quote.cost + " USD"
            : "Wyślij"
          : truck.state === "arriving"
            ? "Cofa pod rampę"
            : "W trasie · " +
              Math.max(
                0,
                Math.ceil((truck.trip?.returnAt ?? game.time) - game.time),
              ) +
              " s",
        reason: ready ? (quote ? undefined : "Brak ładunku") : undefined,
        run: () => {
          if (ready && game.dispatchBay(truck.bay)) {
            persistProgress();
            feedback("Samochód wyjeżdża.");
          } else if (ready) feedback("Zakończ załadunek i zwolnij rampę.");
        },
      });
    }
  const signature = JSON.stringify(
    actions.map(({ key, label, reason }) => [key, label, reason]),
  );
  if (host.dataset.signature !== signature) {
    host.dataset.signature = signature;
    syncActions("truck-controls", actions);
  }
  for (const button of host.querySelectorAll("button")) {
    const truck = game.trucks.find((t) => t.id === button.dataset.action)!;
    const point = renderer.gridToScreen({
      x:
        cfg.map.columns +
        truck.capacity / 4 +
        (truck.state === "arriving" ? truck.timer * GRAPHICS.vehicleTravel : 0),
      y: game.rampRow(truck.bay) + 2.22,
    });
    button.style.left = point.x + "px";
    button.style.top = point.y + "px";
    button.hidden =
      point.x < 0 ||
      point.x > canvas.width ||
      point.y < 0 ||
      point.y >= canvas.height;
    button.disabled = truck.state !== "docked";
  }
}
function renderPhase() {
  const end = $("end") as HTMLDialogElement;
  if (game.status === "playing" || placingSorter || placingCold) {
    if (end.open) end.close();
    return;
  }
  const shop = game.status === "development";
  const briefing = game.status === "summary" && game.round < campaign.length;
  end.classList.toggle("briefing", briefing);
  const summary = game.settlement ?? game.roundReport();
  $("end-title").textContent = briefing
    ? "Odprawa · runda " + (game.round + 1)
    : shop
      ? "Inwestycje magazynu"
      : game.status === "won"
        ? "Kampania ukończona"
        : game.status === "lost"
          ? "Bankructwo"
          : `Bilans rundy ${game.round}`;
  end.classList.toggle("investments", shop);
  $("end-text").textContent = shop
    ? `Runda ${game.developmentRound} · Saldo ${game.cash.toFixed(0)} $${game.pendingWorkers.length ? ` · Nowi pracownicy od startu: ${game.pendingWorkers.length}` : ""}`
    : game.status === "lost"
      ? "Brak środków na dalszą pracę."
      : game.config.name;
  $("totals").replaceChildren();
  if (briefing) renderBriefing(game.round + 1);
  else if (!shop) {
    const revenue: [string, number, string?][] = summary.revenue.map(
      ([name, amount]) => [name, amount, " USD"],
    );
    if (summary.bonus)
      revenue.push(["Premie i korekty priorytetu", summary.bonus, " USD"]);
    revenue.push(["Suma przychodów", summary.totalRevenue, " USD"]);
    const expenses: [string, number, string?][] = [];
    if (summary.wages)
      expenses.push([
        `Pracownicy · ${summary.workers} × ${cfg.economy.workerWagePerRound} USD`,
        summary.wages,
        " USD",
      ]);
    if (summary.ramps)
      expenses.push([
        `Rampy · ${summary.rampCount} × ${cfg.economy.rampCostPerRound} USD`,
        summary.ramps,
        " USD",
      ]);
    for (const trip of summary.trips)
      expenses.push([
        `Kurs ${trip.id}${trip.vehicleId ? ` · ${trip.vehicleId}` : ""} · ${trip.palletIds.length} palet · ${trip.colors.length} kol. (${trip.colors.map((color) => recipientNames[color]).join(", ")}) · ${trip.seconds} s`,
        trip.cost,
        " USD",
      ]);
    if (summary.transport)
      expenses.push(["Łącznie transport", summary.transport, " USD"]);
    for (const [name, amount] of summary.operatingExpenses ?? [])
      expenses.push([name, amount, " USD"]);
    expenses.push(["Suma kosztów", summary.totalCosts, " USD"]);
    const logistics: [string, number][] = [
      ["Przyjęto", summary.received],
      ["Wysłano", summary.sent],
      ["Pozostało", summary.stock],
      ["Dostawy CMR", summary.arrivals],
      ["Rozsortowane MIX", summary.mixed],
      ["Przyjęte chłodzone", summary.chilled],
      ["Przyjęte mrożone", summary.frozen],
      ["Uszkodzenia", summary.damaged],
      ["Zwroty", summary.returns],
      ["Palety priorytetowe", summary.priority],
    ];
    $("totals").append(
      statGroup("Przychody", revenue),
      statGroup("Koszty", expenses),
      statGroup("Wynik", [
        ["Saldo przed rundą", summary.before, " USD"],
        ["Przychody", summary.totalRevenue, " USD"],
        ["Koszty", summary.totalCosts, " USD"],
        ["Wynik netto", summary.net, " USD"],
        ["Saldo po rundzie", summary.cash, " USD"],
      ]),
      statGroup(
        "Magazyn",
        logistics.filter(([, value]) => value !== 0),
      ),
    );
  }
  $("upgrades").hidden = !shop;
  if (shop) {
    renderInvestmentCards();
    const vehicleActions: HudAction[] = Array.from(
      { length: game.ownedVehicleCount },
      (_, index) => ({
        key: `expand-vehicle-${index}`,
        label: `Własny ${index + 1} · ${game.fleetCapacity[index]} palet${game.plannedFleet[index] !== game.fleetCapacity[index] ? ` → ${game.plannedFleet[index]} od kolejnej rundy` : ""} · +2 PALETY – 150 USD`,
        reason: game.vehiclePurchaseReason(index),
        run: () => {
          if (game.buyVehicle(index)) persistProgress();
        },
      }),
    );
    vehicleActions.push({
      key: "buy-vehicle",
      label:
        "Nowy samochód – 600 USD · 4 palety · możliwość rozbudowy · wymaga 2 ramp wysyłkowych",
      reason: game.vehiclePurchaseReason(),
      run: () => {
        if (game.buyVehicle()) persistProgress();
      },
    });
    syncActions("vehicle-investments", vehicleActions);
    const equipment = ["service", "freezer", "climate"] as const;
    syncActions(
      "equipment-actions",
      equipment.map((key) => ({
        key,
        label: upgrades[key].name + " · " + upgrades[key].cost + " USD",
        reason: game.upgradeUnavailable(key),
        run: () => {
          if (game.buy(key)) persistProgress();
          else feedback(game.message);
        },
      })),
    );
  }
  const missing = requiredUpgrades.filter(
    (id) =>
      !game.purchased.includes(id) &&
      upgrades[id].round <= game.developmentRound,
  );
  if (shop && missing.length && !$("shop-message").textContent)
    $("shop-message").textContent =
      `Potrzebne w nadchodzącej rundzie: ${missing.map((id) => upgrades[id].name).join(", ")}`;
  $("development").textContent = "Przejdź do inwestycji";
  $("development").hidden = game.status !== "summary";
  $("continue").hidden = !shop;
  $("continue").textContent = `Rozpocznij rundę ${game.developmentRound}`;
  if (!end.open) {
    end.showModal();
    if (
      game.status === "summary" ||
      game.status === "won" ||
      game.status === "lost"
    )
      persistProgress();
  }
}
if (dev) {
  $("lab").hidden = false;
  $("dev-panel").hidden = false;
  Object.assign(window, {
    pixelhub: {
      get game() {
        return game;
      },
      renderer,
      app,
      sceneSprite,
      texture,
      clickCell: (x: number, y: number) =>
        clickAt(renderer.gridToScreen({ x: x + 0.5, y: y + 0.5 })),
      save,
      load,
      replace: (g: CampaignGame) => (game = g),
    },
  });
  $("dev-round").replaceChildren(
    ...campaign.map((r) => {
      const o = document.createElement("option");
      o.value = String(r.number);
      o.textContent = `${r.number}. ${r.name}`;
      return o;
    }),
  );
  $("dev-jump").onclick = async () => {
    busy = true;
    try {
      const { loadScenario } = await import("./scenarios.ts");
      game = await loadScenario(
        Number(($("dev-round") as HTMLSelectElement).value),
        (message) => {
          $("dev-status").textContent = message;
        },
      );
      game.dev = true;
      ($("end") as HTMLDialogElement).close();
    } catch (e) {
      $("dev-status").textContent = String(e);
    } finally {
      busy = false;
      last = performance.now();
    }
  };
  $("dev-finish").onclick = async () => {
    busy = true;
    try {
      const { solveRound } = await import("./developer.ts");
      await solveRound(game, (m) => {
        $("dev-status").textContent = m;
      });
    } catch (e) {
      $("dev-status").textContent = String(e);
    } finally {
      busy = false;
      last = performance.now();
    }
  };
  $("dev-balance").onclick = () => {
    try {
      game.assertInvariant();
      $("dev-status").textContent = JSON.stringify({
        stock: game.stock.length,
        expected: game.config.expectedStock,
        cmrs: game.cmrs.map((m) => [m.id, m.state]),
        processing: game.crates
          .filter((c) => c.loc.kind === "processing")
          .map((c) => c.id),
      });
    } catch (e) {
      $("dev-status").textContent = String(e);
    }
  };
}
function frame(now: number) {
  if (!busy && !placingSorter) game.advance(Math.min(0.2, (now - last) / 1000));
  last = now;
  renderer.scene.selectedCmr = chosenCmr;
  renderer.scene.sorterPreview = placingSorter;
  if (!placingCold) renderer.scene.coldPreview = null;
  renderer.draw(game);
  if (
    app.screen.height !== renderer.surface.height ||
    app.screen.width !== renderer.surface.width
  ) {
    app.renderer.resize(renderer.surface.width, renderer.surface.height);
    texture.source.resize(renderer.surface.width, renderer.surface.height);
    texture.frame.width = renderer.surface.width;
    texture.frame.height = renderer.surface.height;
    texture.orig.width = renderer.surface.width;
    texture.orig.height = renderer.surface.height;
    texture.update();
    sceneSprite.width = renderer.surface.width;
    sceneSprite.height = renderer.surface.height;
  }
  texture.source.update();
  renderTruckControls();
  if (($("graphics-panel") as HTMLDetailsElement).open) updatePreview();
  hud();
  if (now - lastSave > 5000 && !busy && autosaveEnabled) {
    lastSave = now;
    try {
      localStorage.setItem(saveKey, serialize(game));
    } catch (e) {
      saveError = String(e);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener("beforeunload", () => {
  if (autosaveEnabled && !busy)
    try {
      localStorage.setItem(saveKey, serialize(game));
    } catch {}
});
