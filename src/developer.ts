import { CampaignGame, station, sorterOutputs } from "./campaign-game.ts";
import type { Upgrade } from "./campaign.ts";
import type { Crate, Location } from "./simulation.ts";
import type { Point } from "./config.ts";
// Developer-only operator. Uses the same choose/order/step path as the mouse UI.
// No cargo positions, ledgers, completion flags or manifests are fabricated.
export function drain(game: CampaignGame) {
  for (let i = 0; i < 50000; i++) {
    if (!game.workers.some((w) => w.task)) {
      game.step(0.05);
      return;
    }
    game.step(0.05);
    if (game.workers.some((w) => w.task?.blocked))
      throw Error(`R${game.round}: trasa zablokowana`);
  }
  throw Error("Przekroczony czas transportu");
}
function move(game: CampaignGame, c: Crate, dest: Location) {
  const w = game.workers[0];
  w.selectWorker();
  if (!w.choose(c.id) || !w.order(dest)) {
    w.source = null;
    return false;
  }
  drain(game);
  game.assertInvariant();
  return true;
}
export function storageCandidates(game: CampaignGame, crate: Crate): Point[] {
  const list: Point[] = [];
  if (crate.temperature && crate.temperature !== "standard") {
    for (const y of [-4, -7])
      for (let x = 1; x < 19; x++)
        if (game.zoneAt({ x, y }) === crate.temperature) list.push({ x, y });
    return list;
  }
  // Three-row gaps and wide side passages preserve axial approach and turning space.
  for (const y of [5, 2, ...(game.minY === 0 ? [0] : []), -2, -9]) {
    if (y < game.minY) continue;
    const xs =
      y === 5
        ? [3, 2, 1, 16, 17, 18]
        : y === 2
          ? Array.from({ length: 12 }, (_, i) => i + 4)
          : y === 0
            ? [2, 3, 16, 17]
            : y === -2
              ? [2, 3, 7, 8, 9, 10, 14, 15, 16, 17]
              : Array.from({ length: 16 }, (_, i) => i + 2);
    for (const x of xs) list.push({ x, y });
  }
  return list;
}
function store(game: CampaignGame, c: Crate) {
  for (const p of storageCandidates(game, c))
    if (game.storage(p) && move(game, c, { kind: "floor", ...p })) return true;
  return false;
}
function special(game: CampaignGame, c: Crate) {
  if (c.condition && c.condition !== "standard")
    return move(game, c, { kind: "floor", ...station.service });
  if (c.mix) return move(game, c, { kind: "floor", ...station.sorter });
  if (c.temperature !== "standard" && !c.climateStored) return store(game, c);
  return false;
}
const mandatory: Upgrade[] = [
  "expansion",
  "sorter",
  "chiller",
  "service",
  "freezer",
  "expansion2",
  "climate",
];
export async function solveRound(
  game: CampaignGame,
  report: (text: string) => void = () => {},
) {
  if (game.status !== "playing") return;
  const round = game.round;
  for (const id of mandatory) {
    const from = {
      expansion: 5,
      sorter: 8,
      chiller: 11,
      service: 13,
      freezer: 16,
      expansion2: 18,
      climate: 22,
    }[id as "expansion"];
    if (game.round >= from && !game.purchased.includes(id) && !game.buy(id))
      throw Error(`R${round}: nie można kupić ${id}, saldo ${game.cash}`);
  }
  let actions = 0;
  for (let guard = 0; guard < 1500 && game.status === "playing"; guard++) {
    report(
      `Runda ${round}: ${actions} operacji, stan ${game.stock.length}, saldo ${game.cash.toFixed(0)} $`,
    );
    if (guard % 4 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    drain(game);
    game.step(1.1);
    game.assertInvariant();
    if (game.status !== "playing") break;
    let changed = false;
    if (!game.cmrAt("outbound")) {
      const m = game.cmrs.find(
        (m) => m.kind === "outbound" && m.state === "waiting",
      );
      if (m) {
        changed = game.dockCMR(m.id) || changed;
        game.step(1.1);
      }
    }
    if (!game.cmrAt("inbound")) {
      const order =
        game.config.testArrivalOrder ?? game.config.arrivals.map((m) => m.id);
      const m = game.cmrs
        .filter((m) => m.kind === "inbound" && m.state === "waiting")
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))[0];
      if (m) {
        changed = game.dockCMR(m.id) || changed;
        game.step(1.1);
      }
    }
    const out = game.cmrAt("outbound");
    if (out?.state === "docked") {
      for (let depth = out.capacity / 2 - 1; depth >= 0 && !changed; depth--)
        for (let lane = 0; lane < 2 && !changed; lane++) {
          if (
            game.slot("outbound", lane, depth) ||
            !game.accessible({ kind: "outbound", lane, depth })
          )
            continue;
          const candidates = out.palletIds
            .map((id) => game.crates.find((c) => c.id === id))
            .filter(
              (c): c is Crate =>
                !!c &&
                ["floor", "inbound"].includes(c.loc.kind) &&
                game.accessible(c.loc),
            );
          for (const c of candidates) {
            if (
              c.condition !== "standard" ||
              c.mix ||
              (c.temperature !== "standard" && !c.climateStored)
            ) {
              if (special(game, c)) {
                changed = true;
                break;
              }
              continue;
            }
            if (move(game, c, { kind: "outbound", lane, depth, bay: 0 })) {
              changed = true;
              break;
            }
          }
        }
      if (game.dispatch()) {
        changed = true;
        game.step(1.1);
      }
    }
    if (!changed) {
      // Service and sort floor cargo before unloading more trucks.
      for (const c of game.crates.filter((c) => c.loc.kind === "floor"))
        if (
          c.mix ||
          c.condition !== "standard" ||
          (c.temperature !== "standard" && !c.climateStored)
        ) {
          if (special(game, c)) {
            changed = true;
            break;
          }
        }
    }
    if (!changed) {
      for (const c of game.crates.filter(
        (c) =>
          c.loc.kind === "floor" &&
          [station.service, ...sorterOutputs].some(
            (p) => "x" in c.loc && p.x === c.loc.x && p.y === c.loc.y,
          ),
      ))
        if (!c.mix && c.condition === "standard" && store(game, c)) {
          changed = true;
          break;
        }
    }
    if (!changed) {
      for (const c of game.crates.filter(
        (c) => c.loc.kind === "inbound" && game.accessible(c.loc),
      )) {
        if (c.mix || c.condition !== "standard") {
          if (special(game, c)) {
            changed = true;
            break;
          }
        } else if (store(game, c)) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) {
      game.step(2);
      if (game.status !== "playing") break;
      throw Error(
        `R${round}: brak bezpiecznego zadania po ${actions} operacjach; CMR ${JSON.stringify(game.cmrs.map((m) => [m.id, m.state]))}. ${game.message}`,
      );
    }
    actions++;
  }
  if (game.status === "playing") throw Error(`R${round}: limit operacji`);
  if (game.status === "lost") throw Error(`R${round}: bankructwo`);
  game.assertInvariant();
  if (game.stock.length !== game.config.expectedStock)
    throw Error("Bilans po fizycznym przejściu");
  report(
    `Runda ${round} ukończona fizycznie: ${actions} operacji, stan ${game.stock.length}.`,
  );
}
export async function replayToRound(
  round: number,
  report: (text: string) => void = () => {},
) {
  if (!Number.isInteger(round) || round < 1 || round > 30)
    throw Error("Wybierz rundę 1–30");
  const game = new CampaignGame();
  game.dev = true;
  while (game.round < round) {
    await solveRound(game, report);
    game.nextRound();
  }
  return game;
}
