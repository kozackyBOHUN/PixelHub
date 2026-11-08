import { Application, Sprite, Texture } from "pixi.js";
import { CampaignGame } from "./campaign-game.ts";
import { Renderer, locationPoint } from "./renderer.ts";
import { campaign, upgrades, priorityMultiplier } from "./campaign.ts";
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
function save() {
  try {
    localStorage.setItem(saveKey, serialize(game));
    saveError = "Zapisano grę.";
    setTimeout(() => (saveError = ""), 2500);
  } catch (error) {
    saveError = String(error);
  }
}
function load() {
  try {
    const raw = localStorage.getItem(saveKey);
    if (raw) {
      game = restore(raw);
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
function clickAt(p: { x: number; y: number }) {
  if (game.status !== "playing" || busy) return;
  const cell = renderer.screenToGrid(p),
    w = game.activeWorker;
  if (w.selected && (w.source || w.carried) && !w.task) {
    const bay = cell.y < 0 ? 1 : 0,
      base = bay ? -4 : 2;
    if (cell.x >= 20 && cell.x <= 23 && cell.y >= base && cell.y < base + 2)
      w.order({
        kind: "outbound",
        lane: cell.y - base,
        depth: cell.x - 20,
        bay,
      });
    else w.order({ kind: "floor", ...cell });
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
      game.workerIndex = i;
      worker.selectWorker();
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
    w.choose(c.id);
  }
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
$("continue").onclick = () => {
  game.nextRound();
  ($("end") as HTMLDialogElement).close();
  save();
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") game.activeWorker.cancel();
  if (e.key.toLowerCase() === "g") renderer.debug = !renderer.debug;
});
document
  .querySelectorAll<HTMLButtonElement>("[data-speed]")
  .forEach((b) => (b.onclick = () => (game.speed = Number(b.dataset.speed))));
function button(text: string, action: () => void, disabled = false) {
  const b = document.createElement("button");
  b.textContent = text;
  b.disabled = disabled;
  b.onclick = action;
  return b;
}
function hud() {
  $("cash").textContent = `${game.cash.toFixed(0)} $`;
  $("round").textContent = `Runda ${game.round}/30`;
  $("round-name").textContent = game.config.name;
  $("clock").textContent =
    `${Math.floor(game.time / 60)}:${String(Math.floor(game.time % 60)).padStart(2, "0")}`;
  const w = game.activeWorker;
  $("message").textContent =
    saveError || (w.task || w.selected ? w.message : game.message);
  $("cancel").hidden = !w.selected;
  $("objective").textContent = game.config.description;
  const received = game.config.arrivals
    .flatMap((m) => m.palletIds)
    .filter((id) =>
      game.crates.some((c) => c.id === id && c.loc.kind !== "inbound"),
    ).length;
  const sent = game.config.departures
    .flatMap((m) => m.palletIds)
    .filter((id) =>
      game.crates.some((c) => c.id === id && c.loc.kind === "delivered"),
    ).length;
  $("progress").textContent =
    `Przyjęcia ${received}/${game.config.pallets.length} · Wydania ${sent}/${game.requiredIds.size} · Stan ${game.stock.length} → cel ${game.config.expectedStock} · Serwis/sortowanie ${game.operations}`;
  $("transaction").textContent =
    `${game.ledger.at(-1)!.label}: ${game.ledger.at(-1)!.amount.toFixed(0)} $ · pensje ${20 * game.workers.length} $ / rundę`;
  const signature = JSON.stringify([
    game.round,
    game.cmrs,
    game.cash,
    game.workers.map((w) => [
      w.transportState,
      w.source,
      w.carried,
      w.selected,
    ]),
    game.workerIndex,
    chosenCmr,
    inspection,
    game.crates
      .filter((c) => c.priority)
      .map((c) => [c.id, priorityMultiplier(c, game.time), c.loc.kind]),
    game.status,
    Math.floor(game.time),
  ]);
  if (signature !== lastHUD) {
    lastHUD = signature;
    $("workers").replaceChildren(
      ...game.workers.map((w, i) =>
        button(
          `${i === game.workerIndex ? "● " : ""}Pracownik ${i + 1} · ${w.transportState}`,
          () => {
            game.workerIndex = i;
            w.selectWorker();
          },
        ),
      ),
    );
    $("cmrs").replaceChildren(
      ...game.cmrs.map((m) => {
        const b = button(
          `${m.kind === "inbound" ? "↓" : "↑"} ${m.id} · ${m.palletIds.length}/${m.capacity} · ${{ waiting: "oczekuje", arriving: "podjeżdża", docked: "podstawiony", departing: "odjeżdża", done: "zakończony" }[m.state]}`,
          () => {
            chosenCmr = m.id;
          },
        );
        b.className = m.kind + (chosenCmr === m.id ? " active" : "");
        return b;
      }),
    );
    const m =
      game.cmrs.find((m) => m.id === chosenCmr) ??
      game.cmrs.find((m) => m.state !== "done");
    $("cmr-actions").replaceChildren();
    $("manifest").textContent = "";
    if (m) {
      const specs = m.palletIds.map(
        (id) =>
          game.crates.find((c) => c.id === id) ??
          game.config.pallets.find((c) => c.id === id) ??
          game.config.recipes
            .flatMap((r) => r.outputs)
            .find((c) => c.id === id),
      );
      $("manifest").textContent =
        `${m.id} · ${m.vehicle} · ${specs.map((c) => (c ? `${c.id}: ${c.color}, wyjazd R${c.dueRound}${"mix" in c && c.mix ? ", MIX" : ""}, ${c.temperature}, ${c.condition}` : "")).join(" | ")}`;
      if (m.kind === "outbound" && m.state === "docked")
        $("cmr-actions").append(
          button("Wycofaj pusty samochód", () =>
            game.withdrawEmptyOutgoing(m.id),
          ),
        );
      for (
        let bay = 0;
        bay <= (game.purchased.includes("ramps") ? 1 : 0);
        bay++
      )
        $("cmr-actions").append(
          button(
            `Podstaw · rampa ${bay + 1}`,
            () => game.dockCMR(m.id, bay),
            m.state !== "waiting" || !!game.cmrAt(m.kind, bay),
          ),
        );
    }
    for (let bay = 0; bay <= (game.purchased.includes("ramps") ? 1 : 0); bay++)
      if (game.cmrAt("outbound", bay)?.state === "docked")
        $("cmr-actions").append(
          button(`Wyślij załadowany samochód · rampa ${bay + 1}`, () => {
            if (!game.dispatchBay(bay))
              game.message =
                "Załaduj pełny manifest CMR i wyprowadź pracowników poza samochód.";
          }),
        );
    $("upgrades").replaceChildren(
      ...Object.entries(upgrades)
        .filter(([, u]) => game.round >= u.round)
        .map(([id, u]) =>
          button(
            `${u.name} · ${u.cost} $${game.purchased.includes(id as Upgrade) && id !== "worker" ? " · kupione" : ""}`,
            () => game.buy(id as Upgrade),
            game.cash <= u.cost ||
              (id !== "worker" && game.purchased.includes(id as Upgrade)) ||
              (id === "worker" && game.workers.length >= 4),
          ),
        ),
    );
    const cr = game.crates.find((c) => c.id === inspection);
    $("inspect").textContent = cr
      ? `${cr.id} · ${cr.color} · wyjazd R${cr.dueRound} · ${cr.temperature} · ${cr.condition}${cr.mix ? " · MIX" : ""}${cr.priority ? ` · premia ×${priorityMultiplier(cr, game.time)} · pozostało ${Math.max(0, Math.ceil(cr.priority.duration - game.time + cr.priority.started))} s` : ""}`
      : "Kliknij paletę, aby sprawdzić jej ID i oznaczenia.";
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-speed]")
    .forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.speed) === game.speed),
    );
  const end = $("end") as HTMLDialogElement;
  if (game.status !== "playing" && !end.open) {
    $("end-title").textContent =
      game.status === "won"
        ? "PixelHub 0.2 — kampania ukończona!"
        : game.status === "lost"
          ? "Bankructwo"
          : `Runda ${game.round} ukończona`;
    $("end-text").textContent =
      game.status === "lost"
        ? "Brak środków na dalszą pracę. Wczytaj zapis lub rozpocznij nową kampanię."
        : `Przyjęto ${received}, wydano ${sent}. Stan magazynu ${game.stock.length}. Wynik rundy ${(game.cash - game.roundStartCash).toFixed(0)} $. ${campaign[game.round]?.description ?? "Wszystkie 696 palet wydane. Magazyn jest pusty."}`;
    $("totals").textContent =
      `Pracownicy ${game.workers.length} · operacje specjalne ${game.operations} · saldo ${game.cash.toFixed(0)} $`;
    $("continue").hidden = game.status !== "summary";
    $("continue").textContent = `Runda ${game.round + 1} →`;
    end.showModal();
  }
}
if (dev) {
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
  if (!busy) game.advance(Math.min(0.2, (now - last) / 1000));
  last = now;
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
