import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CampaignGame,
  quoteDelivery,
  WarehouseWorker,
} from "../src/campaign-game.ts";
import { restore, serialize } from "../src/save.ts";
import type { DestinationColor } from "../src/shipments.ts";

test("delivery quote depends on distinct destinations, from 30 to 75 seconds", () => {
  const colors: DestinationColor[] = ["red", "blue", "green", "yellow"];
  for (const [index, seconds] of [30, 45, 60, 75].entries()) {
    const destinations = colors.slice(0, index + 1);
    const quote = quoteDelivery(
      destinations.map((destinationColor) => ({
        id: destinationColor,
        destinationColor,
        color: destinationColor,
        active: true,
        paid: true,
        loc: { kind: "delivered" },
      })),
    );
    assert.ok(quote);
    assert.equal(quote.seconds, seconds);
    assert.equal(quote.cost, seconds);
  }
});

test("automatic settlement waits for delivery, bills both courses once, and opens investments", () => {
  let game = new CampaignGame();
  assert.equal(game.shippingAt(), undefined);
  game.round = 2;
  game.startRound();
  const vehicle = game.shippingAt()!.id;
  game.cmrs.forEach((cmr) => (cmr.state = "done"));
  game.money(500, "Stan testowy");
  for (const [index, color] of (["red", "blue", "yellow"] as const).entries()) {
    game.crates.push({
      id: color,
      color,
      destinationColor: color,
      dispatchRound: 2,
      active: true,
      paid: true,
      condition: "standard",
      temperature: "standard",
      loc:
        index === 0
          ? { kind: "outbound", bay: 0, lane: 0, depth: 1 }
          : { kind: "floor", x: index + 1, y: 3 },
    });
  }
  assert.ok(game.dispatchBay());
  assert.equal(game.dispatchBay(), false);
  game.step(29);
  assert.equal(game.status, "playing");
  assert.equal(game.shipped.length, 0);
  game = restore(serialize(game));
  game.step(2.2);
  game.step(1.1);
  assert.equal(game.shippingAt()?.id, vehicle);
  assert.deepEqual(game.shipped, ["red"]);
  for (const [lane, color] of (["blue", "yellow"] as const).entries())
    game.crates.find((c) => c.id === color)!.loc = {
      kind: "outbound",
      bay: 0,
      lane,
      depth: 1,
    };
  assert.ok(game.dispatchBay());
  for (let i = 0; i < game.config.expectedStock; i++)
    game.crates.push({
      id: "held-" + i,
      color: "red",
      dispatchRound: 3,
      active: false,
      paid: true,
      condition: "standard",
      temperature: "standard",
      loc: { kind: "floor", x: 5 + i, y: 3 },
    });
  game.step(44);
  assert.equal(game.status, "playing");
  game = restore(serialize(game));
  game.step(2.2);
  game.step(1.1);
  assert.equal(game.status, "summary");
  const report = game.settlement!;
  assert.deepEqual(
    report.trips.map((trip) => trip.seconds),
    [30, 45],
  );
  assert.equal(report.transport, 75);
  assert.equal(report.ramps, 20);
  assert.equal(
    report.cash,
    report.before + report.totalRevenue - report.totalCosts,
  );
  game = restore(serialize(game));
  assert.equal(game.cash, report.cash);
  assert.equal(game.completeRound(), false);
  assert.equal(game.ledger.filter((entry) => entry.tripId).length, 2);
  assert.ok(game.beginDevelopment());
  assert.equal(game.round, 2);
  game.nextRound();
  assert.equal(game.round, 3);
});

test("three ramps and three employees are first charged after the investment phase", () => {
  const game = new CampaignGame();
  game.round = 5;
  game.startRound();
  game.money(600, "Stan testowy");
  const secondWorker = new WarehouseWorker(game);
  secondWorker.pose = { x: 17, y: 1, d: 4 };
  game.workers.push(secondWorker);
  const finishWithHeldStock = () => {
    game.cmrs.forEach((cmr) => (cmr.state = "done"));
    for (let i = game.stock.length; i < game.config.expectedStock; i++)
      game.crates.push({
        id: `stock-${i}`,
        color: "red",
        destinationColor: "red",
        dispatchRound: 7,
        active: false,
        paid: true,
        condition: "standard",
        temperature: "standard",
        loc: { kind: "floor", x: 1 + (i % 18), y: Math.floor(i / 18) },
      });
    game.step(0.1);
    assert.equal(game.status, "summary");
    return game.settlement!;
  };

  assert.equal(game.buyModule("receiving"), false);
  const previous = finishWithHeldStock();
  assert.equal(previous.ramps, 20);
  assert.equal(previous.wages, 40);
  assert.ok(game.beginDevelopment());
  assert.ok(game.buyModule("storage"));
  assert.ok(game.buyModule("receiving"));
  assert.ok(game.buy("worker"));
  assert.equal(game.settlement?.ramps, 20);

  game.nextRound();
  assert.equal(game.round, 6);
  assert.equal(game.rampCount, 3);
  assert.equal(game.workers.length, 3);
  const report = finishWithHeldStock();
  assert.equal(report.wages, 60);
  assert.equal(report.ramps, 30);
});
