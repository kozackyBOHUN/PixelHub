import { test } from "node:test";
import assert from "node:assert/strict";
import { CampaignGame } from "../src/campaign-game.ts";
import { restore, serialize } from "../src/save.ts";
import { locationPoint } from "../src/simulation.ts";
import type { Crate } from "../src/simulation.ts";
import { drain } from "../src/developer.ts";
import { vehicleLengthSource } from "../src/graphics/scene.ts";

function readyPallet(
  id: string,
  color: "red" | "blue" | "green",
  loc: Crate["loc"],
): Crate {
  return {
    id,
    color,
    destinationColor: color,
    dispatchRound: 2,
    active: true,
    paid: true,
    temperature: "standard",
    condition: "standard",
    loc,
  };
}

test("early investment access, exact prices, per-truck capacities and saved pending purchases", () => {
  let game = new CampaignGame();
  game.round = 2;
  game.startRound();
  game.money(2000, "Test");
  game.status = "summary";
  assert.ok(game.beginDevelopment());
  assert.equal(game.upgradeUnavailable("worker"), undefined);
  assert.equal(game.upgradeUnavailable("sorter"), undefined);
  assert.equal(
    game.vehiclePurchaseReason(),
    "Wymagane minimum 2 rampy wysyłkowe",
  );
  assert.equal(game.buyVehicle(), false);
  const cash = game.cash;
  assert.ok(game.buyModule("storage"));
  assert.equal(game.cash, cash - 200);
  assert.ok(game.buyModule("receiving"));
  assert.equal(game.buyVehicle(), false);
  assert.ok(game.buyModule("shipping"));
  assert.equal(game.trucks.length, 1);
  assert.ok(game.buyVehicle(0));
  assert.ok(game.buyVehicle(0));
  assert.ok(game.buyVehicle());
  assert.equal(game.cash, cash - 1500);
  assert.deepEqual(game.fleetCapacity, [4]);
  assert.deepEqual(game.plannedFleet, [8, 4]);
  game = restore(serialize(game));
  assert.deepEqual(game.plannedFleet, [8, 4]);
  assert.equal(game.minY, -4);
  assert.equal(game.bayCount, 2);
  game.nextRound();
  assert.deepEqual(
    game.trucks.map((truck) => truck.capacity),
    [8, 4],
  );
  assert.ok(vehicleLengthSource(8) > vehicleLengthSource(6));
  assert.ok(vehicleLengthSource(6) > vehicleLengthSource(4));

  const cargo = readyPallet("far-slot", "red", { kind: "floor", x: 17, y: 3 });
  game.crates.push(cargo);
  game.selectWorker();
  assert.ok(game.choose(cargo.id));
  assert.equal(
    game.order({ kind: "outbound", bay: 0, lane: 0, depth: 4 }),
    false,
  );
  assert.ok(
    game.order({ kind: "outbound", bay: 0, lane: 0, depth: 3 }),
    game.message,
  );
  drain(game);
  assert.deepEqual(locationPoint(cargo.loc), { x: 23, y: 1 });
  game.assertInvariant();
});

test("six non-overlapping ramps support real docking and independent concurrent deliveries", () => {
  let game = new CampaignGame();
  game.round = 2;
  game.startRound();
  game.money(3000, "Test");
  game.status = "summary";
  assert.ok(game.beginDevelopment());
  for (const zone of ["storage","receiving","shipping"] as const) {
    assert.ok(game.buyModule(zone));
    assert.ok(game.buyModule(zone));
  }
  assert.ok(game.buyVehicle());
  assert.ok(game.buyVehicle());
  game.nextRound();
  assert.deepEqual(
    [0, 1, 2].map((bay) => game.rampRow(bay)),
    [1, -3, -7],
  );
  assert.equal(game.rampCount, 6);
  assert.equal(game.trucks.length, 3);
  for (const [bay, manifest] of game.cmrs.entries())
    assert.ok(game.dockCMR(manifest.id, bay), game.message);
  game.step(1.1);
  const incoming = game.slot("inbound", 0, 0, 2)!;
  assert.deepEqual(locationPoint(incoming.loc), { x: -1, y: -7 });
  game.selectWorker();
  assert.ok(game.choose(incoming.id));
  assert.ok(game.order({ kind: "floor", x: 3, y: -8 }), game.message);
  drain(game);
  game.crates.push(
    ...(["red", "blue", "green"] as const).map((color, i) =>
      readyPallet(
        `test-${i}`,
        color,
        game.locateSlot({
          kind: "outbound",
          bay: i ? 2 : 0,
          lane: i === 2 ? 1 : 0,
          depth: 1,
        }),
      ),
    ),
  );
  assert.ok(game.dispatchBay(0));
  assert.ok(game.dispatchBay(2));
  game.step(15);
  game = restore(serialize(game));
  assert.equal(
    game.trucks.filter((truck) => truck.state === "in-transit").length,
    2,
  );
  game.step(16.2);
  game.step(1.1);
  assert.equal(game.shippingAt(0)?.state, "docked");
  assert.equal(game.shippingAt(2)?.state, "in-transit");
  game.step(16.2);
  game.step(1.1);
  assert.equal(game.shippingAt(2)?.state, "docked");
  assert.deepEqual(
    game
      .roundReport()
      .trips.map((trip) => [trip.vehicleId, trip.seconds, trip.cost]),
    [
      ["Własny 1", 30, 30],
      ["Własny 3", 45, 45],
    ],
  );
  assert.equal(game.roundReport().transport, 75);
});

test("capacity beyond ten grows the physical trailer and remains navigable", () => {
  const game = new CampaignGame();
  game.round = 2;
  game.startRound();
  game.money(300, "Test");
  game.status = "summary";
  assert.ok(game.beginDevelopment());
  for (let upgrade = 0; upgrade < 4; upgrade++) assert.ok(game.buyVehicle(0));
  game.nextRound();
  assert.equal(game.shippingAt()?.capacity, 12);
  const cargo = readyPallet("deep-twelve", "red", {
    kind: "floor",
    x: 17,
    y: 3,
  });
  game.crates.push(cargo);
  game.selectWorker();
  assert.ok(game.choose(cargo.id));
  assert.ok(
    game.order({ kind: "outbound", bay: 0, lane: 1, depth: 5 }),
    game.message,
  );
  drain(game);
  assert.deepEqual(locationPoint(cargo.loc), { x: 25, y: 2 });
  game.assertInvariant();
});
