import assert from "node:assert/strict";
import test from "node:test";
import { CampaignGame, quoteDelivery } from "../src/campaign-game.ts";
import { createRegistry } from "../src/graphics/assets.ts";
import { SceneBuilder } from "../src/graphics/scene.ts";
import { findPath } from "../src/pathfinding.ts";
import { restore, serialize } from "../src/save.ts";

test("three independent modules restore without moving cargo or workers", () => {
  const game = new CampaignGame();
  const scene = new SceneBuilder(createRegistry());
  const tiles = () =>
    scene.build(game).commands.filter((c) => c.id.startsWith("floor/")).length;
  assert.equal(tiles(), 80);
  game.status = "summary";
  assert.ok(game.beginDevelopment());
  game.money(1200, "Test");
  const pose = structuredClone(game.pose);
  const before = game.cash;
  assert.ok(game.buyModule("receiving"));
  assert.ok(game.buyModule("shipping"));
  assert.equal(game.cash, before - 400);
  assert.equal(tiles(), 112);
  assert.equal(game.contains({ x: 8, y: -2 }), false);
  assert.equal(game.planningFree()({ x: 8, y: -2 }), false);
  assert.ok(
    findPath(
      { x: 7, y: 1, d: 4 },
      (p) => p.x === 1 && p.y === -2,
      game.planningFree(),
    ),
  );
  assert.deepEqual(game.pose, pose);
  assert.ok(game.buyVehicle());
  assert.ok(game.buyModule("storage"));
  assert.equal(tiles(), 160);
  const saved = restore(serialize(game));
  assert.deepEqual(saved.levels, { receiving: 2, storage: 2, shipping: 2 });
  assert.deepEqual(saved.plannedFleet, [4, 4]);
});

test("the inherited transport quote and dated crate labels match the requested behavior", () => {
  const game = new CampaignGame();
  const spec = game.config.pallets[0];
  const cargo = (["red", "red", "blue"] as const).map((color, i) =>
    game.createPallet(
      { ...spec, id: "test-" + i, color, destinationColor: color },
      { kind: "floor", x: 8 + i, y: 3 },
    ),
  );
  game.crates.push(...cargo);
  assert.deepEqual(quoteDelivery(cargo), {
    colors: ["red", "blue"],
    seconds: 45,
    cost: 45,
  });
  const commands = new SceneBuilder(createRegistry()).build(game).commands;
  assert.equal(
    commands.filter((c) => c.kind === "asset" && c.assetId === "cargo/box/gray")
      .length,
    3,
  );
  assert.equal(
    commands.filter((c) => c.id.endsWith("/recipient-label")).length,
    3,
  );
});
