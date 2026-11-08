import { CampaignGame, WarehouseWorker } from "./campaign-game.ts";
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
  "round",
  "time",
  "speed",
  "status",
  "crates",
  "ledger",
  "purchased",
  "cmrs",
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
export const SAVE_KEY = "pixelhub-0.2-campaign";
export function serialize(game: CampaignGame) {
  game.assertInvariant();
  const payload = JSON.stringify({
    game: fields(game, gameKeys),
    workers: game.workers.map((w) => fields(w, workerKeys)),
  });
  return JSON.stringify({ version: 2, checksum: checksum(payload), payload });
}
export function restore(raw: string): CampaignGame {
  try {
    const envelope = JSON.parse(raw);
    if (
      envelope.version !== 2 ||
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
      !Number.isInteger(saved.round) ||
      saved.round < 1 ||
      saved.round > 30 ||
      !Number.isFinite(saved.time) ||
      saved.time < 0 ||
      !["playing", "summary", "won", "lost"].includes(saved.status) ||
      !Array.isArray(saved.crates) ||
      !Array.isArray(saved.ledger) ||
      !Array.isArray(saved.purchased) ||
      !Array.isArray(saved.cmrs) ||
      !Array.isArray(saved.settled) ||
      !Array.isArray(saved.completedRecipes)
    )
      throw Error("schemat");
    const game = new CampaignGame();
    for (const k of gameKeys)
      if (k in saved)
        (game as unknown as Record<string, unknown>)[k] = saved[k];
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
      `Nie można wczytać zapisu PixelHub 0.2: ${error instanceof Error ? error.message : "uszkodzone dane"}. Zapis nie został nadpisany.`,
    );
  }
}
