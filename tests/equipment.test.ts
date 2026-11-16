import test from "node:test";
import assert from "node:assert/strict";
import { CampaignGame, sorterPorts } from "../src/campaign-game.ts";
import { serialize, restore } from "../src/save.ts";
test("cold pack, invalid tile, dispersed cells and save", () => {
  const g = new CampaignGame();
  g.money(900, "Test");
  g.status = "summary";
  g.beginDevelopment();
  const before = g.cash;
  assert.ok(g.buyColdPack());
  assert.equal(g.cash, before - 140);
  assert.equal(g.coldStock, 4);
  assert.equal(g.placeColdCell({ x: 0, y: 1 }), false);
  assert.ok(g.placeColdCell({ x: 6, y: 0 }));
  assert.ok(g.placeColdCell({ x: 9, y: 3 }));
  assert.equal(g.placeColdCell({ x: 9, y: 3 }), false);
  const restored = restore(serialize(g));
  assert.equal(restored.coldStock, 2);
  assert.equal(restored.zoneAt({ x: 9, y: 3 }), "chilled");
  assert.ok(g.buy("equipment"));
  assert.ok(restore(serialize(g)).usesPiesek);
});
test("MIX waits for two inputs and both outputs, then emits both once", () => {
  const g = new CampaignGame();
  g.round = 8;
  g.startRound();
  g.levels.storage = 2;
  g.sorter = { x: 9, y: -2, d: 0 };
  const port = sorterPorts(g.sorter);
  const recipe = g.config.recipes[0];
  const specs = recipe.inputs.map((id) =>
    g.config.pallets.find((p) => p.id === id)!,
  );
  g.crates.push(g.createPallet(specs[0], { kind: "floor", ...port.input2 }));
  g.processStations();
  assert.equal(g.sorterJobs.length, 0);
  g.crates.push(g.createPallet(specs[1], { kind: "floor", ...port.input }));
  const blocker = g.createPallet(
    { ...specs[0], id: "blocker" },
    { kind: "floor", ...port.output },
  );
  g.crates.push(blocker);
  g.processStations();
  assert.equal(g.sorterJobs.length, 0);
  blocker.loc = { kind: "delivered" };
  g.processStations();
  assert.equal(g.sorterJobs.length, 1);
  g.time += 2;
  g.processStations();
  g.processStations();
  assert.deepEqual(g.completedRecipes, [recipe.id]);
  assert.deepEqual(
    recipe.outputs.map((p) => g.crates.find((c) => c.id === p.id)?.loc),
    [
      { kind: "floor", ...port.output },
      { kind: "floor", ...port.output2 },
    ],
  );
});
test("electric equipment accelerates a loaded step by 1.5 and leaves empty movement alone", () => {
  const make = () => {
    const g = new CampaignGame();
    const m = g.cmrs[0];
    g.dockCMR(m.id);
    g.step(1.1);
    g.selectWorker();
    assert.ok(g.choose(g.crates[0].id));
    assert.ok(g.order({ kind: "floor", x: 8, y: 3 }));
    return g;
  };
  const normal = make(),
    electric = make();
  electric.purchased.push("equipment");
  normal.step(0.01);
  electric.step(0.01);
  assert.equal(normal.task?.elapsed, electric.task?.elapsed);
  for (const g of [normal, electric])
    for (let i = 0; !g.carried && i < 5000; i++) g.step(0.01);
  assert.ok(normal.carried && electric.carried);
  normal.step(0.01);
  electric.step(0.01);
  assert.ok(
    Math.abs(electric.task!.elapsed / normal.task!.elapsed - 1.5) < 1e-6,
  );
  for (const g of [normal, electric]) {
    for (let i = 0; g.task && i < 10000; i++) g.step(0.01);
    assert.equal(g.task, null);
    assert.deepEqual(g.crates[0].loc, { kind: "floor", x: 8, y: 3 });
  }
});
