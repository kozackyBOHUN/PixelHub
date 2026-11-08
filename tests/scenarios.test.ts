import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { campaign } from "../src/campaign.ts";
import { restore } from "../src/save.ts";
import { CampaignGame, WarehouseWorker } from "../src/campaign-game.ts";
test("0.2 all 30 developer fixtures are real versioned entry states matching manifests", () => {
  const data = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("../public/campaign-scenarios.json.gz", import.meta.url),
      ),
    ).toString(),
  );
  assert.equal(data.version, 3);
  assert.equal(data.campaign, JSON.stringify(campaign));
  for (let n = 1; n <= 30; n++) {
    const g = restore(data.scenarios[n]);
    assert.equal(g.round, n);
    assert.equal(g.status, "playing");
    assert.equal(g.stock.length, n === 1 ? 0 : campaign[n - 2].expectedStock);
    assert.equal(g.settled.length, n - 1);
    assert.deepEqual(
      g.cmrs.filter((m) => m.kind === "inbound").map((m) => m.palletIds),
      campaign[n - 1].arrivals.map((m) => m.palletIds),
    );
    g.assertInvariant();
  }
});
test("0.2 two employees cost exactly 40 USD once on settlement, never per minute", () => {
  const g = new CampaignGame();
  const worker = new WarehouseWorker(g);
  worker.pose = { x: 17, y: 1, d: 4 };
  g.workers.push(worker);
  g.advance(200);
  assert.equal(g.cash, 50);
  for (let i = 0; i < 4; i++)
    g.crates.push({
      id: `fixture-${i}`,
      color: "gray",
      active: false,
      paid: true,
      dueRound: 2,
      temperature: "standard",
      condition: "standard",
      loc: { kind: "floor", x: [3, 2, 1, 16][i], y: 5 },
    });
  g.cmrs.forEach((m) => (m.state = "done"));
  assert.ok(g.completeRound());
  assert.equal(g.cash, 30);
  assert.equal(
    g.ledger
      .filter((e) => e.label === "Pensja — runda 1")
      .reduce((s, e) => s + e.amount, 0),
    -40,
  );
  assert.equal(g.completeRound(), false);
  assert.equal(g.cash, 30);
});
