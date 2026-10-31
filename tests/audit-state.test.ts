import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/simulation.ts";
import { finish, move } from "./helpers.ts";

function ready() {
  const game = new Game();
  game.accept();
  game.advance(1.1);
  return game;
}

function ordered() {
  const game = ready();
  game.selectWorker();
  assert.ok(game.choose("1-0-0"), game.message);
  assert.ok(game.order({ kind: "floor", x: 2, y: 3 }), game.message);
  return game;
}

function until(game: Game, predicate: () => boolean) {
  for (let tick = 0; tick < 4000 && game.status === "playing"; tick++) {
    if (predicate()) return;
    game.advance(0.05);
    game.assertInvariant();
  }
  assert.fail(`Condition not reached: ${game.transportState}, ${game.message}`);
}

test("dispatch invalidates a selected cargo source before the bus leaves", () => {
  const game = ready();
  game.round = 2;
  game.outbound = "docked";
  game.crates.forEach((crate) => (crate.active = true));
  move(game, "1-0-0", { kind: "outbound", lane: 0, depth: 0 });
  game.selectWorker();
  assert.ok(game.choose("1-0-0"), game.message);
  assert.ok(game.dispatch());
  assert.equal(game.source, null);
  assert.equal(game.order({ kind: "floor", x: 16, y: 4 }), false);
  game.advance(30);
  assert.equal(game.crates[0].loc.kind, "delivered");
  assert.equal(game.carried, null);
  assert.equal(
    game.ledger.filter((entry) => entry.label === "Dostawa").length,
    1,
  );
});

test("ordering cannot reclaim a stale source already carried by a moving bus", () => {
  const game = ready();
  game.round = 2;
  game.outbound = "docked";
  game.crates.forEach((crate) => (crate.active = true));
  move(game, "1-0-0", { kind: "outbound", lane: 0, depth: 0 });
  assert.ok(game.dispatch());
  game.selectWorker();
  game.source = "1-0-0";
  assert.equal(game.order({ kind: "floor", x: 16, y: 4 }), false);
  assert.equal(game.task, null);
  assert.equal(game.crates[0].loc.kind, "delivery");
});

test("ordering cannot reclaim a delivered crate for a second delivery reward", () => {
  const game = ready();
  game.round = 2;
  game.outbound = "docked";
  game.crates.forEach((crate) => (crate.active = true));
  move(game, "1-0-0", { kind: "outbound", lane: 0, depth: 0 });
  assert.ok(game.dispatch());
  game.advance(30);
  game.selectWorker();
  game.source = "1-0-0";
  assert.equal(game.order({ kind: "floor", x: 16, y: 4 }), false);
  assert.equal(game.crates[0].loc.kind, "delivered");
  assert.equal(
    game.ledger.filter((entry) => entry.label === "Dostawa").length,
    1,
  );
});

test("cancelling again during pickup recovery finishes a finite withdrawal", () => {
  const game = ordered();
  until(game, () => game.task?.phase === "LIFT");
  game.advance(0.2);
  game.cancel();
  until(
    game,
    () => !!game.task?.recovery && game.task.phase === "WITHDRAW_FORKS",
  );
  game.advance(0.2);
  game.cancel();
  until(game, () => !game.task?.cancelRequested);
  assert.ok(game.task?.steps.every((step) => Number.isFinite(step.duration)));
  finish(game);
  assert.equal(game.carried, null);
  assert.equal(game.crates[0].loc.kind, "inbound");
  assert.equal(
    game.ledger.filter((entry) => entry.label === "Rozładunek").length,
    0,
  );
  assert.ok(game.choose("1-0-0") === false, "Recovery clears worker selection");
});

test("an accepted destination remains stable when the caller reuses its object", () => {
  const game = ready();
  game.selectWorker();
  assert.ok(game.choose("1-0-0"));
  const destination = { kind: "floor" as const, x: 2, y: 3 };
  assert.ok(game.order(destination), game.message);
  destination.x = 17;
  destination.y = 4;
  finish(game);
  assert.deepEqual(game.crates[0].loc, { kind: "floor", x: 2, y: 3 });
});

test("invalid elapsed time cannot poison the deterministic game clock", () => {
  for (const elapsed of [-1, NaN, Infinity, -Infinity]) {
    const game = new Game();
    game.advance(elapsed);
    assert.equal(game.time, 0);
    assert.equal(game.cash, 50);
    assert.equal(game.status, "playing");
    game.advance(1);
    assert.equal(game.time, 1);
    game.assertInvariant();
  }
});

test("cancelling before and after lowering preserves ownership and one-time rewards", () => {
  for (const phase of ["LIFT", "LOWER", "WITHDRAW_FORKS", "EXIT"] as const) {
    const game = ordered();
    until(game, () => game.task?.phase === phase);
    game.advance(0.15);
    const deposited = !!game.task?.deposited;
    game.cancel();
    game.cancel();
    finish(game);
    assert.equal(game.crates.length, 4);
    assert.equal(
      game.crates.filter((crate) => crate.loc.kind === "worker").length,
      game.carried ? 1 : 0,
    );
    assert.equal(
      game.ledger.filter((entry) => entry.label === "Rozładunek").length,
      deposited ? 1 : 0,
    );
    if (phase === "LOWER") {
      assert.equal(game.carried, "1-0-0");
      assert.ok(game.order({ kind: "floor", x: 2, y: 3 }), game.message);
      finish(game);
      assert.equal(
        game.ledger.filter((entry) => entry.label === "Rozładunek").length,
        1,
      );
    }
    const ledger = structuredClone(game.ledger);
    game.cancel();
    assert.deepEqual(game.ledger, ledger);
    game.assertInvariant();
  }
});

test("mixed-color delivery returns after 45 game seconds across speed changes", () => {
  const game = ready();
  game.round = 2;
  game.outbound = "docked";
  game.crates.forEach((crate) => (crate.active = true));
  move(game, "1-0-0", { kind: "outbound", lane: 0, depth: 1 });
  move(game, "1-1-0", { kind: "outbound", lane: 1, depth: 1 });
  const departed = game.time;
  assert.ok(game.dispatch());
  assert.equal(game.deliveryRemaining, 45);
  assert.equal(game.dispatch(), false);
  game.advance(10);
  game.speed = 2;
  game.advance(10);
  game.speed = 4;
  game.advance(3.7375);
  assert.equal(game.time, departed + 44.95);
  assert.equal(game.outbound, "delivering");
  assert.equal(
    game.crates.filter((crate) => crate.loc.kind === "delivery").length,
    2,
  );
  assert.equal(
    game.ledger.filter((entry) => entry.label === "Dostawa").length,
    0,
  );
  game.advance(0.0125);
  assert.equal(game.time, departed + 45);
  assert.equal(game.outbound, "docked");
  assert.equal(
    game.crates.filter((crate) => crate.loc.kind === "delivered").length,
    2,
  );
  assert.deepEqual(
    game.ledger
      .filter((entry) => entry.label === "Dostawa")
      .map((entry) => entry.amount),
    [40],
  );
  assert.equal(game.dispatch(), false);
  game.assertInvariant();
});
