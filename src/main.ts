import { Application, Sprite, Texture } from "pixi.js";
import { Game } from "./simulation.ts";
import {
  Renderer,
  screenToGrid,
  locationPoint,
  workerVisual,
  gridToScreen,
  TILE,
} from "./renderer.ts";
const $ = (id: string) => document.getElementById(id)!;
let game = new Game();
game.assertInvariant();
const renderer = new Renderer($("world") as HTMLCanvasElement);
const app = new Application();
await app.init({
  canvas: renderer.canvas,
  width: 1400,
  height: 650,
  backgroundAlpha: 0,
  antialias: false,
  resolution: 1,
});
const texture = Texture.from(renderer.surface);
texture.source.scaleMode = "nearest";
app.stage.addChild(new Sprite(texture));
// Exposed only with ?test for deterministic browser acceptance checks.
if (new URLSearchParams(location.search).has("test"))
  Object.assign(window, {
    pixelhub: {
      get game() {
        return game;
      },
      renderer,
      clickCell: (x: number, y: number) =>
        clickAt(gridToScreen({ x: x + 0.5, y: y + 0.5 })),
    },
  });
function clickAt(p: { x: number; y: number }) {
  if (game.status !== "playing") return;
  const cell = screenToGrid(p);
  // Once the source is chosen, every click is a destination attempt,
  // including the cell currently occupied by the worker.
  if (game.selected && (game.source || game.carried) && !game.task) {
    if (cell.x >= 20 && cell.x <= 21 && cell.y >= 2 && cell.y <= 3)
      game.order({ kind: "outbound", lane: cell.y - 2, depth: cell.x - 20 });
    else game.order({ kind: "floor", ...cell });
    return;
  }
  const h = gridToScreen(workerVisual(game).head);
  if (
    Math.abs(p.x - h.x - TILE / 2) < TILE / 2 &&
    Math.abs(p.y - h.y - TILE / 2) < TILE / 2
  ) {
    game.selectWorker();
    return;
  }
  const crate = game.crates.find((c) => {
    const q = locationPoint(c.loc);
    return q && q.x === cell.x && q.y === cell.y;
  });
  if (crate) game.choose(crate.id);
}
$("world").addEventListener("click", (event) => clickAt(renderer.point(event)));
$("cmr").onclick = () => game.accept();
$("cancel").onclick = () => game.cancel();
$("dispatch").onclick = () => game.dispatch();
$("debug").onclick = () => (renderer.debug = !renderer.debug);
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "g") renderer.debug = !renderer.debug;
  if (e.key === "Escape") game.cancel();
});
document
  .querySelectorAll<HTMLButtonElement>("[data-speed]")
  .forEach((b) => (b.onclick = () => (game.speed = Number(b.dataset.speed))));
$("continue").onclick = () => {
  game.nextRound();
  ($("end") as HTMLDialogElement).close();
};
$("restart").onclick = () => {
  game = new Game();
  ($("end") as HTMLDialogElement).close();
};
function hud() {
  $("cash").textContent = `${game.cash} $`;
  $("round").textContent = `Runda ${game.round}/2`;
  $("round-name").textContent =
    game.round === 1 ? "Rozładunek i magazynowanie" : "Pierwsza dystrybucja";
  $("clock").textContent =
    `${String(Math.floor(game.time / 60)).padStart(2, "0")}:${String(Math.floor(game.time % 60)).padStart(2, "0")}`;
  $("message").textContent = game.message;
  $("cancel").hidden = !game.selected;
  $("cmr").hidden = game.inbound !== "waiting";
  document.querySelectorAll("#cmr .crate").forEach((e) => {
    e.textContent = game.round === 1 ? "1" : "";
    (e as HTMLElement).style.opacity = game.round === 1 ? ".65" : "1";
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-speed]")
    .forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.speed) === game.speed),
    );
  const inBus = game.crates.filter((c) => c.loc.kind === "outbound").length;
  $("dispatch").hidden =
    game.outbound !== "docked" ||
    !inBus ||
    game.vehicleOccupied("outbound") ||
    game.task?.dest.kind === "outbound" ||
    game.crates.some(
      (c) => c.id === game.task?.crate && c.loc.kind === "outbound",
    );
  $("delivery").hidden = game.outbound !== "delivering";
  $("delivery").textContent =
    `Powrót za ${Math.ceil(game.deliveryRemaining)} s`;
  $("objective").textContent =
    game.round === 1
      ? "Rozładuj. Odłóż. Zorganizuj."
      : "Załaduj. Wyślij. Dostarcz.";
  $("progress").textContent =
    game.round === 1
      ? `${game.crates.filter((c) => c.loc.kind === "floor").length} / 4 skrzyń odłożonych · +10 $ rozładunek · +5 $ przechowanie`
      : `${game.crates.filter((c) => c.loc.kind === "delivered").length} / 8 skrzyń dostarczonych · +20 $ za dostawę`;
  const last = game.ledger.at(-1)!;
  $("transaction").textContent =
    `${last.label} ${last.amount > 0 ? "+" : ""}${last.amount} $`;
  const end = $("end") as HTMLDialogElement;
  if (game.status !== "playing" && !end.open) {
    $("end-title").textContent =
      game.status === "lost"
        ? "Bankructwo"
        : game.status === "summary"
          ? "Pierwsza runda ukończona!"
          : "Koniec wersji demonstracyjnej";
    $("end-text").textContent =
      game.status === "lost"
        ? "Saldo spadło do zera. Magazyn wstrzymał pracę. Spróbuj ponownie."
        : game.status === "summary"
          ? "Cztery skrzynie bezpiecznie czekają na dystrybucję. W rundzie 2 otrzymasz bezpłatnego busa i kolejną dostawę."
          : "Wszystkie 8 skrzyń dostarczono. Bus wrócił pusty. Dobra robota!";
    $("totals").replaceChildren();
    for (const label of ["Rozładunek", "Przechowanie", "Dostawa", "Pensja"]) {
      const row = document.createElement("div");
      row.textContent = `${label}: ${game.ledger.filter((e) => e.label === label).reduce((s, e) => s + e.amount, 0)} $`;
      $("totals").append(row);
    }
    $("continue").hidden = game.status !== "summary";
    end.showModal();
  }
}
let last = performance.now();
function frame(now: number) {
  game.advance((now - last) / 1000);
  last = now;
  renderer.draw(game);
  texture.source.update();
  hud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
