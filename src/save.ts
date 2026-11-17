import { CampaignGame, WarehouseWorker } from "./campaign-game.ts";
import { standardClient } from "./story.ts";
import type { Game } from "./simulation.ts";
const workerKeys = [
  "pose",
  "task",
  "selected",
  "source",
  "carried",
  "highlight",
  "message",
] as const;
const gameKeys = [
  "storyMode",
  "storyHistory",
  "freePlans",
  "clutter",
  "cleaning",
  "round",
  "time",
  "speed",
  "status",
  "crates",
  "ledger",
  "purchased",
  "levels",
  "queues",
  "contracts",
  "thermalBonuses",
  "contractLoads",
  "coldStock",
  "coldCells",
  "cmrs",
  "trucks",
  "tripHistory",
  "tripSequence",
  "fleetCapacity",
  "pendingFleet",
  "sorter",
  "extraSorters",
  "sorterJobs",
  "shipped",
  "pendingWorkers",
  "developmentRound",
  "ledgerStart",
  "roundMetrics",
  "settlement",
  "settled",
  "completedRecipes",
  "roundStarted",
  "roundStartCash",
  "operations",
  "workerIndex",
] as const;
function fields(obj: object, keys: readonly string[]) {
  return Object.fromEntries(
    keys.map((k) => [k, (obj as Record<string, unknown>)[k]]),
  );
}
function checksum(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
export const SAVE_KEY = "pixelhub-0.3-balance-campaign";
export function serialize(game: CampaignGame) {
  game.assertInvariant();
  const payload = JSON.stringify({
    game: fields(game, gameKeys),
    workers: game.workers.map((w) => fields(w, workerKeys)),
  });
  return JSON.stringify({
    version: game.storyMode ? 10 : 9,
    checksum: checksum(payload),
    payload,
  });
}
export function restore(raw: string): CampaignGame {
  try {
    const envelope = JSON.parse(raw);
    if (
      ![8, 9, 10].includes(envelope.version) ||
      typeof envelope.payload !== "string" ||
      checksum(envelope.payload) !== envelope.checksum
    )
      throw Error("wersja lub suma kontrolna");
    const parsed = JSON.parse(envelope.payload),
      saved = parsed.game;
    if (
      !saved ||
      !Array.isArray(parsed.workers) ||
      parsed.workers.length < 1 ||
      parsed.workers.length > 4 ||
      !Number.isSafeInteger(saved.round) ||
      saved.round < 1 ||
      (saved.round > 30 &&
        !(envelope.version === 10 && saved.storyMode === true)) ||
      !Number.isFinite(saved.time) ||
      saved.time < 0 ||
      !["playing", "summary", "development", "won", "lost"].includes(
        saved.status,
      ) ||
      !Array.isArray(saved.crates) ||
      !Array.isArray(saved.ledger) ||
      !Array.isArray(saved.purchased) ||
      !Array.isArray(saved.cmrs) ||
      !Array.isArray(saved.settled) ||
      !Array.isArray(saved.completedRecipes)
    )
      throw Error("schemat");
    if (
      !saved.levels ||
      !["receiving", "storage", "shipping"].every(
        (zone) =>
          Number.isSafeInteger(saved.levels[zone]) &&
          saved.levels[zone] >= 1 &&
          saved.levels[zone] <= 47,
      )
    )
      throw Error("Poziomy magazynu");
    if (saved.roundMetrics && !Array.isArray(saved.roundMetrics.priorityIds))
      saved.roundMetrics.priorityIds = [];
    if (
      !Array.isArray(saved.trucks) ||
      !Array.isArray(saved.shipped) ||
      !Array.isArray(saved.pendingWorkers) ||
      saved.pendingWorkers.length + parsed.workers.length > 4 ||
      (saved.status === "development" &&
        ![saved.round, saved.round + 1].includes(saved.developmentRound))
    )
      throw Error("stan wysyłek lub rozwoju");
    const game = new CampaignGame();
    for (const k of gameKeys)
      if (k in saved)
        (game as unknown as Record<string, unknown>)[k] = saved[k];
    for (const offer of Object.values(game.contractLoads)) {
      const data = offer as unknown as Record<string, unknown>;
      if (typeof data.bonus !== "number")
        data.bonus = 3 * offer.pallets.length + 25;
      if (typeof data.penalty !== "number") data.penalty = 60;
      if (!data.client) {
        const match = /^CMR-(\d+)-SPEC-(\d+)$/.exec(offer.id);
        if (match)
          data.client = standardClient(Number(match[1]), Number(match[2]) - 1);
      }
    }
    if (envelope.version === 8 && game.purchased.includes("chiller"))
      game.coldCells = (
        game.purchased.includes("climate") ? [-4, -1, -8, -5] : [-4, -1]
      )
        .flatMap((y) => [4, 5, 6, 7].map((x) => ({ x, y })))
        .filter((p) => game.contains(p));
    game.workers = [
      game,
      ...parsed.workers.slice(1).map(() => new WarehouseWorker(game)),
    ];
    for (const [i, record] of parsed.workers.entries()) {
      if (
        !record.pose ||
        ![record.pose.x, record.pose.y, record.pose.d].every(Number.isFinite)
      )
        throw Error("pracownik");
      const w = game.workers[i];
      for (const k of workerKeys)
        (w as unknown as Record<string, unknown>)[k] = record[k];
      w.crates = game.crates;
      w.time = game.time;
      w.status = "playing";
    }
    // Primary worker is also campaign container, so restore its campaign status.
    game.status = saved.status;
    if (
      !game.ledger.every(
        (e) => Number.isFinite(e.amount) && Number.isFinite(e.time),
      ) ||
      !Number.isInteger(game.workerIndex) ||
      game.workerIndex < 0 ||
      game.workerIndex >= game.workers.length
    )
      throw Error("ekonomia/wybór");
    game.syncVehicles();
    game.assertInvariant();
    return game;
  } catch (error) {
    throw Error(
      `Nie można wczytać zapisu PixelHub 0.3: ${error instanceof Error ? error.message : "uszkodzone dane"}. Zapis nie został nadpisany.`,
    );
  }
}
