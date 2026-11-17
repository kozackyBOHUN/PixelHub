import type { Crate, Location } from "../src/simulation.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { CampaignGame, quoteDelivery } from "../src/campaign-game.ts";
import {
  drain,
  prepareRound,
  solveRound,
  storageCandidates,
} from "../src/developer.ts";
import { serialize, restore } from "../src/save.ts";

test("one physical delivery of eight pallets, two monochrome truck trips, automatic settlement", async () => {
  const game = new CampaignGame(true);
  assert.equal(game.cash, 0);
  assert.equal(game.status, "playing");
  assert.equal(game.workers.length, 1);
  assert.equal(game.shippingAt()?.capacity, 4);
  assert.equal(game.cmrs.length, 1);
  assert.equal(game.cmrs[0].capacity, 8);
  assert.equal(game.clean(game.clutter[0]), false);
  const pallets = game.config.pallets.map((p) =>
    game.createPallet(p, { kind: "floor", x: 4, y: 3 }),
  );
  assert.equal(pallets.filter((p) => p.color === "red").length, 4);
  assert.equal(pallets.filter((p) => p.color === "blue").length, 4);
  assert.deepEqual(
    quoteDelivery([pallets[0], pallets[1], pallets[4], pallets[5]]),
    { colors: ["red", "blue"], seconds: 45, cost: 45 },
  );
  await solveRound(game);
  assert.equal(game.status, "summary");
  assert.equal(game.shipped.length, 8);
  assert.deepEqual(
    game.tripHistory.map((trip) => [trip.seconds, trip.cost]),
    [
      [30, 30],
      [30, 30],
    ],
  );
  assert.equal(
    game.ledger.filter(
      (entry) => entry.label === "Rozliczenie pierwszego zlecenia",
    ).length,
    1,
  );
  assert.ok(game.cash > 0);
});

test("worker travels to clear a blocked tile and the clearing survives save and load", async () => {
  const game = new CampaignGame(true);
  await solveRound(game);
  prepareRound(game);
  const target = game.clutter[0];
  const cash = game.cash;
  assert.equal(game.free()(target), false);
  assert.ok(game.clean(target));
  assert.ok(game.task);
  const restored = restore(serialize(game));
  drain(restored);
  restored.step(0.05);
  assert.equal(restored.cash, cash - 5);
  assert.equal(restored.isClutter(target), false);
  assert.equal(restored.free()(target), true);
  assert.equal(restore(serialize(restored)).isClutter(target), false);
});

test("optional history survives reload and Henryk returns after physical fulfilment", async () => {
  let game = new CampaignGame(true);
  while (game.round < 3) {
    await solveRound(game);
    prepareRound(game);
  }
  await solveRound(game);
  const first = "STORY-pieczywo";
  assert.equal(
    game.offers(9).some((offer) => offer.id === "STORY-piekarnia-stale"),
    false,
  );
  const refusing = restore(serialize(game));
  assert.ok(refusing.decideContract(first, false));
  prepareRound(refusing);
  assert.equal(
    refusing.cmrs.some((cmr) => cmr.id === first),
    false,
  );
  await solveRound(refusing);
  assert.equal(refusing.status, "summary");
  assert.ok(game.decideContract(first, true));
  prepareRound(game);
  assert.ok(game.cmrs.some((cmr) => cmr.id === first));
  await solveRound(game);
  assert.equal(game.contracts[first], "fulfilled");
  game = restore(serialize(game));
  assert.equal(game.storyHistory[first + ":offered"], 3);
  assert.equal(game.storyHistory[first + ":fulfilled"], 4);
  assert.ok(
    game.offers(9).some((offer) => offer.id === "STORY-piekarnia-stale"),
  );
});

test("season victory and continued operation keep the company intact", async () => {
  const game = new CampaignGame(true);
  game.round = 30;
  game.startRound();
  game.status = "won";
  game.levels.storage = 3;
  game.fleetCapacity = [6];
  game.money(900, "fixture");
  game.noteStory("client:henryk", 3);
  const saved = restore(serialize(game));
  assert.ok(saved.beginDevelopment());
  saved.nextRound();
  assert.equal(saved.round, 31);
  assert.equal(saved.cash, 900);
  assert.equal(saved.levels.storage, 3);
  assert.equal(saved.trucks[0].capacity, 6);
  assert.equal(saved.storyHistory["client:henryk"], 3);
  const restored = restore(serialize(saved));
  assert.deepEqual(restored.config, saved.config);
  await solveRound(restored);
  assert.equal(restored.status, "summary");
  assert.ok(restored.beginDevelopment());
  restored.nextRound();
  assert.equal(restored.round, 32);
});
test("two physically loaded mixed trips cost 90 USD in total", () => {
  const game = new CampaignGame(true);
  function move(crate: Crate, dest: Location) {
    game.selectWorker();
    if (!game.choose(crate.id) || !game.order(dest)) {
      game.source = null;
      return false;
    }
    drain(game);
    return true;
  }
  assert.ok(game.dockCMR(game.cmrs[0].id));
  game.step(1.1);
  for (let index = 0; index < 8; index++) {
    assert.ok(
      game.crates.some(
        (crate) =>
          crate.loc.kind === "inbound" &&
          game.accessible(crate.loc) &&
          storageCandidates(game, crate).some(
            (cell) =>
              game.storage(cell) && move(crate, { kind: "floor", ...cell }),
          ),
      ),
      game.message,
    );
  }
  assert.equal(game.cash, 40);
  for (let trip = 0; trip < 2; trip++) {
    for (const [index, color] of ["red", "blue", "red", "blue"].entries()) {
      assert.ok(
        game.crates.some(
          (crate) =>
            crate.loc.kind === "floor" &&
            crate.color === color &&
            move(crate, {
              kind: "outbound",
              lane: index % 2,
              depth: 1 - Math.floor(index / 2),
              bay: 0,
            }),
        ),
        game.message,
      );
    }
    assert.ok(game.dispatch());
    game.advance(46.1);
  }
  assert.equal(game.status, "summary");
  assert.equal(game.shipped.length, 8);
  assert.deepEqual(
    game.tripHistory.map((trip) => [trip.seconds, trip.cost]),
    [
      [45, 45],
      [45, 45],
    ],
  );
});
