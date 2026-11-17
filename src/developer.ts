import { CampaignGame, station, sorterPorts } from "./campaign-game.ts";
import { requiredUpgrades, upgrades } from "./campaign.ts";
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
    if (crate.temperature === "chilled") return game.coldCells;
    for (const y of [-4, -1, -8, -5])
      for (let x = 1; x < 19; x++)
        if (game.zoneAt({ x, y }) === crate.temperature) list.push({ x, y });
    return list;
  }
  const rows = [
    3,
    game.minY,
    ...Array.from({ length: -game.minY }, (_, i) => -i),
  ];
  for (const y of new Set(rows))
    for (let x = 1; x < 19; x++)
      if (
        game.contains({ x, y }) &&
        game.zoneAt({ x, y }) === "standard" &&
        (y === 3 || (x >= 4 && x <= 15)) &&
        !(y === 0 && x >= 6 && x <= 10 && game.levels.storage > 1) &&
        !game.sorters.some((site) =>
          [site, ...Object.values(sorterPorts(site))].some(
            (p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 2,
          ),
        )
      )
        list.push({ x, y });
  return list;
}
function store(game: CampaignGame, c: Crate) {
  for (const p of storageCandidates(game, c))
    if (
      !game.sorters.some((site) =>
        Object.values(sorterPorts(site)).some(
          (q) => q.x === p.x && q.y === p.y,
        ),
      ) &&
      game.storage(p) &&
      move(game, c, { kind: "floor", ...p })
    )
      return true;
  return false;
}
function special(game: CampaignGame, c: Crate) {
  if (c.condition && c.condition !== "standard")
    return move(game, c, { kind: "floor", ...station.service });
  if (c.mix)
    return (
      !!game.sorter &&
      !(
        c.loc.kind === "floor" &&
        [sorterPorts(game.sorter).input, sorterPorts(game.sorter).input2].some(
          (p) => p.x === (c.loc as Point).x && p.y === (c.loc as Point).y,
        )
      ) &&
      [sorterPorts(game.sorter).input2, sorterPorts(game.sorter).input].some(
        (p) => move(game, c, { kind: "floor", ...p }),
      )
    );
  if (c.temperature !== "standard" && !c.climateStored) return store(game, c);
  return false;
}
function installTrainingSorter(game: CampaignGame) {
  const site = game.findSorterSite();
  return !!site && game.installSorter(site);
}
export function prepareRound(game: CampaignGame) {
  if (game.status === "playing" && !game.missingEquipment.length) return;
  if (!game.beginDevelopment() && game.status !== "development") return;
  if (game.developmentRound >= 5 && game.levels.storage < 2)
    game.buyModule("storage");
  if (game.developmentRound >= 7 && game.levels.storage < 3)
    game.buyModule("storage");
  if (
    game.developmentRound >= 22 &&
    game.cash >= 1040 &&
    game.levels.storage < 4
  )
    game.buyModule("storage");
  for (const id of requiredUpgrades)
    if (
      upgrades[id].round <= game.developmentRound &&
      !game.purchased.includes(id) &&
      !(id === "sorter" ? installTrainingSorter(game) : game.buy(id))
    )
      throw Error(
        `R${game.developmentRound}: nie można kupić ${id}, saldo ${game.cash}`,
      );
  if (game.developmentRound >= upgrades.chiller.round) {
    while (game.coldCells.length + game.coldStock < 8 && game.buyColdPack()) {}
    for (const y of [-4, -1, -8, -5])
      for (const x of [4, 5, 6, 7])
        if (game.coldStock) game.placeColdCell({ x, y });
  }
  game.nextRound();
}
function loadTruck(game: CampaignGame, bay: number) {
  const truck = game.shippingAt(bay);
  if (truck?.state !== "docked") return false;
  const candidates = game.stock.filter(
    (c) =>
      game.canLoad(truck, c) &&
      ["floor", "inbound"].includes(c.loc.kind) &&
      game.accessible(c.loc),
  );
  const loaded = new Set(
    game.cargoFor(bay).map((c) => c.destinationColor ?? c.color),
  );
  const sizes = new Map<string, number>();
  for (const c of candidates) {
    const color = c.destinationColor ?? c.color;
    sizes.set(color, (sizes.get(color) ?? 0) + 1);
  }
  const score = (c: Crate) => {
    const color = c.destinationColor ?? c.color;
    return (loaded.has(color) ? 100 : 0) + (sizes.get(color) ?? 0);
  };
  candidates.sort((a, b) => score(b) - score(a));
  for (let depth = truck.capacity / 2 - 1; depth >= 0; depth--)
    for (let lane = 0; lane < 2; lane++) {
      const dest = { kind: "outbound", lane, depth, bay } as const;
      if (game.slot("outbound", lane, depth, bay) || !game.accessible(dest))
        continue;
      for (const c of candidates) if (move(game, c, dest)) return true;
    }
  return false;
}
export async function solveRound(
  game: CampaignGame,
  report: (text: string) => void = () => {},
) {
  if (game.status !== "playing") return;
  prepareRound(game);
  if (game.storyMode && game.round === 2) {
    for (const cell of [...game.clutter])
      if (game.clean(cell)) {
        drain(game);
        game.step(0.05);
      }
  }
  const round = game.round;
  let actions = 0;
  const relocated = new Set<string>();
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
    if (!changed && loadTruck(game, 0)) {
      relocated.clear();
      changed = true;
    }
    const truck = game.shippingAt();
    if (!changed && truck && game.cargoFor(0).length === truck.capacity)
      changed = game.dispatch();
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
          [
            station.service,
            ...(game.sorter
              ? [
                  sorterPorts(game.sorter).output,
                  sorterPorts(game.sorter).output2,
                ]
              : []),
          ].some((p) => "x" in c.loc && p.x === c.loc.x && p.y === c.loc.y),
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
    if (!changed && game.dispatch()) changed = true;
    if (!changed && truck?.trip) {
      game.step(Math.max(0.05, truck.trip.returnAt - game.time));
      changed = true;
    }
    const job = game.sorterJobs[0];
    if (!changed && job && job.readyAt > game.time) {
      game.step(job.readyAt - game.time + 0.05);
      changed = true;
    }
    if (!changed && game.sorter) {
      const ports = sorterPorts(game.sorter);
      const nearby = game.stock.filter(
        (c) =>
          !c.mix &&
          c.loc.kind === "floor" &&
          Object.values(ports).some(
            (p) =>
              Math.abs(p.x - (c.loc as Point).x) +
                Math.abs(p.y - (c.loc as Point).y) <=
              2,
          ),
      );
      for (const c of nearby)
        if (store(game, c)) {
          changed = true;
          break;
        }
    }
    if (!changed) {
      for (const crate of game.stock) {
        if (
          crate.loc.kind !== "floor" ||
          crate.mix ||
          crate.temperature !== "standard" ||
          relocated.has(crate.id)
        )
          continue;
        const from = crate.loc;
        for (const cell of storageCandidates(game, crate)) {
          if (
            Math.abs(from.x - cell.x) + Math.abs(from.y - cell.y) < 3 ||
            !game.storage(cell) ||
            !move(game, crate, { kind: "floor", ...cell })
          )
            continue;
          relocated.add(crate.id);
          changed = true;
          break;
        }
        if (changed) break;
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
  if (!Number.isInteger(round) || round < 1 || round > 31)
    throw Error("Wybierz rundę 1–31");
  const game = new CampaignGame(true);
  game.dev = true;
  while (game.round < round) {
    await solveRound(game, report);
    prepareRound(game);
  }
  return game;
}
