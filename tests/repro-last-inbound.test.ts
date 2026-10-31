import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/simulation.ts";
import { findPath } from "../src/pathfinding.ts";
import { planTransport } from "../src/transport.ts";
import { finish } from "./helpers.ts";

function screenshotState() {
  const game = new Game();
  game.accept();
  game.advance(1.1);
  const placed = [
    ["1-0-0", 4, 0],
    ["1-1-0", 5, 0],
    ["1-1-1", 7, 0],
  ] as const;
  for (const [id, x, y] of placed) {
    const crate = game.crates.find((c) => c.id === id)!;
    crate.loc = { kind: "floor", x, y };
    crate.paid = true;
  }
  game.pose = { x: 7, y: 2, d: 2, mode: "pull" };
  game.assertInvariant();
  return game;
}

test("screenshot regression: the old south-facing drop creates a real geometric deadlock", () => {
  const game = screenshotState();
  const lastCrate = game.crates.find((c) => c.id === "1-0-1")!;
  assert.equal(game.accessible(lastCrate.loc), true);
  // This state cannot be repaired by simply ignoring an obstruction:
  // employee is between the new crate and the non-walkable social rooms.
  assert.equal(
    findPath(game.pose, (p) => game.contact(lastCrate.loc, p), game.planningFree()),
    null,
  );
});

test("look-ahead rejects the trapping drop direction and preserves access to the last crate", () => {
  const game = new Game();
  game.accept();
  game.advance(1.1);
  for (const [id, x] of [["1-0-0", 4], ["1-1-0", 5]] as const) {
    const crate = game.crates.find((c) => c.id === id)!;
    crate.loc = { kind: "floor", x, y: 0 };
    crate.paid = true;
  }
  const moving = game.crates.find((c) => c.id === "1-1-1")!;
  moving.loc = { kind: "worker" };
  game.carried = moving.id;
  game.pose = { x: 8, y: 2, d: 0, mode: "pull" };
  game.selected = true;
  game.assertInvariant();

  const source = { x: 7, y: 2 };
  const dest = { x: 7, y: 0 };
  // Without the forward-access check, south is faster, but strands the jack.
  const south = planTransport(
    game.pose, source, dest, game.planningFree(), game.planningFree(moving.id),
    undefined, 2, true,
  );
  assert.equal(south, null, "South-side deposit must be rejected as a deadlock");

  const east = planTransport(
    game.pose, source, dest, game.planningFree(), game.planningFree(moving.id),
    undefined, 0, true,
  );
  assert.ok(east, "The alternate east-side placement is physically possible");

  assert.ok(game.order({ kind: "floor", ...dest }), game.message);
  assert.equal(game.task!.steps.find((s) => s.phase === "LOWER")!.a.d, 0);
  finish(game);
  assert.deepEqual(moving.loc, { kind: "floor", x: 7, y: 0 });
  assert.equal(game.task, null);
  assert.equal(game.carried, null);
  assert.ok(game.pose.x >= 8, "Worker must finish on the accessible side");
  game.selectWorker();
  assert.ok(game.choose("1-0-1"), game.message);
  assert.ok(game.order({ kind: "floor", x: 2, y: 5 }), game.message);
  finish(game);
  assert.deepEqual(
    game.crates.find((crate) => crate.id === "1-0-1")!.loc,
    { kind: "floor", x: 2, y: 5 },
  );
  game.assertInvariant();
});
